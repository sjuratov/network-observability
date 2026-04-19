import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Device } from '@shared/types/device.js';

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'device-new-001',
    macAddress: 'AA:BB:CC:DD:EE:01',
    ipAddress: '192.168.1.10',
    hostname: 'staging-sensor',
    vendor: 'Fixture',
    displayName: 'Staging Sensor',
    isKnown: false,
    status: 'online',
    isOnline: true,
    firstSeenAt: '2024-01-01T00:00:00Z',
    lastSeenAt: '2024-01-02T00:00:00Z',
    discoveryMethod: 'arp',
    tags: [],
    ...overrides,
  };
}

describe('Device list status presentation', () => {
  it('clears the lifecycle label when a previously new device is now online', async () => {
    Object.assign(globalThis, { React });
    const { DeviceTable } = await import('../../../src/web/components/DeviceTable.tsx');

    const markup = renderToStaticMarkup(createElement(DeviceTable, {
      devices: [makeDevice()],
      onRowClick: () => {},
      pageSize: 10,
    }));

    expect(markup).toContain('status-badge-online');
    expect(markup).not.toContain('>New<');
  });
});
