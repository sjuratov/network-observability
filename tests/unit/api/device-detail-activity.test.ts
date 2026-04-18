import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { authMiddleware } from '@api/middleware/auth.js';
import { deviceRoutes } from '@api/routes/devices.js';

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
    CREATE TABLE device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT
    );
  `);

  raw.prepare(
    `INSERT INTO devices (id, mac_address, ip_address, hostname, vendor, display_name, is_known, is_online, first_seen_at, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'device-001',
    'AA:BB:CC:DD:EE:01',
    '192.168.1.42',
    'living-room-tv',
    'Fixture Labs',
    'Smart TV',
    1,
    1,
    '2026-04-15T07:00:00Z',
    '2026-04-18T09:45:00Z',
    '2026-04-15T07:00:00Z',
    '2026-04-18T09:45:00Z',
  );

  const insertHistory = raw.prepare(
    'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
  );
  insertHistory.run('device-001', 'ipAddress', '192.168.1.25', '192.168.1.42', '2026-04-18T09:45:00Z');
  insertHistory.run('device-001', 'presence', 'offline', 'online', '2026-04-18T08:30:00Z');
  insertHistory.run('device-001', 'presence', 'online', 'offline', '2026-04-17T23:10:00Z');

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
  return app;
}

describe('Device detail activity history API contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns structured sections for the Activity tab instead of a raw history array', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/device-001/history',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      presenceSummary: expect.objectContaining({
        status: 'online',
        firstSeenAt: '2026-04-15T07:00:00Z',
        lastSeenAt: '2026-04-18T09:45:00Z',
      }),
      ipHistory: expect.arrayContaining([
        expect.objectContaining({
          ipAddress: '192.168.1.42',
        }),
      ]),
      activityEvents: expect.arrayContaining([
        expect.objectContaining({
          type: 'ip-change',
        }),
        expect.objectContaining({
          type: 'presence-online',
        }),
      ]),
    });
  });

  it('returns empty structured sections when a legacy record has no activity transitions', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/device-999/history',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      presenceSummary: expect.any(Object),
      ipHistory: [],
      activityEvents: [],
    });
  });
});
