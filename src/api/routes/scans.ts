import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Database } from '../db/database.js';
import { runScan, detectSubnets } from '../scanner/discovery.js';
import {
  buildNmapPortArgs,
  buildPortScanBatches,
  extractNmapXmlPayload,
  resolvePortScanBatchSize,
} from '../scanner/ports.js';
import { getPresenceOfflineThreshold } from '../presence/device-status.js';
import { runRetentionCleanup } from '../db/retention.js';
import { setLastCleanupAt } from './db-management.js';

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

interface ExistingDeviceRow {
  id: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_scan_count: number | null;
  missed_scan_count: number | null;
}

function ensurePresenceTrackingColumns(raw: Database['getDb'] extends () => infer T ? T : never) {
  const columns = raw.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('seen_scan_count')) {
    raw.exec('ALTER TABLE devices ADD COLUMN seen_scan_count INTEGER DEFAULT 0');
  }

  if (!columnNames.has('missed_scan_count')) {
    raw.exec('ALTER TABLE devices ADD COLUMN missed_scan_count INTEGER DEFAULT 0');
  }
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
  fastify.get('/scans', async (request: FastifyRequest) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit || '25', 10), 100);
    const cursor = parseInt(query.cursor || '0', 10);
    const statusFilter = query.status;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (statusFilter) {
      conditions.push('status = ?');
      params.push(statusFilter);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = raw.prepare(`SELECT COUNT(*) as cnt FROM scans ${where}`).get(...params) as { cnt: number };
    const total = countRow.cnt;

    const rows = raw
      .prepare(`SELECT * FROM scans ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, cursor) as DbScanRow[];

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
          openPorts: r.open_ports ? JSON.parse(r.open_ports) : undefined,
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
        ensurePresenceTrackingColumns(raw);

        // Enrich with reverse DNS lookups
        await Promise.allSettled(deviceResults.map(async (dev: any) => {
          if (!dev.hostname && dev.ipAddress) {
            try {
              const hostnames = await dns.promises.reverse(dev.ipAddress);
              if (hostnames.length > 0) {
                dev.hostname = hostnames[0];
              }
            } catch { /* ignore DNS lookup failures */ }
          }
        }));

        // Port scan discovered devices in batches so one slow group does not sink the whole enrichment pass
        console.log(`Starting port scan for ${deviceResults.length} devices...`);
        const portRange = (fastify as any).appConfig?.portRange || '';
        try {
          const { execFile: execFileCb } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execFileAsync = promisify(execFileCb);
          const deviceIps = deviceResults.map((d: any) => d.ipAddress);
          
          // Use SYN scan if privileged (Linux host networking), TCP connect otherwise
          const scanType = process.getuid?.() === 0 ? '-sS' : '-sT';
          const portArgs = buildNmapPortArgs(portRange);
          const configuredHostTimeoutSeconds = Number.parseInt(process.env['PORT_SCAN_HOST_TIMEOUT'] ?? '120', 10);
          const perHostTimeoutMs = Number.isFinite(configuredHostTimeoutSeconds) && configuredHostTimeoutSeconds > 0
            ? configuredHostTimeoutSeconds * 1000
            : 120_000;
          const batchSize = resolvePortScanBatchSize(process.env['PORT_SCAN_BATCH_SIZE']);
          const portScanBatches = buildPortScanBatches(deviceIps, {
            batchSize,
            hostCount: deviceIps.length,
            perHostTimeoutMs,
            minimumTimeoutMs: 180_000,
          });

          let devicesWithPorts = 0;
          let parsedHosts = 0;
          for (const [batchIndex, batch] of portScanBatches.entries()) {
            const tempDir = mkdtempSync(path.join(tmpdir(), 'netobserver-nmap-'));
            const xmlOutputFile = path.join(tempDir, 'port-scan.xml');
            const nmapArgs = [scanType, '-T4', ...portArgs, ...batch.targets, '-oX', xmlOutputFile];
            console.log(`Port scan batch ${batchIndex + 1}/${portScanBatches.length}: nmap ${nmapArgs.slice(0, 5).join(' ')} ... (${batch.targets.length} IPs)`);
            console.log(`Port scan batch timeout: ${batch.timeoutMs}ms (${batch.targets.length} hosts at ${perHostTimeoutMs}ms each)`);

            let portXml = '';
            try {
              try {
                await execFileAsync('nmap', nmapArgs, { timeout: batch.timeoutMs, maxBuffer: 10 * 1024 * 1024 });
              } catch (nmapErr: any) {
                if (!existsSync(xmlOutputFile)) {
                  throw nmapErr;
                }
                console.log(`Port scan batch ${batchIndex + 1} exited with code ${nmapErr.code || 'unknown'}, but XML file exists — parsing results`);
              }

              if (!existsSync(xmlOutputFile)) {
                throw new Error(`Port scan did not produce XML output at ${xmlOutputFile}`);
              }

              portXml = readFileSync(xmlOutputFile, 'utf8');
            } finally {
              rmSync(tempDir, { recursive: true, force: true });
            }

            console.log(`Port scan batch XML length: ${portXml.length}`);

            const { XMLParser: XP } = await import('fast-xml-parser');
            const pparser = new XP({ ignoreAttributes: false, attributeNamePrefix: '@_' });
            const pdoc = pparser.parse(extractNmapXmlPayload(portXml));
            const phosts = Array.isArray(pdoc?.nmaprun?.host) ? pdoc.nmaprun.host : pdoc?.nmaprun?.host ? [pdoc.nmaprun.host] : [];
            parsedHosts += phosts.length;
            console.log(`Port scan batch ${batchIndex + 1} parsed ${phosts.length} hosts`);

            for (const phost of phosts) {
              const addrs = Array.isArray(phost.address) ? phost.address : phost.address ? [phost.address] : [];
              const hostIp = addrs.find((a: any) => a['@_addrtype'] === 'ipv4')?.['@_addr'];
              if (!hostIp) continue;

              const dev = deviceResults.find((d: any) => d.ipAddress === hostIp);
              if (!dev) continue;

              const portsNode = phost.ports?.port;
              const portList = Array.isArray(portsNode) ? portsNode : portsNode ? [portsNode] : [];
              const openPorts = portList
                .filter((p: any) => p.state?.['@_state'] === 'open')
                .map((p: any) => ({
                  port: parseInt(p['@_portid'], 10),
                  protocol: p['@_protocol'] || 'tcp',
                  state: 'open',
                  service: p.service?.['@_name'] || null,
                  version: p.service?.['@_product'] ? `${p.service['@_product']} ${p.service['@_version'] || ''}`.trim() : null,
                }));

              if (openPorts.length > 0) {
                dev.openPorts = openPorts;
                devicesWithPorts++;
              }
            }
          }
          console.log(`Port scan complete — ${devicesWithPorts}/${parsedHosts} parsed hosts have open ports across ${portScanBatches.length} batches`);
        } catch (err) {
          console.error('Port scan failed:', err instanceof Error ? err.stack : err);
        }

        const completedAt = new Date().toISOString();
        const durationMs = new Date(completedAt).getTime() - new Date(now).getTime();
        const presenceOfflineThreshold = getPresenceOfflineThreshold(fastify);

        // Upsert devices and store scan_results
        let newDeviceCount = 0;
        const findExistingDevice = raw.prepare(
          'SELECT id, first_seen_at, last_seen_at, seen_scan_count, missed_scan_count FROM devices WHERE mac_address = ?',
        );
        const insertDevice = raw.prepare(
          `INSERT INTO devices (
             id, mac_address, ip_address, hostname, vendor, is_online,
             seen_scan_count, missed_scan_count, first_seen_at, last_seen_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const updateSeenDevice = raw.prepare(
          `UPDATE devices
           SET ip_address = ?,
               hostname = COALESCE(?, hostname),
               vendor = COALESCE(?, vendor),
               is_online = ?,
               seen_scan_count = ?,
               missed_scan_count = 0,
               last_seen_at = ?,
               updated_at = ?
           WHERE id = ?`,
        );
        const updateMissingDevice = raw.prepare(
          `UPDATE devices
           SET is_online = ?,
               missed_scan_count = ?,
               updated_at = ?
           WHERE id = ?`,
        );
        const insertResult = raw.prepare(
          `INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, hostname, vendor, discovery_method, open_ports, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        const upsertMany = raw.transaction((devices: typeof deviceResults) => {
          let portsStored = 0;
          const seenMacs = new Set<string>();
          for (const dev of devices) {
            const deviceId = randomUUID();
            const mac = dev.macAddress || `unknown-${dev.ipAddress}`;
            seenMacs.add(mac);

            const existing = findExistingDevice.get(mac) as ExistingDeviceRow | undefined;
            let actualId: string = deviceId;

            if (existing) {
              const priorSeenCount = existing.seen_scan_count
                ?? (
                  existing.first_seen_at
                  && existing.last_seen_at
                  && existing.first_seen_at === existing.last_seen_at
                    ? 1
                    : 2
                );
              const nextSeenCount = priorSeenCount + 1;
              const isOnline = nextSeenCount > 1 ? 1 : 0;
              actualId = existing.id;
              updateSeenDevice.run(
                dev.ipAddress,
                dev.hostname || null,
                dev.vendor || null,
                isOnline,
                nextSeenCount,
                completedAt,
                completedAt,
                actualId,
              );
            } else {
              newDeviceCount++;
              insertDevice.run(
                deviceId,
                mac,
                dev.ipAddress,
                dev.hostname || null,
                dev.vendor || null,
                0,
                1,
                0,
                completedAt,
                completedAt,
                completedAt,
                completedAt,
              );
            }

            const portsJson = dev.openPorts ? JSON.stringify(dev.openPorts) : null;
            if (portsJson) portsStored++;
            insertResult.run(scanId, actualId, mac, dev.ipAddress, dev.hostname || null, dev.vendor || null, dev.discoveryMethod, portsJson, completedAt);
          }

          const missingDevices = seenMacs.size > 0
            ? raw.prepare(
              `SELECT id, first_seen_at, last_seen_at, seen_scan_count, missed_scan_count
               FROM devices
               WHERE mac_address NOT IN (${Array.from(seenMacs).map(() => '?').join(',')})`,
            ).all(...Array.from(seenMacs)) as ExistingDeviceRow[]
            : raw.prepare(
              'SELECT id, first_seen_at, last_seen_at, seen_scan_count, missed_scan_count FROM devices',
            ).all() as ExistingDeviceRow[];

          for (const device of missingDevices) {
            const priorSeenCount = device.seen_scan_count
              ?? (
                device.first_seen_at
                && device.last_seen_at
                && device.first_seen_at === device.last_seen_at
                  ? 1
                  : 2
              );
            const nextMissedCount = (device.missed_scan_count ?? 0) + 1;
            const isOnline = priorSeenCount > 1 && nextMissedCount < presenceOfflineThreshold ? 1 : 0;
            updateMissingDevice.run(isOnline, nextMissedCount, completedAt, device.id);
          }

          console.log(`DB upsert: ${devices.length} devices, ${portsStored} with ports stored`);
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

        // Run retention cleanup after scan completes (non-blocking)
        try {
          const retentionDays = (fastify as any).appConfig?.dataRetentionDays ?? 365;
          const cleanupResult = runRetentionCleanup(raw, retentionDays);
          if (cleanupResult.scansDeleted > 0 || cleanupResult.scanResultsDeleted > 0 || cleanupResult.historyDeleted > 0) {
            console.log(`Post-scan retention cleanup: ${cleanupResult.scansDeleted} scans, ${cleanupResult.scanResultsDeleted} scan_results, ${cleanupResult.historyDeleted} history entries deleted (${cleanupResult.durationMs}ms)`);
          }
          setLastCleanupAt(new Date().toISOString());
        } catch (cleanupErr) {
          console.error('Post-scan retention cleanup failed:', cleanupErr);
        }
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
