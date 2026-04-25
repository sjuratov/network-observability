import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

type SettingsApiClient = ApiClient & {
  getSettings: () => Promise<{
    data: {
      scanCadence: string;
      scanIntensity: 'quick' | 'normal' | 'thorough';
      dataRetentionDays: number;
    };
    meta: {
      envOverridden: string[];
    };
  }>;
  updateSettings: (payload: Partial<{
    scanCadence: string;
    scanIntensity: 'quick' | 'normal' | 'thorough';
    dataRetentionDays: number;
  }>) => Promise<{
    data: {
      scanCadence: string;
      scanIntensity: 'quick' | 'normal' | 'thorough';
      dataRetentionDays: number;
    };
    meta: {
      applied: string[];
      restartRequired: string[];
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

describe('Settings General tab client contract', () => {
  let client: SettingsApiClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY) as SettingsApiClient;
    vi.restoreAllMocks();
  });

  it('requests the effective General settings from the config endpoint', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        scanCadence: '0 */6 * * *',
        scanIntensity: 'normal',
        dataRetentionDays: 365,
      },
      meta: {
        envOverridden: [],
      },
    });

    const result = await client.getSettings();

    expect(result).toMatchObject({
      data: {
        scanCadence: '0 */6 * * *',
        scanIntensity: 'normal',
        dataRetentionDays: 365,
      },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': API_KEY }),
      }),
    );
  });

  it('sends changed General settings fields through the config patch endpoint', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        scanCadence: '0 */1 * * *',
        scanIntensity: 'normal',
        dataRetentionDays: 365,
      },
      meta: {
        applied: ['scanCadence'],
        restartRequired: [],
      },
    });

    const result = await client.updateSettings({ scanCadence: '0 */1 * * *' });

    expect(result.meta.applied).toContain('scanCadence');
    expect(result.meta.restartRequired).not.toContain('scanCadence');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ scanCadence: '0 */1 * * *' }),
      }),
    );
  });
});

describe('Settings General tab component contract', () => {
  it('renders a loading state before the General settings hydrate from the API', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="settings-loading"');
  });

  it('renders retry guidance when loading the General settings fails', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('Unable to load settings. Check server connection.');
    expect(markup).toContain('data-testid="settings-retry"');
  });

  it('renders environment-managed badges and disabled General save state affordances', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="field-scan-cadence-env-managed"');
    expect(markup).toContain('data-testid="field-scan-intensity-env-managed"');
    expect(markup).toMatch(/data-testid="btn-save-general"[^>]*disabled/);
  });
});
