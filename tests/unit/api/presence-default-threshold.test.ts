import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { authMiddleware } from '@api/middleware/auth.js';
import { deviceRoutes } from '@api/routes/devices.js';
import { statsRoutes } from '@api/routes/stats.js';

function createTestDb() {
  const raw = new BetterSqlite3(':memory:');
  raw.exec(`
    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      mac_address TEXT UNIQUE,
      ip_address TEXT,
      hostname TEXT,
      vendor TEXT,
      display_name TEXT,
      is_known INTEGER DEFAULT 0,
      is_online INTEGER DEFAULT 1,
      first_seen_at TEXT,
      last_seen_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      seen_scan_count INTEGER DEFAULT 1,
      missed_scan_count INTEGER DEFAULT 0
    );
    CREATE TABLE device_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      tag TEXT,
      created_at TEXT
    );
    CREATE TABLE scans (
      id TEXT PRIMARY KEY,
      status TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      devices_found INTEGER,
      new_devices INTEGER,
      subnets_scanned TEXT,
      errors TEXT,
      scan_intensity TEXT,
      created_at TEXT
    );
  `);

  raw.prepare(
    `INSERT INTO devices (
      id, mac_address, ip_address, hostname, vendor, display_name,
      is_known, is_online, first_seen_at, last_seen_at, created_at, updated_at,
      seen_scan_count, missed_scan_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'device-threshold-001',
    'AA:BB:CC:DD:EE:27',
    '192.168.1.227',
    'stale-presence-host',
    'Unknown',
    'Stale Presence Host',
    0,
    1,
    '2026-04-18T00:00:00.000Z',
    '2026-04-18T08:00:00.000Z',
    '2026-04-18T00:00:00.000Z',
    '2026-04-19T08:30:00.000Z',
    2,
    1,
  );

  raw.prepare(
    `INSERT INTO scans (
      id, status, started_at, completed_at, duration_ms, devices_found,
      new_devices, subnets_scanned, errors, scan_intensity, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'scan-threshold-001',
    'completed',
    '2026-04-19T08:00:00.000Z',
    '2026-04-19T08:30:00.000Z',
    1800000,
    10,
    0,
    '["192.168.1.0/24"]',
    '[]',
    'normal',
    '2026-04-19T08:00:00.000Z',
  );

  return {
    initialize: async () => {},
    close: () => raw.close(),
    getDb: () => raw,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const db = createTestDb();
  app.decorate('db', db);
  app.addHook('onRequest', authMiddleware);
  await app.register(deviceRoutes, { prefix: '/api/v1' });
  await app.register(statsRoutes, { prefix: '/api/v1' });
  return app;
}

describe('Default presence threshold contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('treats a device missed by one completed scan as offline by default', async () => {
    // Proposed contract update: global default becomes 1 missed completed scan.
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices?status=offline',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 'device-threshold-001',
      status: 'offline',
      isOnline: false,
    });
  });

  it('counts a device missed by one completed scan in the dashboard offline metric by default', async () => {
    // Proposed contract update: global default becomes 1 missed completed scan.
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stats/overview',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.offlineDevices).toBe(1);
  });
});
