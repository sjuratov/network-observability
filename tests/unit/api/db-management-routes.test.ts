import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { dbManagementRoutes } from '@api/routes/db-management.js';
import { authMiddleware } from '@api/middleware/auth.js';

const VALID_API_KEY = 'test-api-key-valid';

function createTestDb() {
  const raw = new BetterSqlite3(':memory:');
  raw.pragma('journal_mode = WAL');

  raw.exec(`
    CREATE TABLE IF NOT EXISTS devices (
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
    CREATE TABLE IF NOT EXISTS scans (
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
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT,
      device_id TEXT,
      mac_address TEXT,
      ip_address TEXT,
      hostname TEXT,
      vendor TEXT,
      discovery_method TEXT,
      open_ports TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS device_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      tag TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS runtime_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE,
      applied_at TEXT
    );
  `);

  return {
    initialize: async () => {},
    close: () => raw.close(),
    getDb: () => raw,
  };
}

function seedData(raw: BetterSqlite3.Database) {
  raw.prepare('INSERT INTO devices (id, mac_address) VALUES (?, ?)').run('d1', 'AA:BB:CC:DD:EE:01');
  raw.prepare('INSERT INTO devices (id, mac_address) VALUES (?, ?)').run('d2', 'AA:BB:CC:DD:EE:02');
  raw.prepare("INSERT INTO scans (id, status, started_at) VALUES (?, ?, ?)").run('s1', 'completed', '2024-06-01T10:00:00Z');
  raw.prepare('INSERT INTO scan_results (scan_id, device_id) VALUES (?, ?)').run('s1', 'd1');
  raw.prepare('INSERT INTO scan_results (scan_id, device_id) VALUES (?, ?)').run('s1', 'd2');
  raw.prepare("INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)").run('d1', 'ip_address', '10.0.0.1', '10.0.0.2', '2024-06-01T10:00:00Z');
  raw.prepare('INSERT INTO device_tags (device_id, tag) VALUES (?, ?)').run('d1', 'IoT');
  raw.prepare("INSERT INTO runtime_config (key, value, updated_at) VALUES (?, ?, ?)").run('theme', 'dark', '2024-06-01T00:00:00Z');
  raw.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run('001', '2024-01-01T00:00:00Z');
}

async function buildApp(dbOverride?: ReturnType<typeof createTestDb>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const db = dbOverride ?? createTestDb();

  app.decorate('db', db);
  app.decorate('appConfig', { retentionDays: 180 });
  app.addHook('onRequest', authMiddleware);
  await app.register(dbManagementRoutes, { prefix: '/api/v1' });

  return app;
}

