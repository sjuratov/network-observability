import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import BetterSqlite3 from 'better-sqlite3';
import { createServer } from '@api/server.js';
import { createDatabase, type Database } from '@api/db/database.js';
import { loadConfig } from '@api/config/loader.js';
import type { AppConfig } from '@shared/types/config.js';

const API_KEY = 'test-api-key-valid';
const ENV_KEYS = ['CONFIG_FILE', 'STORAGE_DB_PATH', 'API_KEY'] as const;

function buildConfig(dbPath: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    subnets: ['192.168.1.0/24'],
    scanCadence: '0 */6 * * *',
    scanIntensity: 'normal',
    presenceOfflineThreshold: 1,
    dataRetentionDays: 365,
    portRange: '',
    alertWebhookUrl: 'https://hooks.example.com/netobserver',
    alertEmailSmtp: {
      host: 'smtp.example.com',
      port: 587,
      user: 'alerts@example.com',
      password: 'mail-secret',
      recipient: 'admin@example.com',
    },
    alertCooldownSeconds: 300,
    apiKey: API_KEY,
    webUiPort: 8080,
    logLevel: 'info',
    dbPath,
    ...overrides,
  };
}

describe('Settings runtime config contract (F14 / ext-005)', () => {
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  let tempDir = '';
  let app: FastifyInstance | undefined;
  let db: Database | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-config-test-'));
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(async () => {
    await app?.close();
    db?.close();
    app = undefined;
    db = undefined;

    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function buildApp(overrides: Partial<AppConfig> = {}): Promise<FastifyInstance> {
    const dbPath = path.join(tempDir, 'settings.sqlite');
    db = createDatabase(dbPath);
    await db.initialize();

    app = await createServer({
      config: buildConfig(dbPath, overrides),
      db,
    });
    await app.ready();
    return app;
  }

  it('should return the effective config with secrets redacted', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/config',
      headers: { 'x-api-key': API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        apiKey: expect.stringMatching(/\*{4}|•/),
        alertEmailSmtp: expect.objectContaining({
          password: '****',
        }),
      },
      meta: expect.objectContaining({
        configSources: expect.any(Array),
      }),
    });
  });

  it('should return the full API key for the reveal action', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/config/api-key',
      headers: { 'x-api-key': API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        apiKey: expect.stringMatching(/^[a-z0-9-]{10,}$/i),
      },
    });
  });

  it('should persist config updates and report restart-required fields', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {
        scanCadence: '0 */1 * * *',
        dataRetentionDays: 180,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: expect.objectContaining({
        scanCadence: '0 */1 * * *',
        dataRetentionDays: 180,
      }),
      meta: expect.objectContaining({
        applied: expect.arrayContaining(['dataRetentionDays']),
        restartRequired: expect.arrayContaining(['scanCadence']),
      }),
    });
  });

  it('should reject invalid config values with field-level validation details', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {
        scanCadence: 'bad-cron',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'scanCadence',
          }),
        ]),
      },
    });
  });

  it('should return detected, configured, and effective subnets', async () => {
    const server = await buildApp({ subnets: ['10.0.0.0/24'] });

    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/config/subnets',
      headers: { 'x-api-key': API_KEY },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        detected: expect.any(Array),
        configured: expect.arrayContaining([
          expect.objectContaining({ cidr: '10.0.0.0/24' }),
        ]),
        effective: expect.arrayContaining(['10.0.0.0/24']),
      },
    });
  });

  it('should reject empty change sets', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        message: 'No configuration fields provided',
      },
    });
  });

  it('should ignore unknown fields and return only the known configuration shape', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/v1/config',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {
        futureExperimentalFlag: true,
        dataRetentionDays: 180,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: expect.objectContaining({
        dataRetentionDays: 180,
      }),
    });
    expect(response.json()).not.toHaveProperty('data.futureExperimentalFlag');
  });

  it('should regenerate the API key and reject the previous key afterwards', async () => {
    const server = await buildApp();

    const regenerate = await server.inject({
      method: 'POST',
      url: '/api/v1/config/regenerate-key',
      headers: { 'x-api-key': API_KEY },
    });

    expect(regenerate.statusCode).toBe(200);
    const regeneratedBody = regenerate.json();
    expect(regeneratedBody.data.apiKey).toMatch(/^[a-f0-9]{64}$/i);

    const oldKeyRequest = await server.inject({
      method: 'GET',
      url: '/api/v1/config',
      headers: { 'x-api-key': API_KEY },
    });

    expect(oldKeyRequest.statusCode).toBe(401);
  });

  it('should prefer runtime config store values over YAML after restart', async () => {
    const dbPath = path.join(tempDir, 'runtime-settings.sqlite');
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(configPath, ['storage:', '  retention_days: 365'].join('\n'));

    const runtimeDb = new BetterSqlite3(dbPath);
    runtimeDb.exec(`
      CREATE TABLE IF NOT EXISTS runtime_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);
    runtimeDb.prepare('INSERT INTO runtime_config (key, value, updated_at) VALUES (?, ?, ?)')
      .run('dataRetentionDays', '180', new Date().toISOString());
    runtimeDb.close();

    process.env.CONFIG_FILE = configPath;
    process.env.STORAGE_DB_PATH = dbPath;

    const config = await loadConfig();

    expect(config.dataRetentionDays).toBe(180);
  });

  it('should serialize concurrent writes so the last successful save wins', async () => {
    const server = await buildApp();

    const [firstSave, secondSave] = await Promise.all([
      server.inject({
        method: 'PATCH',
        url: '/api/v1/config',
        headers: {
          'x-api-key': API_KEY,
          'content-type': 'application/json',
        },
        payload: { alertCooldownSeconds: 300 },
      }),
      server.inject({
        method: 'PATCH',
        url: '/api/v1/config',
        headers: {
          'x-api-key': API_KEY,
          'content-type': 'application/json',
        },
        payload: { alertCooldownSeconds: 600 },
      }),
    ]);

    expect(firstSave.statusCode).toBe(200);
    expect(secondSave.statusCode).toBe(200);

    const finalConfig = await server.inject({
      method: 'GET',
      url: '/api/v1/config',
      headers: { 'x-api-key': API_KEY },
    });

    expect(finalConfig.statusCode).toBe(200);
    expect(finalConfig.json()).toMatchObject({
      data: {
        alertCooldownSeconds: 600,
      },
    });
  });
});
