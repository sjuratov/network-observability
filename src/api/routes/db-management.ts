import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/database.js';
import { runRetentionCleanup } from '../db/retention.js';

interface TableCount {
  cnt: number;
}

interface PragmaResult {
  page_count?: number;
  page_size?: number;
}

let lastCleanupAt: string | null = null;

export function setLastCleanupAt(ts: string | null) {
  lastCleanupAt = ts;
}

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

function getRetentionDays(fastify: FastifyInstance): number {
  const configured = (fastify as FastifyInstance & {
    appConfig?: { retentionDays?: number };
  }).appConfig?.retentionDays;
  return typeof configured === 'number' && configured > 0 ? configured : 180;
}

function tableRowCount(raw: ReturnType<Database['getDb']>, table: string): number {
  const row = raw.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as TableCount;
  return row.cnt;
}

function validationError(reply: FastifyReply, message: string) {
  reply.status(400);
  return {
    error: { code: 'VALIDATION_ERROR', message },
    meta: { timestamp: new Date().toISOString() },
  };
}

export async function dbManagementRoutes(fastify: FastifyInstance) {

  // GET /db/stats — database health metrics (F4.10)
  fastify.get('/db/stats', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();

    const tables: Record<string, number> = {
      devices: tableRowCount(raw, 'devices'),
      scans: tableRowCount(raw, 'scans'),
      scan_results: tableRowCount(raw, 'scan_results'),
      device_history: tableRowCount(raw, 'device_history'),
      device_tags: tableRowCount(raw, 'device_tags'),
    };

    const pageCount = (raw.pragma('page_count') as PragmaResult[])[0]?.page_count ?? 0;
    const pageSize = (raw.pragma('page_size') as PragmaResult[])[0]?.page_size ?? 0;
    const dbSizeBytes = pageCount * pageSize;

    let walSizeBytes = 0;
    try {
      const walPages = (raw.pragma('wal_checkpoint(PASSIVE)') as Array<{ busy: number; log: number; checkpointed: number }>)[0];
      walSizeBytes = (walPages?.log ?? 0) * pageSize;
    } catch {
      // WAL info unavailable (in-memory DB or disabled WAL)
    }

    return {
      data: {
        tables,
        dbSizeBytes,
        walSizeBytes,
        retentionDays: getRetentionDays(fastify),
        lastCleanupAt,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });

  // POST /db/cleanup — manual data cleanup (F4.11)
  fastify.post('/db/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const body = request.body as { keepDays?: unknown } | null;

    if (body?.keepDays === undefined || body?.keepDays === null) {
      return validationError(reply, 'keepDays is required (integer >= 0)');
    }

    const keepDays = body.keepDays;
    if (typeof keepDays !== 'number' || !Number.isInteger(keepDays) || keepDays < 0) {
      return validationError(reply, 'keepDays must be a non-negative integer');
    }

    const result = runRetentionCleanup(raw, keepDays);
    lastCleanupAt = new Date().toISOString();

    return {
      data: result,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  // POST /db/factory-reset — wipe all user data (F4.12)
  fastify.post('/db/factory-reset', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const body = request.body as { confirm?: unknown } | null;

    if (body?.confirm !== true) {
      return validationError(reply, 'Factory reset requires { "confirm": true }');
    }

    // Delete in FK-safe order: children first
    const scanResultsDeleted = raw.prepare('DELETE FROM scan_results').run().changes;
    const scansDeleted = raw.prepare('DELETE FROM scans').run().changes;
    const deviceHistoryDeleted = raw.prepare('DELETE FROM device_history').run().changes;
    const deviceTagsDeleted = raw.prepare('DELETE FROM device_tags').run().changes;
    const devicesDeleted = raw.prepare('DELETE FROM devices').run().changes;

    lastCleanupAt = new Date().toISOString();

    return {
      data: {
        devicesDeleted,
        scansDeleted,
        scanResultsDeleted,
        deviceHistoryDeleted,
        deviceTagsDeleted,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
