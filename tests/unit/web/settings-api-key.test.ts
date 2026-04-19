import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

type SettingsApiKeyClient = ApiClient & {
  revealSettingsApiKey: () => Promise<{
    data: {
      apiKey: string;
    };
  }>;
  regenerateSettingsApiKey: () => Promise<{
    data: {
      apiKey: string;
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

describe('Settings API key client contract', () => {
  let client: SettingsApiKeyClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY) as SettingsApiKeyClient;
    vi.restoreAllMocks();
  });

  it('requests the full API key from the reveal endpoint', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        apiKey: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaae1f2',
      },
    });

    const result = await client.revealSettingsApiKey();

    expect(result.data.apiKey).toMatch(/^[a-f0-9]{64}$/);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config/api-key`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': API_KEY }),
      }),
    );
  });

  it('posts to the regenerate endpoint and expects a replacement API key', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        apiKey: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb9f0a',
        message: 'API key regenerated. The old key is no longer valid.',
      },
    });

    const result = await client.regenerateSettingsApiKey();

    expect(result.data).toMatchObject({
      apiKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      message: 'API key regenerated. The old key is no longer valid.',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/config/regenerate-key`,
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});

describe('Settings API tab component contract', () => {
  it('renders API key management controls with copy disabled until reveal', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="api-key-display"');
    expect(markup).toContain('data-testid="btn-show-key"');
    expect(markup).toMatch(/data-testid="btn-copy-key"[^>]*disabled/);
  });

  it('renders read-only API guidance including rate limit information', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="api-rate-limit-info"');
    expect(markup).toContain('Rate limit');
  });
});
