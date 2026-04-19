import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';
import { armActivityHistoryFailure, armFullInventoryFailure, resetTestSupportState } from './test-support-state.js';

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

function resetFixtures(raw: ReturnType<Database['getDb']>) {
  raw.exec(`
    DELETE FROM scan_results;
    DELETE FROM device_tags;
    DELETE FROM device_history;
    DELETE FROM scans;
    DELETE FROM devices;
  `);
}

function insertDeviceFixture(
  raw: ReturnType<Database['getDb']>,
  {
    id = randomUUID(),
    macAddress,
    ipAddress,
    displayName,
    isKnown,
    seenScanCount,
    missedScanCount,
    isOnline,
    firstSeenAt,
    lastSeenAt,
  }: {
    id?: string;
    macAddress: string;
    ipAddress: string;
    displayName: string;
    isKnown: boolean;
    seenScanCount: number;
    missedScanCount: number;
    isOnline: boolean;
    firstSeenAt: string;
    lastSeenAt: string;
  },
) {
  raw.prepare(`
    INSERT INTO devices (
      id, mac_address, ip_address, hostname, vendor, display_name,
      is_known, is_online, seen_scan_count, missed_scan_count,
      first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    macAddress,
    ipAddress,
    displayName.toLowerCase().replace(/\s+/g, '-'),
    'Fixture',
    displayName,
    isKnown ? 1 : 0,
    isOnline ? 1 : 0,
    seenScanCount,
    missedScanCount,
    firstSeenAt,
    lastSeenAt,
    firstSeenAt,
    lastSeenAt,
  );

  return id;
}

function insertCompletedScanFixture(raw: ReturnType<Database['getDb']>, timestamp: string) {
  const scanId = randomUUID();
  raw.prepare(`
    INSERT INTO scans (id, status, started_at, completed_at, duration_ms, devices_found, new_devices, subnets_scanned, errors, scan_intensity, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId,
    'completed',
    timestamp,
    timestamp,
    1000,
    1,
    0,
    '["192.168.1.0/24"]',
    '[]',
    'normal',
    timestamp,
  );

  return scanId;
}

function insertOpenPortsFixture(raw: ReturnType<Database['getDb']>, scanId: string, deviceId: string, timestamp: string) {
  raw.prepare(`
    INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, hostname, vendor, discovery_method, open_ports, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId,
    deviceId,
    'AA:BB:CC:DD:EE:01',
    '192.168.1.42',
    'fixture-device',
    'Fixture Labs',
    'arp',
    JSON.stringify([
      { port: 22, protocol: 'tcp', state: 'open', service: 'ssh', version: 'OpenSSH 9.7' },
      { port: 443, protocol: 'tcp', state: 'open', service: 'https', version: 'nginx 1.25.3' },
    ]),
    timestamp,
  );
}

function insertPortFixture(
  raw: ReturnType<Database['getDb']>,
  scanId: string,
  deviceId: string,
  timestamp: string,
  fixture: 'mixed-version-ports' | 'no-version-ports',
) {
  const openPorts = fixture === 'no-version-ports'
    ? [
        { port: 53, protocol: 'udp', state: 'open', service: 'dns', version: '' },
        { port: 161, protocol: 'udp', state: 'open', service: 'snmp', version: '' },
      ]
    : [
        { port: 22, protocol: 'tcp', state: 'open', service: 'ssh', version: 'OpenSSH 9.7' },
        { port: 161, protocol: 'udp', state: 'open', service: 'snmp', version: '' },
      ];

  raw.prepare(`
    INSERT INTO scan_results (scan_id, device_id, mac_address, ip_address, hostname, vendor, discovery_method, open_ports, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    scanId,
    deviceId,
    'AA:BB:CC:DD:EE:01',
    '192.168.1.42',
    'fixture-device',
    'Fixture Labs',
    'arp',
    JSON.stringify(openPorts),
    timestamp,
  );
}

function insertHistoryChange(
  raw: ReturnType<Database['getDb']>,
  deviceId: string,
  fieldName: string,
  oldValue: string,
  newValue: string,
  changedAt: string,
) {
  raw.prepare(
    'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
  ).run(deviceId, fieldName, oldValue, newValue, changedAt);
}

export async function testSupportRoutes(fastify: FastifyInstance) {
  fastify.post('/test-support/presence-snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as {
      offlineDevices?: number;
      threshold?: number;
      scansSeen?: number;
      resultingStatus?: 'online' | 'offline' | 'unknown';
      latestCompletedScanStatus?: 'online' | 'offline' | 'unknown';
    };
    const threshold = body.threshold ?? 1;
    const now = new Date().toISOString();
    const earlier = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    resetFixtures(raw);
    resetTestSupportState();
    insertCompletedScanFixture(raw, now);

    if (body.offlineDevices && body.offlineDevices > 0) {
      for (let index = 0; index < body.offlineDevices; index += 1) {
        insertDeviceFixture(raw, {
          macAddress: `AA:BB:CC:DD:EE:${String(index + 1).padStart(2, '0')}`,
          ipAddress: `192.168.1.${100 + index}`,
          displayName: `Offline Device ${index + 1}`,
          isKnown: true,
          seenScanCount: 2,
          missedScanCount: threshold,
          isOnline: false,
          firstSeenAt: earlier,
          lastSeenAt: earlier,
        });
      }
    } else {
      const scansSeen = body.scansSeen ?? 1;
      const resultingStatus = body.resultingStatus ?? body.latestCompletedScanStatus ?? 'unknown';
      insertDeviceFixture(raw, {
        macAddress: 'AA:BB:CC:DD:EE:50',
        ipAddress: '192.168.1.50',
        displayName: 'Observed Device',
        isKnown: false,
        seenScanCount: scansSeen,
        missedScanCount: resultingStatus === 'offline' ? threshold : 0,
        isOnline: resultingStatus === 'online',
        firstSeenAt: earlier,
        lastSeenAt: scansSeen <= 1 ? earlier : now,
      });
    }

    reply.status(201);
    return { data: { ok: true }, meta: { timestamp: now } };
  });

  fastify.post('/test-support/devices', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as { lifecycleState?: 'new' | 'known'; displayName?: string };
    const now = new Date().toISOString();

    resetFixtures(raw);
    resetTestSupportState();
    insertCompletedScanFixture(raw, now);
    const id = insertDeviceFixture(raw, {
      macAddress: 'AA:BB:CC:DD:EE:60',
      ipAddress: '192.168.1.60',
      displayName: body.displayName ?? 'Fixture Device',
      isKnown: body.lifecycleState === 'known',
      seenScanCount: 1,
      missedScanCount: 0,
      isOnline: false,
      firstSeenAt: now,
      lastSeenAt: now,
    });

    reply.status(201);
    return { data: { id }, meta: { timestamp: now } };
  });

  fastify.post('/test-support/presence-events', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as {
      lifecycleState?: 'new' | 'known';
      resultingStatus?: 'online' | 'offline' | 'unknown';
      threshold?: number;
    };
    const threshold = body.threshold ?? 1;
    const now = new Date().toISOString();
    const device = raw.prepare('SELECT id FROM devices ORDER BY created_at DESC LIMIT 1').get() as { id: string } | undefined;

    if (!device) {
      const id = insertDeviceFixture(raw, {
        macAddress: 'AA:BB:CC:DD:EE:61',
        ipAddress: '192.168.1.61',
        displayName: 'Fixture Device',
        isKnown: body.lifecycleState === 'known',
        seenScanCount: 1,
        missedScanCount: 0,
        isOnline: false,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      raw.prepare('UPDATE devices SET seen_scan_count = ?, missed_scan_count = ?, is_online = ?, updated_at = ? WHERE id = ?')
        .run(2, body.resultingStatus === 'offline' ? threshold : 0, body.resultingStatus === 'online' ? 1 : 0, now, id);
    } else {
      raw.prepare('UPDATE devices SET seen_scan_count = ?, missed_scan_count = ?, is_online = ?, updated_at = ? WHERE id = ?')
        .run(2, body.resultingStatus === 'offline' ? threshold : 0, body.resultingStatus === 'online' ? 1 : 0, now, device.id);
    }

    reply.status(201);
    return { data: { ok: true }, meta: { timestamp: now } };
  });

  fastify.post('/test-support/device-inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as { fixture?: string };
    const now = new Date();

    if (body.fixture !== 'page-size-controls') {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'Unsupported device inventory fixture' }, meta: { timestamp: now.toISOString() } };
    }

    resetFixtures(raw);
    resetTestSupportState();
    insertCompletedScanFixture(raw, now.toISOString());

    for (let index = 1; index <= 120; index += 1) {
      const createdAt = new Date(now.getTime() - index * 60_000).toISOString();
      const isOfflinePrinter = index <= 12;
      insertDeviceFixture(raw, {
        id: `device-${String(index).padStart(3, '0')}`,
        macAddress: `AA:BB:CC:DD:EE:${String(index).padStart(2, '0')}`,
        ipAddress: `192.168.1.${index}`,
        displayName: isOfflinePrinter ? `Printer ${index}` : `Device ${index}`,
        isKnown: true,
        seenScanCount: 3,
        missedScanCount: isOfflinePrinter ? 2 : 0,
        isOnline: !isOfflinePrinter,
        firstSeenAt: createdAt,
        lastSeenAt: createdAt,
      });
    }

    reply.status(201);
    return { data: { ok: true, totalDevices: 120 }, meta: { timestamp: now.toISOString() } };
  });

  fastify.post('/test-support/device-inventory-errors', async (_request: FastifyRequest, reply: FastifyReply) => {
    armFullInventoryFailure();
    const now = new Date().toISOString();

    reply.status(201);
    return { data: { ok: true }, meta: { timestamp: now } };
  });

  fastify.post('/test-support/scan-history', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as { fixture?: string };
    const now = new Date();

    if (body.fixture !== 'pagination-controls') {
      reply.status(400);
      return { error: { code: 'VALIDATION_ERROR', message: 'Unsupported scan history fixture' }, meta: { timestamp: now.toISOString() } };
    }

    resetFixtures(raw);
    resetTestSupportState();

    const ids: string[] = [];
    for (let index = 1; index <= 16; index += 1) {
      const timestamp = new Date(now.getTime() - index * 60_000).toISOString();
      const scanId = `scan-fixture-${String(index).padStart(2, '0')}`;
      raw.prepare(`
        INSERT INTO scans (id, status, started_at, completed_at, duration_ms, devices_found, new_devices, subnets_scanned, errors, scan_intensity, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        scanId,
        'completed',
        timestamp,
        timestamp,
        1000,
        index,
        index === 1 ? 1 : 0,
        '["192.168.1.0/24"]',
        '[]',
        'normal',
        timestamp,
      );
      ids.push(scanId);
    }

    reply.status(201);
    return {
      data: {
        ids,
        firstPageIds: ids.slice(0, 10),
        secondPageIds: ids.slice(10),
      },
      meta: { timestamp: now.toISOString() },
    };
  });

  fastify.post('/test-support/device-detail-activity', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as {
      deviceId?: string;
      historyRows?: number;
      activityEvents?: Array<{ label?: string; timestamp: string }>;
      legacyMode?: 'ip-only' | 'missing-sections';
      portFixture?: 'mixed-version-ports' | 'no-version-ports';
    };
    const now = new Date().toISOString();
    const deviceId = body.deviceId ?? 'device-001';
    const historyRows = Math.max(body.historyRows ?? 1, 1);
    const currentIpAddress = body.legacyMode === 'missing-sections'
      ? ''
      : ((body.activityEvents ?? [])
        .find((event) => (event.label ?? '').includes('IP changed to '))
        ?.label?.split('IP changed to ')[1] ?? '192.168.1.42');
    const ipAddresses = body.legacyMode === 'missing-sections'
      ? []
      : Array.from({ length: historyRows }, (_, index) => (
          index === historyRows - 1 ? currentIpAddress : `192.168.1.${10 + index * 15}`
        ));

    resetFixtures(raw);
    resetTestSupportState();
    const scanId = insertCompletedScanFixture(raw, now);
    insertDeviceFixture(raw, {
      id: deviceId,
      macAddress: 'AA:BB:CC:DD:EE:01',
      ipAddress: currentIpAddress,
      displayName: `Fixture Device ${deviceId}`,
      isKnown: true,
      seenScanCount: 4,
      missedScanCount: 0,
      isOnline: true,
      firstSeenAt: '2026-04-15T07:00:00Z',
      lastSeenAt: '2026-04-18T09:45:00Z',
    });
    if (body.portFixture) {
      insertPortFixture(raw, scanId, deviceId, now, body.portFixture);
    } else {
      insertOpenPortsFixture(raw, scanId, deviceId, now);
    }

    for (let index = 0; index < ipAddresses.length - 1; index += 1) {
      insertHistoryChange(
        raw,
        deviceId,
        'ipAddress',
        ipAddresses[index],
        ipAddresses[index + 1],
        `2026-04-${String(15 + index).padStart(2, '0')}T09:45:00Z`,
      );
    }

    if (body.legacyMode !== 'missing-sections' && body.legacyMode !== 'ip-only') {
      for (const event of body.activityEvents ?? []) {
        if ((event.label ?? '').includes('came online')) {
          insertHistoryChange(raw, deviceId, 'presence', 'offline', 'online', event.timestamp);
        } else if ((event.label ?? '').includes('went offline')) {
          insertHistoryChange(raw, deviceId, 'presence', 'online', 'offline', event.timestamp);
        } else if ((event.label ?? '').includes('IP changed to')) {
          const nextValue = (event.label ?? '').split('IP changed to ')[1] ?? currentIpAddress;
          const previousValue = ipAddresses.length > 1 ? ipAddresses[ipAddresses.length - 2] : currentIpAddress;
          if (previousValue && nextValue && previousValue !== nextValue) {
            insertHistoryChange(raw, deviceId, 'ipAddress', previousValue, nextValue, event.timestamp);
          }
        }
      }
    }

    reply.status(201);
    return { data: { deviceId }, meta: { timestamp: now } };
  });

  fastify.post('/test-support/device-detail-activity-errors', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as { deviceId?: string };
    const now = new Date().toISOString();
    const deviceId = body.deviceId ?? 'device-001';

    resetFixtures(raw);
    resetTestSupportState();
    insertCompletedScanFixture(raw, now);
    insertDeviceFixture(raw, {
      id: deviceId,
      macAddress: 'AA:BB:CC:DD:EE:09',
      ipAddress: '192.168.1.90',
      displayName: `Broken Activity ${deviceId}`,
      isKnown: true,
      seenScanCount: 3,
      missedScanCount: 0,
      isOnline: true,
      firstSeenAt: '2026-04-15T07:00:00Z',
      lastSeenAt: '2026-04-18T09:45:00Z',
    });
    armActivityHistoryFailure(deviceId);

    reply.status(201);
    return { data: { deviceId }, meta: { timestamp: now } };
  });

  fastify.post('/test-support/scans/current', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = getDb(fastify).getDb();
    const body = request.body as { status?: 'pending' | 'in-progress' | 'completed' | 'failed' };
    const now = new Date().toISOString();
    raw.prepare("DELETE FROM scans WHERE status = 'in-progress'").run();
    raw.prepare(`
      INSERT INTO scans (id, status, started_at, completed_at, duration_ms, devices_found, new_devices, subnets_scanned, errors, scan_intensity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      body.status ?? 'in-progress',
      now,
      null,
      null,
      0,
      0,
      '["192.168.1.0/24"]',
      '[]',
      'normal',
      now,
    );

    reply.status(202);
    return { data: { ok: true }, meta: { timestamp: now } };
  });
}
