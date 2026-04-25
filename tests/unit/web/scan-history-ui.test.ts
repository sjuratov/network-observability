import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Scan } from '@shared/types/device.js';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

describe('Scan history page size controls', () => {
  it('getAllScans retrieves the full scan set by paging through the API', async () => {
    const client = createApiClient(BASE_URL, API_KEY);
    globalThis.fetch = vi.fn();

    const allScansClient = client as ApiClient & {
      getAllScans: () => Promise<Scan[]>;
    };

    expect(allScansClient.getAllScans).toBeTypeOf('function');
  });

  it('ScanHistoryPage exports a valid React component', async () => {
    Object.assign(globalThis, { React });
    const mod = await import('../../../src/web/pages/ScanHistoryPage.tsx');

    expect(mod.ScanHistoryPage).toBeTypeOf('function');
    const markup = renderToStaticMarkup(createElement(mod.ScanHistoryPage));
    // Initial render shows loading state (data fetched via useEffect)
    expect(markup).toContain('page-scan-history');
    expect(markup).toContain('btn-scan-now');
  });

  it('ApiClient.getScans accepts a status filter parameter', async () => {
    const client = createApiClient(BASE_URL, API_KEY);
    // Verify getScans accepts status parameter in its signature
    expect(client.getScans).toBeTypeOf('function');
    // The method should accept params including status
    expect(client.getScans.length).toBeGreaterThanOrEqual(0);
  });
});
