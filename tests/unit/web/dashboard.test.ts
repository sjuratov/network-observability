import { describe, it, expect } from 'vitest';
import { filterDevices, sortDevices, searchDevices, computeStats, buildBreakdownData } from '../../../src/web/utils/filters.js';
import type { Device, Scan } from '@shared/types/device.js';

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev-001',
    macAddress: 'AA:BB:CC:DD:EE:01',
    ipAddress: '192.168.1.10',
    hostname: 'test-host',
    vendor: 'TestVendor',
    displayName: 'Test Device',
    isKnown: true,
    isOnline: true,
    firstSeenAt: '2024-01-01T00:00:00Z',
    lastSeenAt: '2024-01-15T12:00:00Z',
    discoveryMethod: 'arp',
    tags: [],
    ...overrides,
  };
}

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 'scan-001',
    status: 'completed',
    startedAt: '2024-01-15T12:00:00Z',
    completedAt: '2024-01-15T12:05:00Z',
    devicesFound: 10,
    newDevices: 2,
    subnetsScanned: ['192.168.1.0/24'],
    errors: [],
    scanIntensity: 'normal',
    ...overrides,
  };
}

describe('Dashboard — computeStats', () => {
  it('computes total device count', () => {
    const devices = [makeDevice({ id: 'd1' }), makeDevice({ id: 'd2' }), makeDevice({ id: 'd3' })];
    const stats = computeStats(devices, []);
    expect(stats.totalDevices).toBe(3);
  });

  it('computes new devices in last 24 hours', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const old = '2024-01-01T00:00:00Z';

    const devices = [
      makeDevice({ id: 'd1', firstSeenAt: recent }),
      makeDevice({ id: 'd2', firstSeenAt: old }),
      makeDevice({ id: 'd3', firstSeenAt: recent }),
    ];
    const stats = computeStats(devices, []);
    expect(stats.newDevices24h).toBe(2);
  });

  it('computes offline device count', () => {
    const devices = [
      makeDevice({ id: 'd1', isOnline: true }),
      makeDevice({ id: 'd2', isOnline: false }),
      makeDevice({ id: 'd3', isOnline: false }),
    ];
    const stats = computeStats(devices, []);
    expect(stats.offlineDevices).toBe(2);
  });

  it('computes online device count as total minus offline', () => {
    const devices = [
      makeDevice({ id: 'd1', isOnline: true }),
      makeDevice({ id: 'd2', isOnline: false }),
      makeDevice({ id: 'd3', isOnline: true }),
      makeDevice({ id: 'd4', isOnline: true }),
    ];
    const stats = computeStats(devices, []);
    expect(stats.onlineDevices).toBe(3);
    expect(stats.onlineDevices).toBe(stats.totalDevices - stats.offlineDevices);
  });

  it('includes last scan timestamp and status', () => {
    const scans = [
      makeScan({ id: 's1', startedAt: '2024-01-14T00:00:00Z', status: 'completed' }),
      makeScan({ id: 's2', startedAt: '2024-01-15T12:00:00Z', status: 'completed' }),
    ];
    const stats = computeStats([], scans);
    expect(stats.lastScanAt).toBe('2024-01-15T12:00:00Z');
    expect(stats.lastScanStatus).toBe('completed');
  });

  it('returns null scan info when no scans exist', () => {
    const stats = computeStats([], []);
    expect(stats.lastScanAt).toBeNull();
    expect(stats.lastScanStatus).toBeNull();
  });
});

