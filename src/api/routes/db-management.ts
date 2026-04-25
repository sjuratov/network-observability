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

export async function dbManagementRoutes(fastify: FastifyInstance) {
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

    // DB size via pragma
    const pageCount = (raw.pragma('page_count') as PragmaResult[])[0]?.page_count ?? 0;
    const pageSize = (raw.pragma('page_size') as PragmaResult[])[0]?.page_size ?? 0;
    const dbSizeBytes = pageCount * pageSize;

    // WAL size via pragma (0 for in-memory or when WAL is empty)
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

  fastify.post('/db/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const body = request.body as { retentionDays?: unknown } | null;

    let retentionDays = getRetentionDays(fastify);

    if (body?.retentionDays !== undefined) {
      const val = body.retentionDays;
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 1) {
        reply.status(400);
        return {
          error: { code: 'VALIDATION_ERROR', message: 'retentionDays must be a positive integer' },
          meta: { timestamp: new Date().toISOString() },
        };
      }
      retentionDays = val;
    }

    const result = runRetentionCleanup(raw, retentionDays);
    lastCleanupAt = new Date().toISOString();

    return {
      data: result,
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
