import { beforeAll, afterAll, describe, expect, it } from 'vitest';
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
      updated_at TEXT
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
    `INSERT INTO devices (id, mac_address, ip_address, hostname, vendor, display_name, is_known, is_online, first_seen_at, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'device-offline-001',
    'AA:BB:CC:DD:EE:99',
    '192.168.1.99',
    'offline-printer',
    'HP',
    'Offline Printer',
    0,
    0,
    '2024-01-01T00:00:00.000Z',
    '2024-01-10T00:00:00.000Z',
    '2024-01-01T00:00:00.000Z',
    '2024-01-10T00:00:00.000Z',
  );

  raw.prepare(
    `INSERT INTO scans (id, status, started_at, completed_at, duration_ms, devices_found, new_devices, subnets_scanned, errors, scan_intensity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'scan-001',
    'completed',
    '2024-01-10T00:00:00.000Z',
    '2024-01-10T00:05:00.000Z',
    300000,
    1,
    0,
    '["192.168.1.0/24"]',
    '[]',
    'normal',
    '2024-01-10T00:00:00.000Z',
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

describe('Device list status reconciliation API contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return a presence status enum alongside the legacy isOnline field for offline devices', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices?status=offline',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe('offline');
    expect(body.data[0].isOnline).toBe(false);
  });

  it('should reject unsupported status filters with a validation error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices?status=archived',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