describe('Dashboard — filterDevices', () => {
  const devices = [
    makeDevice({ id: 'd1', isOnline: true, tags: ['IoT'], vendor: 'Apple' }),
    makeDevice({ id: 'd2', isOnline: false, tags: ['Printer'], vendor: 'HP' }),
    makeDevice({ id: 'd3', isOnline: true, tags: ['IoT', 'Critical'], vendor: 'Samsung' }),
    makeDevice({ id: 'd4', isOnline: false, tags: [], vendor: 'Apple' }),
  ];

  it('filters by online status', () => {
    const result = filterDevices(devices, { status: 'online' });
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.isOnline)).toBe(true);
  });

  it('filters by offline status', () => {
    const result = filterDevices(devices, { status: 'offline' });
    expect(result).toHaveLength(2);
    expect(result.every((d) => !d.isOnline)).toBe(true);
  });

  it('filters by tag', () => {
    const result = filterDevices(devices, { tag: 'IoT' });
    expect(result).toHaveLength(2);
    expect(result.every((d) => d.tags.includes('IoT'))).toBe(true);
  });

  it('combines status and tag filters with AND logic', () => {
    const result = filterDevices(devices, { status: 'online', tag: 'IoT' });
    expect(result).toHaveLength(2);
  });

  it('returns all devices with empty filters', () => {
    const result = filterDevices(devices, {});
    expect(result).toHaveLength(4);
  });
});

