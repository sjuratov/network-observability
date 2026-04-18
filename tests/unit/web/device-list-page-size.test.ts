import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Device, DeviceListParams } from '@shared/types/device.js';
import { createApiClient, type ApiClient } from '../../../src/web/api-client.js';

const BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'test-key-123';

function makeDevice(index: number): Device {
  return {
    id: `device-${String(index).padStart(3, '0')}`,
    macAddress: `AA:BB:CC:DD:EE:${String(index).padStart(2, '0')}`,
    ipAddress: `192.168.1.${index}`,
    hostname: `printer-${index}`,
    vendor: 'Fixture',
    displayName: `Printer ${index}`,
    isKnown: true,
    status: index % 2 === 0 ? 'offline' : 'online',
    isOnline: index % 2 !== 0,
    firstSeenAt: '2024-01-01T00:00:00Z',
    lastSeenAt: '2024-01-02T00:00:00Z',
    discoveryMethod: 'arp',
    tags: [],
  };
}

describe('Device list page size controls', () => {
  it('renders a rows-per-page selector with the approved options', async () => {
    Object.assign(globalThis, { React });
    const { DeviceTable } = await import('../../../src/web/components/DeviceTable.tsx');

    const markup = renderToStaticMarkup(createElement(DeviceTable, {
      devices: Array.from({ length: 120 }, (_, index) => makeDevice(index + 1)),
      onRowClick: () => {},
      pageSize: 10,
    }));

    expect(markup).toContain('pagination-page-size');
    expect(markup).toContain('>All<');
  });

  it('retrieves the full filtered result set when All is requested', async () => {
    const client = createApiClient(BASE_URL, API_KEY);
    globalThis.fetch = vi.fn();

    const allDevicesClient = client as ApiClient & {
      getAllDevices: (params?: DeviceListParams) => Promise<Device[]>;
    };

    expect(allDevicesClient.getAllDevices).toBeTypeOf('function');

    const devices = await allDevicesClient.getAllDevices({ search: 'Printer', status: 'offline' });
    expect(devices).toHaveLength(120);
  });
});
