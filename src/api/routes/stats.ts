import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/database.js';

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();

    const totalRow = raw.prepare('SELECT COUNT(*) as cnt FROM devices').get() as { cnt: number };
    const onlineRow = raw.prepare('SELECT COUNT(*) as cnt FROM devices WHERE is_online = 1').get() as { cnt: number };
    const offlineRow = raw.prepare('SELECT COUNT(*) as cnt FROM devices WHERE is_online = 0').get() as { cnt: number };
    const newRow = raw.prepare(
      "SELECT COUNT(*) as cnt FROM devices WHERE first_seen_at > datetime('now', '-1 day')",
    ).get() as { cnt: number };

    const lastScan = raw.prepare(
      'SELECT started_at, completed_at, status FROM scans ORDER BY started_at DESC LIMIT 1',
    ).get() as { started_at: string; completed_at: string | null; status: string } | undefined;

    return {
      data: {
        totalDevices: totalRow.cnt,
        newDevices24h: newRow.cnt,
        offlineDevices: offlineRow.cnt,
        lastScanAt: lastScan?.completed_at ?? lastScan?.started_at ?? null,
        lastScanStatus: lastScan?.status ?? null,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
