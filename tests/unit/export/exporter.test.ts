import { describe, it, expect, beforeEach } from 'vitest';
import {
  exportDevicesCsv,
  exportDevicesJson,
  exportScansCsv,
  exportScansJson,
  generateExportFilename,
  escapeCsvField,
  filterByDateRange,
} from '@api/export/exporter.js';
import type { Device, Scan } from '@shared/types/device.js';

// ─── Test Helpers ───

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'd-001',
    macAddress: 'AA:BB:CC:DD:EE:FF',
    ipAddress: '192.168.1.42',
    hostname: 'samsung-tv.local',
    vendor: 'Samsung Electronics',
    displayName: 'Living Room TV',
    isKnown: true,
    isOnline: true,
    firstSeenAt: '2024-01-15T08:30:00Z',
    lastSeenAt: '2024-06-15T14:00:00Z',
    discoveryMethod: 'arp',
    tags: ['Media', 'IoT'],
    notes: 'Main media device',
    ...overrides,
  };
}

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: 's-001',
    status: 'completed',
    startedAt: '2024-06-15T14:00:00Z',
    completedAt: '2024-06-15T14:03:45Z',
    devicesFound: 47,
    newDevices: 2,
    subnetsScanned: ['192.168.1.0/24'],
    errors: [],
    scanIntensity: 'normal',
    ...overrides,
  };
}

