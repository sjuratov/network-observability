import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { deviceRoutes } from '@api/routes/devices.js';
import { scanRoutes } from '@api/routes/scans.js';
import { statsRoutes } from '@api/routes/stats.js';
import { tagRoutes } from '@api/routes/tags.js';
import { authMiddleware } from '@api/middleware/auth.js';

const VALID_API_KEY = 'test-api-key-valid';
const INVALID_API_KEY = 'test-api-key-invalid';

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
  `);

  // Seed devices
  const insertDevice = raw.prepare(
    `INSERT INTO devices (id, mac_address, ip_address, hostname, vendor, display_name, is_known, is_online, first_seen_at, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertDevice.run('device-001', 'AA:BB:CC:DD:EE:01', '192.168.1.10', 'living-room-tv', 'Samsung', 'Smart TV', 1, 1, '2024-01-01T00:00:00.000Z', '2024-01-15T12:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-15T12:00:00.000Z');
  insertDevice.run('device-002', 'AA:BB:CC:DD:EE:02', '192.168.1.20', 'office-printer', 'HP', 'Office Printer', 1, 0, '2024-01-02T00:00:00.000Z', '2024-01-14T08:00:00.000Z', '2024-01-02T00:00:00.000Z', '2024-01-14T08:00:00.000Z');
  insertDevice.run('device-003', 'AA:BB:CC:DD:EE:03', '192.168.1.30', 'laptop', 'Apple', 'MacBook Pro', 1, 1, '2024-01-03T00:00:00.000Z', '2024-01-15T12:00:00.000Z', '2024-01-03T00:00:00.000Z', '2024-01-15T12:00:00.000Z');

  // Seed tags
  const insertTag = raw.prepare('INSERT INTO device_tags (device_id, tag, created_at) VALUES (?, ?, ?)');
  insertTag.run('device-001', 'Media', '2024-01-01T00:00:00.000Z');
  insertTag.run('device-001', 'IoT', '2024-01-01T00:00:00.000Z');
  insertTag.run('device-002', 'IoT', '2024-01-01T00:00:00.000Z');

  // Seed scans
  raw.prepare(
    `INSERT INTO scans (id, status, started_at, completed_at, duration_ms, devices_found, new_devices, subnets_scanned, errors, scan_intensity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('scan-001', 'completed', '2024-01-15T10:00:00.000Z', '2024-01-15T10:05:00.000Z', 300000, 3, 1, '["192.168.1.0/24"]', '[]', 'normal', '2024-01-15T10:00:00.000Z');

  // Seed history
  raw.prepare(
    'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
  ).run('device-001', 'displayName', 'Unknown', 'Smart TV', '2024-01-10T00:00:00.000Z');

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
  await app.register(scanRoutes, { prefix: '/api/v1' });
  await app.register(statsRoutes, { prefix: '/api/v1' });
  await app.register(tagRoutes, { prefix: '/api/v1' });

  return app;
}

describe('REST API (F11)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Authentication ───

  describe('Authentication', () => {
    it('should grant access with a valid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
    });

    it('should return 401 when API key is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when API key is invalid', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
        headers: { 'x-api-key': INVALID_API_KEY },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── Device Endpoints ───

  describe('Device Endpoints', () => {
    it('should return paginated device list from GET /api/v1/devices', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty('meta.pagination');
    });

    it('should filter devices by search query', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices?search=printer',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should filter devices by tag', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices?tag=IoT',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should filter devices by status=online', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices?status=online',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
      for (const device of body.data) {
        expect(device.isOnline).toBe(true);
      }
    });

    it('should return device detail from GET /api/v1/devices/:id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices/device-001',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.id).toBe('device-001');
      expect(body.data).toHaveProperty('macAddress');
      expect(body.data).toHaveProperty('ipAddress');
      expect(body.data).toHaveProperty('isOnline');
    });

    it('should return 404 for unknown device ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices/nonexistent-id',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should update device display name and tags via PATCH', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/devices/device-001',
        headers: {
          'x-api-key': VALID_API_KEY,
          'content-type': 'application/json',
        },
        payload: { displayName: 'Living Room TV', tags: ['Media', 'IoT'] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.displayName).toBe('Living Room TV');
      expect(body.data.tags).toContain('Media');
      expect(body.data.tags).toContain('IoT');
    });

    it('should return device history from GET /api/v1/devices/:id/history', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices/device-001/history',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ─── Scan Endpoints ───

  describe('Scan Endpoints', () => {
    it('should trigger a manual scan via POST /api/v1/scans', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/scans',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.status).toBe('in-progress');
      expect(body.data.id).toBeTruthy();
    });

    it('should return 409 if a scan is already running', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/scans',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('should return paginated scan list from GET /api/v1/scans', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/scans',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty('meta.pagination');
    });

    it('should return scan detail from GET /api/v1/scans/:id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/scans/scan-001',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.id).toBe('scan-001');
    });
  });

  // ─── Stats Endpoints ───

  describe('Stats Endpoints', () => {
    it('should return dashboard overview stats', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stats/overview',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveProperty('totalDevices');
      expect(body.data).toHaveProperty('newDevices24h');
      expect(body.data).toHaveProperty('offlineDevices');
      expect(body.data).toHaveProperty('lastScanAt');
    });
  });

  // ─── Tag Endpoints ───

  describe('Tag Endpoints', () => {
    it('should return all tags from GET /api/v1/tags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/tags',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should create a new tag via POST /api/v1/tags', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/tags',
        headers: {
          'x-api-key': VALID_API_KEY,
          'content-type': 'application/json',
        },
        payload: { name: 'NewTag' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.name).toBe('NewTag');
    });

    it('should remove a tag via DELETE /api/v1/tags/:id', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/tags/tag-001',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ─── Response Format ───

  describe('Response Format', () => {
    it('should use consistent JSON envelope with data and meta', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      const body = response.json();
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('should include cursor pagination metadata in list responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices?limit=25',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      const body = response.json();
      expect(body.meta.pagination).toHaveProperty('limit');
      expect(body.meta.pagination).toHaveProperty('hasMore');
      expect(body.meta.pagination).toHaveProperty('nextCursor');
    });

    it('should use standard error format for error responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices/nonexistent',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body).toHaveProperty('meta.timestamp');
    });

    it('should include ISO 8601 timestamp in meta', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/devices',
        headers: { 'x-api-key': VALID_API_KEY },
      });

      const body = response.json();
      const timestamp = body.meta.timestamp;
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });
});
