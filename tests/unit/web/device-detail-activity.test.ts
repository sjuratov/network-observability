import { describe, expect, it, vi } from 'vitest';
import type { DeviceHistory } from '@shared/types/device.js';
import { createApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

type StructuredActivityHistory = DeviceHistory & {
  presenceSummary?: {
    status: 'online' | 'offline' | 'unknown';
    firstSeenAt: string;
    lastSeenAt: string;
  };
  activityEvents?: Array<{
    type: string;
    timestamp: string;
  }>;
};

describe('Device detail activity client contract', () => {
  it('returns the structured activity sections expected by the Activity tab', async () => {
    const client = createApiClient(BASE_URL, API_KEY);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        presenceSummary: {
          status: 'online',
          firstSeenAt: '2026-04-15T07:00:00Z',
          lastSeenAt: '2026-04-18T09:45:00Z',
        },
        ipHistory: [
          {
            ipAddress: '192.168.1.42',
            firstSeenAt: '2026-04-15T07:00:00Z',
            lastSeenAt: '2026-04-18T09:45:00Z',
          },
        ],
        activityEvents: [
          {
            type: 'ip-change',
            timestamp: '2026-04-18T09:45:00Z',
          },
        ],
      }),
    });

    const history = await client.getDeviceHistory('device-001') as StructuredActivityHistory;

    expect(history).toMatchObject({
      presenceSummary: {
        status: 'online',
      },
      ipHistory: [
        expect.objectContaining({
          ipAddress: '192.168.1.42',
        }),
      ],
      activityEvents: [
        expect.objectContaining({
          type: 'ip-change',
        }),
      ],
    });
  });

  it('surfaces history-loading failures instead of hiding them behind a fallback payload', async () => {
    const client = createApiClient(BASE_URL, API_KEY);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Activity aggregation failed',
        },
      }),
    });

    await expect(client.getDeviceHistory('device-001')).rejects.toMatchObject({
      status: 500,
    });
  });
});
