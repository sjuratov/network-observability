import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

// Extend ApiClient with DB management methods that will be added
type DbManagementClient = ApiClient & {
  getDbStats: () => Promise<{
    data: {
      tables: Record<string, number>;
      dbSizeBytes: number;
      walSizeBytes: number;
      retentionDays: number;
      lastCleanupAt: string | null;
    };
    meta: { timestamp: string };
  }>;
  runDbCleanup: (keepDays: number) => Promise<{
    data: {
      scansDeleted: number;
      scanResultsDeleted: number;
      historyDeleted: number;
      durationMs: number;
    };
    meta: { timestamp: string };
  }>;
  runFactoryReset: () => Promise<{
    data: {
      devicesDeleted: number;
      scansDeleted: number;
      scanResultsDeleted: number;
      deviceHistoryDeleted: number;
      deviceTagsDeleted: number;
    };
    meta: { timestamp: string };
  }>;
};

function mockFetchResponse(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

// ── API Client Contract Tests ────────────────────────────────────

describe('Settings Database tab API client contract', () => {
  let client: DbManagementClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY) as DbManagementClient;
    vi.restoreAllMocks();
  });

  it('fetches database stats from GET /db/stats', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        tables: { devices: 10, scans: 50, scan_results: 500, device_history: 200, device_tags: 5 },
        dbSizeBytes: 1048576,
        walSizeBytes: 32768,
        retentionDays: 365,
        lastCleanupAt: '2026-04-25T10:00:00.000Z',
      },
      meta: { timestamp: '2026-04-25T11:00:00.000Z' },
    });

    const result = await client.getDbStats();

    expect(result.data.tables).toEqual({
      devices: 10,
      scans: 50,
      scan_results: 500,
      device_history: 200,
      device_tags: 5,
    });
    expect(result.data.dbSizeBytes).toBe(1048576);
    expect(result.data.walSizeBytes).toBe(32768);
    expect(result.data.lastCleanupAt).toBe('2026-04-25T10:00:00.000Z');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/db/stats`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': API_KEY }),
      }),
    );
  });

  it('posts cleanup request with keepDays to POST /db/cleanup', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        scansDeleted: 12,
        scanResultsDeleted: 340,
        historyDeleted: 89,
        durationMs: 45,
      },
      meta: { timestamp: '2026-04-25T11:00:00.000Z' },
    });

    const result = await client.runDbCleanup(7);

    expect(result.data.scansDeleted).toBe(12);
    expect(result.data.scanResultsDeleted).toBe(340);
    expect(result.data.historyDeleted).toBe(89);
    expect(result.data.durationMs).toBe(45);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/db/cleanup`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ keepDays: 7 }),
      }),
    );
  });

  it('posts cleanup with keepDays 0 for delete-all-scan-data', async () => {
    globalThis.fetch = mockFetchResponse({
      data: { scansDeleted: 50, scanResultsDeleted: 500, historyDeleted: 200, durationMs: 120 },
      meta: { timestamp: '2026-04-25T11:00:00.000Z' },
    });

    const result = await client.runDbCleanup(0);

    expect(result.data.scansDeleted).toBe(50);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/db/cleanup`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ keepDays: 0 }),
      }),
    );
  });

  it('posts factory reset with confirm true to POST /db/factory-reset', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        devicesDeleted: 10,
        scansDeleted: 50,
        scanResultsDeleted: 500,
        deviceHistoryDeleted: 200,
        deviceTagsDeleted: 5,
      },
      meta: { timestamp: '2026-04-25T11:00:00.000Z' },
    });

    const result = await client.runFactoryReset();

    expect(result.data.devicesDeleted).toBe(10);
    expect(result.data.scansDeleted).toBe(50);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/db/factory-reset`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    );
  });
});

// ── Component Rendering Tests ────────────────────────────────────

describe('Settings Database tab component contract', () => {
  it('renders the Database tab in the tab bar', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="tab-database"');
    expect(markup).toContain('Database');
  });

  it('does NOT render the Data Retention card in the General tab', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    // General tab is active by default. The retention card should NOT appear in it.
    // Instead it should be in the Database tab panel.
    const generalPanelMatch = markup.match(
      /data-testid="panel-general"([\s\S]*?)(?=data-testid="panel-|$)/,
    );
    const generalPanel = generalPanelMatch?.[0] ?? '';
    expect(generalPanel).not.toContain('data-testid="input-retention-days"');
  });

  it('renders the database stats panel with expected test IDs', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    // Stats panel renders but individual stats require data to be loaded
    expect(markup).toContain('data-testid="db-stats-panel"');
    expect(markup).toContain('data-testid="btn-refresh-stats"');
    // Stats items (db-stats-db-size, db-stats-wal-size, db-stats-last-cleanup)
    // only appear after GET /db/stats returns data — not in initial SSR
    expect(markup).toContain('Click Refresh to load database statistics');
  });

  it('renders the data retention card in the database panel', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="db-retention-card"');
    expect(markup).toContain('data-testid="db-retention-days-input"');
  });

  it('renders manual cleanup controls', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="db-cleanup-keep-days"');
    expect(markup).toContain('data-testid="btn-cleanup-now"');
    expect(markup).toContain('data-testid="btn-delete-all-scans"');
  });

  it('renders factory reset danger zone card', async () => {
    Object.assign(globalThis, { React });
    const { SettingsPage } = await import('../../../src/web/pages/SettingsPage.tsx');

    const markup = renderToStaticMarkup(createElement(SettingsPage));

    expect(markup).toContain('data-testid="db-factory-reset-card"');
    expect(markup).toContain('data-testid="btn-factory-reset"');
  });
});

// ── Validation contract tests ────────────────────────────────────

describe('Settings Database tab validation contracts', () => {
  let client: DbManagementClient;

  beforeEach(() => {
    client = createApiClient(BASE_URL, API_KEY) as DbManagementClient;
    vi.restoreAllMocks();
  });

  it('returns lastCleanupAt as null when no cleanup has run', async () => {
    globalThis.fetch = mockFetchResponse({
      data: {
        tables: { devices: 0, scans: 0, scan_results: 0, device_history: 0, device_tags: 0 },
        dbSizeBytes: 4096,
        walSizeBytes: 0,
        retentionDays: 365,
        lastCleanupAt: null,
      },
      meta: { timestamp: '2026-04-25T11:00:00.000Z' },
    });

    const result = await client.getDbStats();

    expect(result.data.lastCleanupAt).toBeNull();
  });
});
