import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '@api/server.js';
import { createDatabase, type Database } from '@api/db/database.js';
import type { AppConfig } from '@shared/types/config.js';
import { sendEmailAlert, sendWebhookAlert } from '@api/alerts/notifier.js';

vi.mock('@api/alerts/notifier.js', () => ({
  sendWebhookAlert: vi.fn(),
  sendEmailAlert: vi.fn(),
}));

const API_KEY = 'test-api-key-valid';

function buildConfig(dbPath: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    subnets: ['10.0.0.0/24'],
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

describe('Settings Network and Alerts API contract (F14 / ext-007)', () => {
  let tempDir = '';
  let app: FastifyInstance | undefined;
  let db: Database | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-network-alerts-test-'));
    vi.mocked(sendWebhookAlert).mockResolvedValue({
      id: 'webhook-test-record',
      deviceId: 'settings-test-device',
      type: 'webhook',
      status: 'sent',
      timestamp: new Date().toISOString(),
      retryCount: 0,
      payload: {
        event: 'new_device_detected',
        timestamp: new Date().toISOString(),
        device: {
          id: 'settings-test-device',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '10.0.0.10',
          vendor: 'Fixture',
          hostname: 'settings-test-host',
          services: [],
          first_seen: new Date().toISOString(),
          mac_randomized: false,
        },
      },
    });
    vi.mocked(sendEmailAlert).mockResolvedValue({
      id: 'email-test-record',
      deviceId: 'settings-test-device',
      type: 'email',
      status: 'sent',
      timestamp: new Date().toISOString(),
      retryCount: 0,
      payload: {
        event: 'new_device_detected',
        timestamp: new Date().toISOString(),
        device: {
          id: 'settings-test-device',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '10.0.0.10',
          vendor: 'Fixture',
          hostname: 'settings-test-host',
          services: [],
          first_seen: new Date().toISOString(),
          mac_randomized: false,
        },
      },
    });
  });

  afterEach(async () => {
    await app?.close();
    db?.close();
    app = undefined;
    db = undefined;
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
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

  it('should test webhook delivery with a candidate URL before saving', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/config/test-webhook',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {
        url: 'https://hooks.example.com/netobserver',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(sendWebhookAlert)).toHaveBeenCalledWith(
      'https://hooks.example.com/netobserver',
      expect.any(Object),
    );
    expect(response.json()).toMatchObject({
      data: {
        success: true,
        statusCode: 200,
      },
    });
  });

  it('should surface webhook delivery diagnostics when the test delivery fails', async () => {
    vi.mocked(sendWebhookAlert).mockResolvedValueOnce({
      id: 'webhook-test-record',
      deviceId: 'settings-test-device',
      type: 'webhook',
      status: 'failed',
      timestamp: new Date().toISOString(),
      retryCount: 0,
      error: 'Connection refused',
      payload: {
        event: 'new_device_detected',
        timestamp: new Date().toISOString(),
        device: {
          id: 'settings-test-device',
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '10.0.0.10',
          vendor: 'Fixture',
          hostname: 'settings-test-host',
          services: [],
          first_seen: new Date().toISOString(),
          mac_randomized: false,
        },
      },
    });

    const server = await buildApp();

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/config/test-webhook',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {
        url: 'https://hooks.example.com/unreachable',
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: {
        code: 'WEBHOOK_TEST_FAILED',
        message: 'Connection refused',
      },
    });
  });

  it('should test email delivery with candidate SMTP settings before saving', async () => {
    const server = await buildApp();

    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/config/test-email',
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
      },
      payload: {
        host: 'smtp.example.com',
        port: 587,
        user: 'alerts@example.com',
        password: 'mail-secret',
        recipient: 'admin@example.com',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(sendEmailAlert)).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        user: 'alerts@example.com',
        pass: 'mail-secret',
        from: 'alerts@example.com',
        to: ['admin@example.com'],
      }),
      expect.any(Object),
    );
    expect(response.json()).toMatchObject({
      data: {
        success: true,
      },
    });
  });
});
