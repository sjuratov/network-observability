import { FastifyInstance } from 'fastify';
import type { Database } from '../db/database.js';
import {
  buildDeviceSelectClause,
  derivePresenceStatus,
  getPresenceOfflineThreshold,
} from '../presence/device-status.js';

interface DbDeviceStatsRow {
  is_online: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_scan_count?: number | null;
  missed_scan_count?: number | null;
}

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async () => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const offlineThreshold = getPresenceOfflineThreshold(fastify);
    const deviceRows = raw
      .prepare(`SELECT ${buildDeviceSelectClause(raw, offlineThreshold)} FROM devices`)
      .all() as DbDeviceStatsRow[];

    const totalDevices = deviceRows.length;
    const offlineDevices = deviceRows.filter((row) => derivePresenceStatus(row, offlineThreshold) === 'offline').length;
    const newDevices24h = deviceRows.filter((row) => {
      if (!row.first_seen_at) {
        return false;
      }
      return Date.now() - new Date(row.first_seen_at).getTime() < 24 * 60 * 60 * 1000;
    }).length;

    const lastScan = raw.prepare(
      'SELECT started_at, completed_at, status FROM scans ORDER BY started_at DESC LIMIT 1',
    ).get() as { started_at: string; completed_at: string | null; status: string } | undefined;

    return {
      data: {
        totalDevices,
        onlineDevices: totalDevices - offlineDevices,
        newDevices24h,
        offlineDevices,
        lastScanAt: lastScan?.completed_at ?? lastScan?.started_at ?? null,
        lastScanStatus: lastScan?.status ?? null,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