describe('Dashboard — sortDevices', () => {
  const devices = [
    makeDevice({ id: 'd1', displayName: 'Charlie', lastSeenAt: '2024-01-13T00:00:00Z', ipAddress: '192.168.1.30' }),
    makeDevice({ id: 'd2', displayName: 'Alpha', lastSeenAt: '2024-01-15T00:00:00Z', ipAddress: '192.168.1.10' }),
    makeDevice({ id: 'd3', displayName: 'Bravo', lastSeenAt: '2024-01-14T00:00:00Z', ipAddress: '192.168.1.20' }),
  ];

  it('sorts by name ascending', () => {
    const result = sortDevices(devices, 'name', 'asc');
    expect(result.map((d) => d.displayName)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by name descending', () => {
    const result = sortDevices(devices, 'name', 'desc');
    expect(result.map((d) => d.displayName)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by last-seen descending', () => {
    const result = sortDevices(devices, 'lastSeen', 'desc');
    expect(result[0].displayName).toBe('Alpha');
  });

  it('sorts by IP ascending', () => {
    const result = sortDevices(devices, 'ip', 'asc');
    expect(result.map((d) => d.ipAddress)).toEqual(['192.168.1.10', '192.168.1.20', '192.168.1.30']);
  });
});

describe('Dashboard — searchDevices', () => {
  const devices = [
    makeDevice({ id: 'd1', displayName: 'Office Printer', vendor: 'HP', hostname: 'hp-printer', tags: ['Printer'] }),
    makeDevice({ id: 'd2', displayName: 'Smart TV', vendor: 'Samsung', hostname: 'samsung-tv', tags: ['Media'] }),
    makeDevice({ id: 'd3', displayName: 'MacBook Pro', vendor: 'Apple', ipAddress: '192.168.1.100', tags: [] }),
  ];

  it('matches on display name (case-insensitive)', () => {
    const result = searchDevices(devices, 'printer');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d1');
  });

  it('matches on vendor', () => {
    const result = searchDevices(devices, 'samsung');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d2');
  });

  it('matches on MAC address', () => {
    const result = searchDevices(devices, 'AA:BB:CC');
    expect(result).toHaveLength(3);
  });

  it('matches on IP address', () => {
    const result = searchDevices(devices, '192.168.1.100');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d3');
  });

  it('matches on hostname', () => {
    const result = searchDevices(devices, 'hp-printer');
    expect(result).toHaveLength(1);
  });

  it('matches on tags', () => {
    const result = searchDevices(devices, 'Media');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d2');
  });

  it('returns empty array for no matches', () => {
    const result = searchDevices(devices, 'nonexistent-xyz');
    expect(result).toHaveLength(0);
  });

  it('returns all devices for empty query', () => {
    const result = searchDevices(devices, '');
    expect(result).toHaveLength(3);
  });
});

describe('Dashboard — buildBreakdownData', () => {
  it('returns empty array for empty device list', () => {
    expect(buildBreakdownData([], 'vendor')).toEqual([]);
  });

  it('groups by vendor sorted descending', () => {
    const devices = [
      makeDevice({ id: 'd1', vendor: 'Apple' }),
      makeDevice({ id: 'd2', vendor: 'Apple' }),
      makeDevice({ id: 'd3', vendor: 'Samsung' }),
      makeDevice({ id: 'd4', vendor: 'Apple' }),
      makeDevice({ id: 'd5', vendor: 'Samsung' }),
      makeDevice({ id: 'd6', vendor: 'TP-Link' }),
    ];
    const result = buildBreakdownData(devices, 'vendor');
    expect(result).toEqual([
      { label: 'Apple', count: 3 },
      { label: 'Samsung', count: 2 },
      { label: 'TP-Link', count: 1 },
    ]);
  });

  it('uses "Unknown" for devices with no vendor', () => {
    const devices = [
      makeDevice({ id: 'd1', vendor: undefined }),
      makeDevice({ id: 'd2', vendor: '' }),
      makeDevice({ id: 'd3', vendor: 'Apple' }),
    ];
    const result = buildBreakdownData(devices, 'vendor');
    expect(result).toEqual([
      { label: 'Unknown', count: 2 },
      { label: 'Apple', count: 1 },
    ]);
  });

  it('groups by tag with multi-tag devices counted in each group', () => {
    const devices = [
      makeDevice({ id: 'd1', tags: ['IoT', 'Critical'] }),
      makeDevice({ id: 'd2', tags: ['IoT'] }),
      makeDevice({ id: 'd3', tags: [] }),
    ];
    const result = buildBreakdownData(devices, 'tag');
    expect(result).toEqual([
      { label: 'IoT', count: 2 },
      { label: 'Critical', count: 1 },
      { label: 'Untagged', count: 1 },
    ]);
  });

  it('groups by status including unknown status', () => {
    const devices = [
      makeDevice({ id: 'd1', status: 'online', isOnline: true }),
      makeDevice({ id: 'd2', status: 'offline', isOnline: false }),
      makeDevice({ id: 'd3', status: 'unknown', isOnline: false }),
      makeDevice({ id: 'd4', isOnline: true }),
    ];
    const result = buildBreakdownData(devices, 'status');
    expect(result).toEqual([
      { label: 'Online', count: 2 },
      { label: 'Offline', count: 1 },
      { label: 'Unknown', count: 1 },
    ]);
  });

  it('groups by discovery method', () => {
    const devices = [
      makeDevice({ id: 'd1', discoveryMethod: 'arp' }),
      makeDevice({ id: 'd2', discoveryMethod: 'arp' }),
      makeDevice({ id: 'd3', discoveryMethod: 'ping' }),
      makeDevice({ id: 'd4', discoveryMethod: 'mdns' }),
    ];
    const result = buildBreakdownData(devices, 'method');
    expect(result).toEqual([
      { label: 'arp', count: 2 },
      { label: 'ping', count: 1 },
      { label: 'mdns', count: 1 },
    ]);
  });

  it('groups by age buckets with frozen time', () => {
    const now = new Date('2024-02-15T12:00:00Z').getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const devices = [
      makeDevice({ id: 'd1', firstSeenAt: new Date(now - 6 * 60 * 60 * 1000).toISOString() }),  // 6h ago → < 1 day
      makeDevice({ id: 'd2', firstSeenAt: new Date(now - 3 * DAY).toISOString() }),               // 3d ago → 1–7 days
      makeDevice({ id: 'd3', firstSeenAt: new Date(now - 15 * DAY).toISOString() }),              // 15d ago → 7–30 days
      makeDevice({ id: 'd4', firstSeenAt: new Date(now - 60 * DAY).toISOString() }),              // 60d ago → 30+ days
      makeDevice({ id: 'd5', firstSeenAt: new Date(now - 90 * DAY).toISOString() }),              // 90d ago → 30+ days
    ];
    const result = buildBreakdownData(devices, 'age', now);
    expect(result).toEqual([
      { label: '30+ days', count: 2 },
      { label: '< 1 day', count: 1 },
      { label: '1–7 days', count: 1 },
      { label: '7–30 days', count: 1 },
    ]);
  });

  it('groups by known/unknown flag', () => {
    const devices = [
      makeDevice({ id: 'd1', isKnown: true }),
      makeDevice({ id: 'd2', isKnown: true }),
      makeDevice({ id: 'd3', isKnown: false }),
    ];
    const result = buildBreakdownData(devices, 'known');
    expect(result).toEqual([
      { label: 'Known', count: 2 },
      { label: 'Unknown', count: 1 },
    ]);
  });
});
