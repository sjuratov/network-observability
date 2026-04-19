import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

type SettingsNetworkAlertsApiClient = ApiClient & {
  getSettingsSubnets: () => Promise<{
    data: {
      detected: Array<{ cidr: string }>;
      configured: Array<{ cidr: string }>;
      effective: string[];
    };
  }>;
  testSettingsWebhook: (payload: { url: string }) => Promise<{
    data: {
      success: boolean;
      statusCode: number;
      message: string;
    };
  }>;
  testSettingsEmail: (payload: {
    host: string;
    port: number;
    user: string;
    password: string;
    recipient: string;
  }) => Promise<{
    data: {
      success: boolean;
      message: string;
    };
  }>;
};

function mockFetchResponse(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

describe('Settings Network and Alerts client contract', () => {
  let client: SettingsNetworkAlertsApiClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY) as SettingsNetworkAlertsApiClient;
    vi.restoreAllMocks();
  });

  it('requests detected and configured subnet lists from the settings API', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        detected: [{ cidr: '192.168.1.0/24' }],
        configured: [{ cidr: '10.0.0.0/24' }],
        effective: ['10.0.0.0/24'],
      },
    });

    const result = await client.getSettingsSubnets();

    expect(result.data.effective).toEqual(['10.0.0.0/24']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config/subnets`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': API_KEY }),
      }),
    );
  });

  it('posts candidate webhook values to the settings test-webhook endpoint', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        success: true,
        statusCode: 200,
        message: 'Success — webhook responded with 200 OK',
      },
    });

    const result = await client.testSettingsWebhook({ url: 'https://hooks.example.com/netobserver' });

    expect(result.data.statusCode).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config/test-webhook`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://hooks.example.com/netobserver' }),
      }),
    );
  });

  it('posts candidate SMTP values to the settings test-email endpoint', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        success: true,
        message: 'Success',
      },
    });

    const result = await client.testSettingsEmail({
      host: 'smtp.example.com',
      port: 587,
      user: 'alerts@example.com',
      password: 'mail-secret',
      recipient: 'admin@example.com',
    });

    expect(result.data.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config/test-email`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          host: 'smtp.example.com',
          port: 587,
          user: 'alerts@example.com',
          password: 'mail-secret',
          recipient: 'admin@example.com',
        }),
      }),
    );
  });
});
