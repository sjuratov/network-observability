import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { exportRoutes } from '@api/routes/export.js';
import { deviceRoutes } from '@api/routes/devices.js';
import { authMiddleware } from '@api/middleware/auth.js';

const VALID_API_KEY = 'test-api-key-valid';

function createTestDb() {
  const raw = new BetterSqlite3(':memory:');
  raw.pragma('journal_mode = WAL');

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
      seen_scan_count INTEGER DEFAULT 2,
      missed_scan_count INTEGER DEFAULT 0
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
    CREATE TABLE scan_results (
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
    CREATE TABLE device_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT
    );
    CREATE TABLE device_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      tag TEXT,
      created_at TEXT
    );
  `);

  // Seed devices
  const insertDevice = raw.prepare(
    `INSERT INTO devices (id, mac_address, ip_address, hostname, vendor, display_name, is_known, is_online, seen_scan_count, missed_scan_count, first_seen_at, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertDevice.run('dev-001', 'AA:BB:CC:DD:EE:01', '192.168.1.10', 'tv.local', 'Samsung', 'Smart TV', 1, 1, 3, 0, '2024-01-01T00:00:00Z', '2024-06-15T12:00:00Z', '2024-01-01T00:00:00Z', '2024-06-15T12:00:00Z');
  insertDevice.run('dev-002', 'AA:BB:CC:DD:EE:02', '192.168.1.20', 'printer.local', 'HP', 'Office Printer', 1, 0, 3, 2, '2024-01-02T00:00:00Z', '2024-06-14T08:00:00Z', '2024-01-02T00:00:00Z', '2024-06-14T08:00:00Z');
  insertDevice.run('dev-003', 'AA:BB:CC:DD:EE:03', '192.168.1.30', 'laptop.local', 'Apple', 'MacBook Pro', 0, 1, 3, 0, '2024-03-01T00:00:00Z', '2024-06-15T12:00:00Z', '2024-03-01T00:00:00Z', '2024-06-15T12:00:00Z');

  // Seed tags
  const insertTag = raw.prepare('INSERT INTO device_tags (device_id, tag, created_at) VALUES (?, ?, ?)');
  insertTag.run('dev-001', 'Media', '2024-01-01T00:00:00Z');
  insertTag.run('dev-001', 'IoT', '2024-01-01T00:00:00Z');
  insertTag.run('dev-002', 'IoT', '2024-01-01T00:00:00Z');

  // Seed scans
  const insertScan = raw.prepare(
    `INSERT INTO scans (id, status, started_at, completed_at, duration_ms, devices_found, new_devices, subnets_scanned, errors, scan_intensity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertScan.run('scan-001', 'completed', '2024-01-15T10:00:00Z', '2024-01-15T10:05:00Z', 300000, 3, 1, '["192.168.1.0/24"]', '[]', 'normal', '2024-01-15T10:00:00Z');
  insertScan.run('scan-002', 'completed', '2024-03-15T10:00:00Z', '2024-03-15T10:04:00Z', 240000, 3, 0, '["192.168.1.0/24"]', '[]', 'normal', '2024-03-15T10:00:00Z');
  insertScan.run('scan-003', 'completed', '2024-06-15T10:00:00Z', '2024-06-15T10:03:00Z', 180000, 3, 0, '["192.168.1.0/24"]', '[]', 'normal', '2024-06-15T10:00:00Z');

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
  app.decorate('appConfig', { presenceOfflineThreshold: 1 });
  app.addHook('onRequest', authMiddleware);

  await app.register(deviceRoutes, { prefix: '/api/v1' });
  await app.register(exportRoutes, { prefix: '/api/v1' });

  return app;
}

describe('Export Routes (F12)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // --- Device CSV Export ---

  describe('GET /api/v1/export/devices?format=csv', () => {
    it('should return CSV with correct headers and data rows', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=csv',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="devices_.*\.csv"/);

      const lines = res.body.trim().split('\n');
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('display_name');
      expect(lines[0]).toContain('mac_address');
      expect(lines.length).toBe(4); // header + 3 devices
    });

    it('should return headers-only for empty result with filters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=csv&tag=nonexistent',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const lines = res.body.trim().split('\n');
      expect(lines.length).toBe(1); // header only
    });
  });

  // --- Device JSON Export ---

  describe('GET /api/v1/export/devices?format=json', () => {
    it('should return JSON with export envelope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=json',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('exportedAt');
      expect(body).toHaveProperty('totalCount', 3);
      expect(body).toHaveProperty('devices');
      expect(body.devices).toHaveLength(3);
      expect(body.devices[0]).toHaveProperty('macAddress');
      expect(body.devices[0]).toHaveProperty('status');
    });
  });

  // --- Scan CSV Export ---

  describe('GET /api/v1/export/scans?format=csv', () => {
    it('should return CSV with scan data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/scans?format=csv',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="scans_.*\.csv"/);

      const lines = res.body.trim().split('\n');
      expect(lines[0]).toContain('scan_id');
      expect(lines.length).toBe(4); // header + 3 scans
    });
  });

  // --- Scan JSON Export ---

  describe('GET /api/v1/export/scans?format=json', () => {
    it('should return JSON with scan export envelope', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/scans?format=json',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('exportedAt');
      expect(body).toHaveProperty('totalCount', 3);
      expect(body).toHaveProperty('scans');
      expect(body.scans).toHaveLength(3);
    });
  });

  // --- Date Range Filtering ---

  describe('date range filtering', () => {
    it('should filter scans by from/to date range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/scans?format=json&from=2024-03-01&to=2024-04-01',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalCount).toBe(1);
      expect(body.scans[0].startedAt).toContain('2024-03-15');
    });

    it('should return empty results for future date range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/scans?format=csv&from=2099-01-01&to=2099-12-31',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const lines = res.body.trim().split('\n');
      expect(lines.length).toBe(1); // header only
    });
  });

  // --- Tag Filtering ---

  describe('tag filtering', () => {
    it('should filter devices by tag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=json&tag=IoT',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalCount).toBe(2); // dev-001 and dev-002 have IoT tag
    });
  });

  // --- Status Filtering ---

  describe('status filtering', () => {
    it('should filter devices by online status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=json&status=online',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      for (const device of body.devices) {
        expect(device.status).toBe('online');
      }
    });
  });

  // --- Validation ---

  describe('validation', () => {
    it('should return 400 for invalid format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=xml',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when from date is after to date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/scans?format=csv&from=2024-06-01&to=2024-01-01',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid date format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/scans?format=csv&from=not-a-date',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // --- Auth ---

  describe('authentication', () => {
    it('should return 401 without API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/export/devices?format=csv',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
