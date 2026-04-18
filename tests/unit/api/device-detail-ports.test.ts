import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { authMiddleware } from '@api/middleware/auth.js';
import { deviceRoutes } from '@api/routes/devices.js';

function createTestDb() {
  const raw = new BetterSqlite3(':memory:');
  raw.exec(`
    CREATE TABLE scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT,
      device_id TEXT,
      open_ports TEXT,
      created_at TEXT
    );
  `);

  raw.prepare(
    'INSERT INTO scan_results (scan_id, device_id, open_ports, created_at) VALUES (?, ?, ?, ?)',
  ).run(
    'scan-001',
    'device-001',
    JSON.stringify([
      { port: 22, protocol: 'tcp', state: 'open', service: 'ssh', version: 'OpenSSH 9.7' },
      { port: 161, protocol: 'udp', state: 'open', service: 'snmp', version: '' },
    ]),
    '2026-04-18T09:45:00Z',
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
  return app;
}

describe('Device detail ports API contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('preserves raw version values in the ports snapshot response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/devices/device-001/ports',
      headers: { 'x-api-key': 'test-api-key-valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        expect.objectContaining({
          port: 22,
          service: 'ssh',
          version: 'OpenSSH 9.7',
        }),
        expect.objectContaining({
          port: 161,
          service: 'snmp',
          version: '',
        }),
      ],
      meta: expect.objectContaining({
        timestamp: expect.any(String),
      }),
    });
  });
});