describe('DB Management Routes — ext-011 (F4.10, F4.11, F4.12)', () => {

  // ========== GET /api/v1/db/stats (F4.10) ==========

  describe('GET /api/v1/db/stats', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      const db = createTestDb();
      seedData(db.getDb());
      app = await buildApp(db);
    });

    afterAll(async () => { await app.close(); });

    it('should return row counts for all tables', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/db/stats',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.tables.devices).toBe(2);
      expect(body.data.tables.scans).toBe(1);
      expect(body.data.tables.scan_results).toBe(2);
      expect(body.data.tables.device_history).toBe(1);
      expect(body.data.tables.device_tags).toBe(1);
    });

    it('should include database size info', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/db/stats',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveProperty('dbSizeBytes');
      expect(typeof body.data.dbSizeBytes).toBe('number');
      expect(body.data).toHaveProperty('walSizeBytes');
      expect(typeof body.data.walSizeBytes).toBe('number');
    });

    it('should include retention config and last cleanup timestamp', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/db/stats',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      const body = JSON.parse(res.body);
      expect(body.data).toHaveProperty('retentionDays', 180);
      expect(body.data).toHaveProperty('lastCleanupAt');
    });

    it('should return meta timestamp', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/db/stats',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      const body = JSON.parse(res.body);
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('should return 401 without API key', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/db/stats' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ========== POST /api/v1/db/cleanup (F4.11) ==========

  describe('POST /api/v1/db/cleanup', () => {
    let app: FastifyInstance;
    let testDb: ReturnType<typeof createTestDb>;

    beforeEach(async () => {
      testDb = createTestDb();
      const raw = testDb.getDb();

      // Seed old data (200 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 200);
      const oldIso = oldDate.toISOString();

      raw.prepare('INSERT INTO devices (id, mac_address) VALUES (?, ?)').run('d1', 'AA:BB:CC:DD:EE:01');
      raw.prepare('INSERT INTO scans (id, status, started_at, completed_at) VALUES (?, ?, ?, ?)').run('old-scan', 'completed', oldIso, oldIso);
      raw.prepare('INSERT INTO scan_results (scan_id, device_id) VALUES (?, ?)').run('old-scan', 'd1');
      raw.prepare("INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)").run('d1', 'ip', '1.1.1.1', '2.2.2.2', oldIso);

      // Seed recent data (5 days ago)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);
      const recentIso = recentDate.toISOString();

      raw.prepare('INSERT INTO scans (id, status, started_at, completed_at) VALUES (?, ?, ?, ?)').run('recent-scan', 'completed', recentIso, recentIso);
      raw.prepare('INSERT INTO scan_results (scan_id, device_id) VALUES (?, ?)').run('recent-scan', 'd1');
      raw.prepare("INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)").run('d1', 'hostname', 'old.local', 'new.local', recentIso);

      raw.prepare('INSERT INTO device_tags (device_id, tag) VALUES (?, ?)').run('d1', 'Server');

      app = await buildApp(testDb);
    });

    afterAll(async () => { if (app) await app.close(); });

    it('should cleanup with keepDays and preserve recent data', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/cleanup',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ keepDays: 7 }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.scansDeleted).toBe(1); // old-scan
      expect(body.data.scanResultsDeleted).toBe(1);
      expect(body.data.historyDeleted).toBe(1);
      expect(typeof body.data.durationMs).toBe('number');

      // Recent data preserved
      const raw = testDb.getDb();
      const scans = raw.prepare('SELECT id FROM scans').all() as Array<{ id: string }>;
      expect(scans).toHaveLength(1);
      expect(scans[0].id).toBe('recent-scan');

      // Device preserved
      const devices = raw.prepare('SELECT id FROM devices').all();
      expect(devices).toHaveLength(1);

      // Tags preserved
      const tags = raw.prepare('SELECT tag FROM device_tags').all();
      expect(tags).toHaveLength(1);
    });

    it('should delete all temporal data with keepDays 0', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/cleanup',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ keepDays: 0 }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.scansDeleted).toBe(2);
      expect(body.data.scanResultsDeleted).toBe(2);
      expect(body.data.historyDeleted).toBe(2);

      const raw = testDb.getDb();
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM scans').get()).toEqual({ cnt: 0 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM scan_results').get()).toEqual({ cnt: 0 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM device_history').get()).toEqual({ cnt: 0 });

      // Identity + config preserved
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM devices').get()).toEqual({ cnt: 1 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM device_tags').get()).toEqual({ cnt: 1 });
    });

    it('should return 400 for negative keepDays', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/cleanup',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ keepDays: -5 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for non-integer keepDays', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/cleanup',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ keepDays: 'abc' }),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when keepDays is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/cleanup',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 401 without API key', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/db/cleanup' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ========== POST /api/v1/db/factory-reset (F4.12) ==========

  describe('POST /api/v1/db/factory-reset', () => {
    let app: FastifyInstance;
    let testDb: ReturnType<typeof createTestDb>;

    beforeEach(async () => {
      testDb = createTestDb();
      const raw = testDb.getDb();
      seedData(raw);
      app = await buildApp(testDb);
    });

    afterAll(async () => { if (app) await app.close(); });

    it('should wipe all user data when confirmed', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/factory-reset',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ confirm: true }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.devicesDeleted).toBe(2);
      expect(body.data.scansDeleted).toBe(1);
      expect(body.data.scanResultsDeleted).toBe(2);
      expect(body.data.deviceHistoryDeleted).toBe(1);
      expect(body.data.deviceTagsDeleted).toBe(1);

      const raw = testDb.getDb();
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM devices').get()).toEqual({ cnt: 0 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM scans').get()).toEqual({ cnt: 0 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM scan_results').get()).toEqual({ cnt: 0 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM device_history').get()).toEqual({ cnt: 0 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM device_tags').get()).toEqual({ cnt: 0 });

      // System tables preserved
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM runtime_config').get()).toEqual({ cnt: 1 });
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM schema_migrations').get()).toEqual({ cnt: 1 });
    });

    it('should return 400 when confirm is false', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/factory-reset',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({ confirm: false }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');

      // No data deleted
      const raw = testDb.getDb();
      expect(raw.prepare('SELECT COUNT(*) as cnt FROM devices').get()).toEqual({ cnt: 2 });
    });

    it('should return 400 when confirm is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/db/factory-reset',
        headers: { 'x-api-key': VALID_API_KEY, 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 401 without API key', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/db/factory-reset' });
      expect(res.statusCode).toBe(401);
    });
  });
});
