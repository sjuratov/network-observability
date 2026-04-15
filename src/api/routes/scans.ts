import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import { runScan, deduplicateResults, detectSubnets } from '../scanner/discovery.js';

interface DbScanRow {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  devices_found: number | null;
  new_devices: number | null;
  subnets_scanned: string | null;
  errors: string | null;
  scan_intensity: string | null;
  created_at: string | null;
}

interface DbScanResultRow {
  id: number;
  scan_id: string;
  device_id: string | null;
  mac_address: string | null;
  ip_address: string | null;
  hostname: string | null;
  vendor: string | null;
  discovery_method: string | null;
  open_ports: string | null;
  created_at: string | null;
}

function rowToScan(row: DbScanRow) {
  return {
    id: row.id,
    status: row.status as 'pending' | 'in-progress' | 'completed' | 'failed',
    startedAt: row.started_at ?? '',
    completedAt: row.completed_at ?? undefined,
    devicesFound: row.devices_found ?? 0,
    newDevices: row.new_devices ?? 0,
    subnetsScanned: row.subnets_scanned ? JSON.parse(row.subnets_scanned) : [],
    errors: row.errors ? JSON.parse(row.errors) : [],
    scanIntensity: row.scan_intensity ?? 'normal',
  };
}

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

export async function scanRoutes(fastify: FastifyInstance) {
  fastify.get('/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit || '25', 10), 100);
    const cursor = parseInt(query.cursor || '0', 10);

    const countRow = raw.prepare('SELECT COUNT(*) as cnt FROM scans').get() as { cnt: number };
    const total = countRow.cnt;

    const rows = raw
      .prepare('SELECT * FROM scans ORDER BY started_at DESC LIMIT ? OFFSET ?')
      .all(limit, cursor) as DbScanRow[];

    const hasMore = cursor + limit < total;

    return {
      data: rows.map(rowToScan),
      meta: {
        timestamp: new Date().toISOString(),
        pagination: {
          limit,
          hasMore,
          nextCursor: hasMore ? String(cursor + limit) : null,
          total,
        },
      },
    };
  });

  fastify.get('/scans/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const { id } = request.params as { id: string };
    const row = raw.prepare('SELECT * FROM scans WHERE id = ?').get(id) as DbScanRow | undefined;

    if (!row) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Scan ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    const results = raw
      .prepare('SELECT * FROM scan_results WHERE scan_id = ?')
      .all(id) as DbScanResultRow[];

    const scan = rowToScan(row);

    return {
      data: {
        ...scan,
        results: results.map(r => ({
          macAddress: r.mac_address ?? '',
          ipAddress: r.ip_address ?? '',
          hostname: r.hostname ?? undefined,
          vendor: r.vendor ?? undefined,
          discoveryMethod: r.discovery_method ?? '',
        })),
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.post('/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();

    // Check if a scan is already running
    const running = raw
      .prepare("SELECT id FROM scans WHERE status = 'in-progress' LIMIT 1")
      .get() as { id: string } | undefined;

    if (running) {
      reply.status(409);
      return {
        error: { code: 'CONFLICT', message: 'A scan is already in progress' },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    const scanId = randomUUID();
    const now = new Date().toISOString();
    const configuredSubnets = (fastify as any).appConfig?.subnets;
    const subnets = configuredSubnets && configuredSubnets.length > 0 ? configuredSubnets : detectSubnets();
    const intensity = (fastify as any).appConfig?.scanIntensity || 'normal';

    raw.prepare(
      `INSERT INTO scans (id, status, started_at, subnets_scanned, scan_intensity, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(scanId, 'in-progress', now, JSON.stringify(subnets), intensity, now);

    // Kick off scan async — don't block the response
    setImmediate(async () => {
      try {
        const scanResult = await runScan({ subnets, intensity });
        const deviceResults = (scanResult as any).results || [];
        console.log(`Scan completed: subnets=${JSON.stringify(subnets)}, ${scanResult.devicesFound} found, ${deviceResults.length} results to store`);
        const completedAt = new Date().toISOString();
        const durationMs = new Date(completedAt).getTime() - new Date(now).getTime();

        // Upsert devices and store scan_results
        let newDeviceCount = 0;
        const upsertDevice = raw.prepare(
          `INSERT INTO devices (id, mac_address, ip_address, hostname, vendor, is_online, first_seen_at, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
           ON CONFLICT(mac_address) DO UPDATE SET
             ip_address = excluded.ip_address,
             hostname = COALESCE(excluded.hostname, devices.hostname),
             vendor = COALESCE(excluded.vendor, devices.vendor),
             is_online = 1,
             last_seen_at = excluded.last_seen_at,
             updated_at = excluded.updated_at`,
        );
        const insertResult = raw.prepare(
          `INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, hostname, vendor, discovery_method, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        const upsertMany = raw.transaction((devices: typeof deviceResults) => {
          for (const dev of devices) {
            const deviceId = randomUUID();
            const mac = dev.macAddress || `unknown-${dev.ipAddress}`;
            
            // Check if device already exists
            const existing = raw.prepare('SELECT id FROM devices WHERE mac_address = ?').get(mac) as { id: string } | undefined;
            if (!existing) newDeviceCount++;
            
            const existingId = existing?.id || deviceId;
            upsertDevice.run(existingId, mac, dev.ipAddress, dev.hostname || null, dev.vendor || null, completedAt, completedAt, completedAt, completedAt);
            
            const actualId = (raw.prepare('SELECT id FROM devices WHERE mac_address = ?').get(mac) as { id: string }).id;
            insertResult.run(scanId, actualId, mac, dev.ipAddress, dev.hostname || null, dev.vendor || null, dev.discoveryMethod, completedAt);
          }
        });
        upsertMany(deviceResults);

        raw.prepare(
          `UPDATE scans SET status = ?, completed_at = ?, duration_ms = ?, devices_found = ?, new_devices = ?, errors = ?
           WHERE id = ?`,
        ).run(
          scanResult.errors.length > 0 && deviceResults.length === 0 ? 'failed' : 'completed',
          completedAt,
          durationMs,
          deviceResults.length,
          newDeviceCount,
          JSON.stringify(scanResult.errors),
          scanId,
        );
      } catch (err) {
        console.error('Scan pipeline error:', err);
        const completedAt = new Date().toISOString();
        const errMsg = err instanceof Error ? err.message : String(err);
        raw.prepare(
          `UPDATE scans SET status = ?, completed_at = ?, errors = ? WHERE id = ?`,
        ).run('failed', completedAt, JSON.stringify([errMsg]), scanId);
      }
    });

    const scan = raw.prepare('SELECT * FROM scans WHERE id = ?').get(scanId) as DbScanRow;
    reply.status(201);

    return {
      data: rowToScan(scan),
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
