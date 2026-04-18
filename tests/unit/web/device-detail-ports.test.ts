import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Device } from '@shared/types/device.js';

function makeDevice(): Device {
  return {
    id: 'device-001',
    macAddress: 'AA:BB:CC:DD:EE:01',
    ipAddress: '192.168.1.42',
    hostname: 'fixture-router',
    vendor: 'Fixture Labs',
    displayName: 'Fixture Router',
    isKnown: true,
    isOnline: true,
    status: 'online',
    firstSeenAt: '2026-04-15T07:00:00Z',
    lastSeenAt: '2026-04-18T09:45:00Z',
    discoveryMethod: 'arp',
    tags: [],
    notes: '',
  };
}

function mockStateSequence(portData: Array<Record<string, unknown>>) {
  const queue = [
    makeDevice(),
    null,
    portData,
    false,
    null,
    false,
    null,
    false,
    'ports',
    false,
    'Fixture Router',
    '',
    '',
    null,
  ];

  return vi.fn((initialValue: unknown) => [queue.length > 0 ? queue.shift() : initialValue, vi.fn()]);
}

async function renderPortsMarkup(portData: Array<Record<string, unknown>>) {
  vi.resetModules();
  vi.stubGlobal('React', React);
  const useState = mockStateSequence(portData);

  vi.doMock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    return {
      ...actual,
      useState,
      useEffect: vi.fn(),
    };
  });

  vi.doMock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router');
    return {
      ...actual,
      useParams: () => ({ id: 'device-001' }),
      Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => createElement('a', props, children),
    };
  });

  vi.doMock('../../../src/web/hooks/useApi', () => ({
    useApi: () => ({
      getDevice: vi.fn(),
      getDeviceHistory: vi.fn(),
      updateDevice: vi.fn(),
    }),
  }));

  const { DeviceDetailPage } = await import('../../../src/web/pages/DeviceDetailPage.tsx');
  return renderToStaticMarkup(createElement(DeviceDetailPage));
}

afterEach(() => {
  vi.doUnmock('react');
  vi.doUnmock('react-router');
  vi.doUnmock('../../../src/web/hooks/useApi');
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('Device detail ports presentation', () => {
  it('renders version details inline inside the service column instead of a dedicated header', async () => {
    const markup = await renderPortsMarkup([
      { port: 22, protocol: 'tcp', state: 'open', service: 'ssh', version: 'OpenSSH 9.7' },
    ]);

    expect(markup).toContain('data-testid="port-table"');
    expect(markup).toContain('OpenSSH 9.7');
    expect(markup).not.toContain('>Version<');
  });

  it('omits empty version placeholders when service version data is absent', async () => {
    const markup = await renderPortsMarkup([
      { port: 161, protocol: 'udp', state: 'open', service: 'snmp', version: '' },
    ]);

    expect(markup).toContain('>snmp<');
    expect(markup).not.toContain('>Version<');
    expect(markup).not.toContain('>—<');
  });
});
