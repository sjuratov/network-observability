import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import type { Database } from '../db/database.js';
import { runScan, deduplicateResults, detectSubnets } from '../scanner/discovery.js';
import { scanPorts } from '../scanner/ports.js';

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

        // Port scan all discovered devices in one nmap call
        console.log(`Starting port scan for ${deviceResults.length} devices...`);
        const portRange = (fastify as any).appConfig?.portRange || '';
        try {
          const { execFile: execFileCb } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execFileAsync = promisify(execFileCb);
          const deviceIps = deviceResults.map((d: any) => d.ipAddress);
          
          // Use SYN scan if privileged (Linux host networking), TCP connect otherwise
          const scanType = process.getuid?.() === 0 ? '-sS' : '-sT';
          // Use --top-ports for best coverage, or explicit list if configured
          const portArgs = portRange ? ['-p', portRange] : ['--top-ports', '100'];
          const nmapArgs = [scanType, '-T4', ...portArgs, ...deviceIps, '-oX', '-'];
          console.log(`Port scan command: nmap ${nmapArgs.slice(0, 5).join(' ')} ... (${deviceIps.length} IPs)`);
          
          // nmap may exit non-zero when some hosts have filtered ports — still has valid XML
          let portXml = '';
          try {
            const result = await execFileAsync('nmap', nmapArgs, { timeout: 180000, maxBuffer: 10 * 1024 * 1024 });
            portXml = result.stdout;
          } catch (nmapErr: any) {
            // execFile rejects on non-zero exit, but stdout may still have results
            if (nmapErr.stdout) {
              console.log(`Port scan exited with code ${nmapErr.code || 'unknown'}, but has XML output — parsing results`);
              portXml = nmapErr.stdout;
            } else {
              throw nmapErr;
            }
          }
          console.log(`Port scan XML length: ${portXml.length}`);
          
          // Parse port results and assign to devices
          const { XMLParser: XP } = await import('fast-xml-parser');
          const pparser = new XP({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const pdoc = pparser.parse(portXml);
          const phosts = Array.isArray(pdoc?.nmaprun?.host) ? pdoc.nmaprun.host : pdoc?.nmaprun?.host ? [pdoc.nmaprun.host] : [];
          console.log(`Port scan parsed ${phosts.length} hosts`);
          
          let devicesWithPorts = 0;
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
          console.log(`Port scan complete — ${devicesWithPorts}/${phosts.length} devices have open ports`);
        } catch (err) {
          console.error('Port scan failed:', err instanceof Error ? err.stack : err);
        }

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
          `INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, hostname, vendor, discovery_method, open_ports, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        const upsertMany = raw.transaction((devices: typeof deviceResults) => {
          let portsStored = 0;
          for (const dev of devices) {
            const deviceId = randomUUID();
            const mac = dev.macAddress || `unknown-${dev.ipAddress}`;
            
            // Check if device already exists
            const existing = raw.prepare('SELECT id FROM devices WHERE mac_address = ?').get(mac) as { id: string } | undefined;
            if (!existing) newDeviceCount++;
            
            const existingId = existing?.id || deviceId;
            upsertDevice.run(existingId, mac, dev.ipAddress, dev.hostname || null, dev.vendor || null, completedAt, completedAt, completedAt, completedAt);
            
            const actualId = (raw.prepare('SELECT id FROM devices WHERE mac_address = ?').get(mac) as { id: string }).id;
            const portsJson = dev.openPorts ? JSON.stringify(dev.openPorts) : null;
            if (portsJson) portsStored++;
            insertResult.run(scanId, actualId, mac, dev.ipAddress, dev.hostname || null, dev.vendor || null, dev.discoveryMethod, portsJson, completedAt);
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