describe('Data Export (F12)', () => {

  // ─── CSV Device Export ───

  describe('exportDevicesCsv', () => {
    it('should produce CSV with correct header columns', () => {
      const csv = exportDevicesCsv([makeDevice()]);
      const headerLine = csv.split('\n')[0];

      expect(headerLine).toContain('id');
      expect(headerLine).toContain('display_name');
      expect(headerLine).toContain('mac_address');
      expect(headerLine).toContain('current_ip');
      expect(headerLine).toContain('vendor');
      expect(headerLine).toContain('hostname');
      expect(headerLine).toContain('status');
      expect(headerLine).toContain('tags');
      expect(headerLine).toContain('first_seen');
      expect(headerLine).toContain('last_seen');
      expect(headerLine).toContain('open_ports');
      expect(headerLine).toContain('notes');
      expect(headerLine).toContain('is_known');
    });

    it('should produce one data row per device', () => {
      const devices = [
        makeDevice({ id: 'd-001' }),
        makeDevice({ id: 'd-002', macAddress: '11:22:33:44:55:66' }),
        makeDevice({ id: 'd-003', macAddress: '77:88:99:AA:BB:CC' }),
      ];

      const csv = exportDevicesCsv(devices);
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(4); // 1 header + 3 data
    });

    it('should return header-only CSV for empty device list', () => {
      const csv = exportDevicesCsv([]);
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(1); // header only
      expect(lines[0]).toContain('id');
    });

    it('should include device values in data rows', () => {
      const device = makeDevice({ id: 'd-abc', macAddress: 'AA:BB:CC:DD:EE:FF' });
      const csv = exportDevicesCsv([device]);
      const dataRow = csv.split('\n')[1];

      expect(dataRow).toContain('d-abc');
      expect(dataRow).toContain('AA:BB:CC:DD:EE:FF');
    });
  });

  // ─── JSON Device Export ───

  describe('exportDevicesJson', () => {
    it('should produce JSON with export envelope fields', () => {
      const devices = [makeDevice(), makeDevice({ id: 'd-002' })];
      const json = exportDevicesJson(devices);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('totalCount', 2);
      expect(parsed).toHaveProperty('devices');
      expect(parsed.devices).toHaveLength(2);
    });

    it('should include device fields in each device object', () => {
      const json = exportDevicesJson([makeDevice()]);
      const parsed = JSON.parse(json);
      const device = parsed.devices[0];

      expect(device).toHaveProperty('id');
      expect(device).toHaveProperty('macAddress');
      expect(device).toHaveProperty('currentIp');
      expect(device).toHaveProperty('vendor');
      expect(device).toHaveProperty('status');
    });

    it('should return empty devices array for no devices', () => {
      const json = exportDevicesJson([]);
      const parsed = JSON.parse(json);

      expect(parsed.totalCount).toBe(0);
      expect(parsed.devices).toEqual([]);
    });
  });

  // ─── CSV Scan Export ───

  describe('exportScansCsv', () => {
    it('should produce CSV with correct scan header columns', () => {
      const csv = exportScansCsv([makeScan()]);
      const headerLine = csv.split('\n')[0];

      expect(headerLine).toContain('scan_id');
      expect(headerLine).toContain('started_at');
      expect(headerLine).toContain('completed_at');
      expect(headerLine).toContain('duration_seconds');
      expect(headerLine).toContain('status');
      expect(headerLine).toContain('devices_found');
      expect(headerLine).toContain('new_devices');
    });

    it('should produce one data row per scan', () => {
      const scans = [
        makeScan({ id: 's-001' }),
        makeScan({ id: 's-002' }),
      ];

      const csv = exportScansCsv(scans);
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(3); // 1 header + 2 data
    });
  });

  // ─── JSON Scan Export ───

  describe('exportScansJson', () => {
    it('should produce JSON with scan export envelope', () => {
      const scans = [makeScan(), makeScan({ id: 's-002' })];
      const json = exportScansJson(scans);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('exportedAt');
      expect(parsed).toHaveProperty('totalCount', 2);
      expect(parsed).toHaveProperty('scans');
      expect(parsed.scans).toHaveLength(2);
    });

    it('should include scan fields in each scan object', () => {
      const json = exportScansJson([makeScan()]);
      const parsed = JSON.parse(json);
      const scan = parsed.scans[0];

      expect(scan).toHaveProperty('id');
      expect(scan).toHaveProperty('startedAt');
      expect(scan).toHaveProperty('status');
      expect(scan).toHaveProperty('devicesFound');
    });
  });

  // ─── Date Range Filtering ───

  describe('filterByDateRange', () => {
    it('should return only items within the date range', () => {
      const scans = [
        makeScan({ id: 's-jan', startedAt: '2024-01-15T10:00:00Z' }),
        makeScan({ id: 's-mar', startedAt: '2024-03-15T10:00:00Z' }),
        makeScan({ id: 's-jun', startedAt: '2024-06-15T10:00:00Z' }),
      ];

      const filtered = filterByDateRange(scans, '2024-03-01', '2024-04-01');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('s-mar');
    });

    it('should return all items when no date range is specified', () => {
      const scans = [makeScan({ id: 's-1' }), makeScan({ id: 's-2' })];

      const filtered = filterByDateRange(scans);

      expect(filtered).toHaveLength(2);
    });
  });

  // ─── CSV Escaping ───

  describe('escapeCsvField', () => {
    it('should return plain fields unmodified', () => {
      expect(escapeCsvField('hello')).toBe('hello');
    });

    it('should wrap fields containing commas in double quotes', () => {
      expect(escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('should escape embedded double quotes by doubling them', () => {
      expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
    });

    it('should wrap fields containing newlines in double quotes', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should handle fields with commas, quotes, and newlines together', () => {
      const field = 'a "tricky", value\nwith lines';
      const escaped = escapeCsvField(field);

      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);
      expect(escaped).toContain('""tricky""');
    });
  });

  // ─── Filename Generation ───

  describe('generateExportFilename', () => {
    it('should produce filename with type, date, and extension', () => {
      const date = new Date('2024-06-15T14:30:00Z');
      const filename = generateExportFilename('devices', 'csv', date);

      expect(filename).toBe('devices_2024-06-15_14-30-00.csv');
    });

    it('should use json extension for JSON format', () => {
      const date = new Date('2024-06-15T14:30:00Z');
      const filename = generateExportFilename('scans', 'json', date);

      expect(filename).toBe('scans_2024-06-15_14-30-00.json');
    });

    it('should use current time when no date is provided', () => {
      const filename = generateExportFilename('devices', 'csv');

      expect(filename).toMatch(/^devices_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/);
    });
  });
});
