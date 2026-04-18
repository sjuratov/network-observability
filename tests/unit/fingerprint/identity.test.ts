import { describe, it, expect } from 'vitest';
import {
  normalizeMac,
  isRandomizedMac,
  lookupVendor,
  buildCompositeFingerprint,
  resolveDeviceIdentity,
  trackIpChange,
  mergeDevices,
  splitDevice,
} from '@api/fingerprint/identity.js';
import type { DeviceIdentity } from '@api/fingerprint/identity.js';

// ─── Helpers ───

function makeDevice(overrides: Partial<DeviceIdentity> = {}): DeviceIdentity {
  return {
    id: 'dev-1',
    macAddress: 'aa:bb:cc:dd:ee:ff',
    normalizedMac: 'aa:bb:cc:dd:ee:ff',
    isRandomizedMac: false,
    vendor: null,
    hostname: null,
    compositeFingerprint: '',
    ipHistory: [],
    scanAppearances: 1,
    displayName: null,
    ...overrides,
  };
}

describe('Device Fingerprinting & Identity', () => {
  // ─── MAC-Based Identity ───

  describe('MAC-Based Identity', () => {
    // @inc-02 @f2 @must — Same MAC across scans resolves to same device
    it('should resolve same MAC to same device across scans', () => {
      const existing = makeDevice({
        macAddress: 'aa:bb:cc:dd:ee:ff',
        normalizedMac: 'aa:bb:cc:dd:ee:ff',
        ipHistory: [{ ipAddress: '192.168.1.100', firstSeen: '2024-01-01T00:00:00', lastSeen: '2024-01-15T00:00:00' }],
      });

      const resolved = resolveDeviceIdentity('aa:bb:cc:dd:ee:ff', '192.168.1.150', [existing]);

      expect(resolved.id).toBe(existing.id);
      expect(resolved.ipHistory.some(e => e.ipAddress === '192.168.1.150')).toBe(true);
      expect(resolved.ipHistory.some(e => e.ipAddress === '192.168.1.100')).toBe(true);
    });
  });

  // ─── MAC Normalization ───

  describe('MAC Address Normalization', () => {
    // @inc-02 @f2 @must — Uppercase colon-separated
    it('should normalize uppercase colon-separated MAC', () => {
      expect(normalizeMac('AA:BB:CC:DD:EE:FF')).toBe('aa:bb:cc:dd:ee:ff');
    });

    // @inc-02 @f2 @must — Dash-separated
    it('should normalize dash-separated MAC', () => {
      expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
    });

    // @inc-02 @f2 @must — No separator
    it('should normalize MAC with no separator', () => {
      expect(normalizeMac('AABBCCDDEEFF')).toBe('aa:bb:cc:dd:ee:ff');
    });

    // Already normalized
    it('should return already normalized MAC unchanged', () => {
      expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:dd:ee:ff');
    });
  });

  // ─── MAC Randomization Detection ───

  describe('MAC Randomization Detection', () => {
    // @inc-02 @f2 @should — Locally-administered bit set → randomized
    it('should flag locally-administered MAC as randomized', () => {
      // da → binary 1101 1010 → second nibble 'a' → bit 1 set
      expect(isRandomizedMac('da:a1:19:00:00:01')).toBe(true);
    });

    // @inc-02 @f2 @should — Universally-administered → not randomized
    it('should not flag universally-administered MAC as randomized', () => {
      // 3c → binary 0011 1100 → second nibble 'c' → bit 1 NOT set
      expect(isRandomizedMac('3c:22:fb:00:00:01')).toBe(false);
    });

    // Additional: second nibble values 2, 6, A, E
    it('should detect randomized MAC for second nibble value 2', () => {
      expect(isRandomizedMac('a2:00:00:00:00:00')).toBe(true);
    });

    it('should detect randomized MAC for second nibble value 6', () => {
      expect(isRandomizedMac('a6:00:00:00:00:00')).toBe(true);
    });

    it('should detect randomized MAC for second nibble value e', () => {
      expect(isRandomizedMac('ae:00:00:00:00:00')).toBe(true);
    });
  });

  // ─── OUI Vendor Lookup ───

  describe('OUI Vendor Lookup', () => {
    // @inc-02 @f2 @must — Known vendor
    it('should return vendor name for known OUI prefix', () => {
      const ouiDb = new Map<string, string>([['3c:22:fb', 'Apple, Inc.']]);

      const vendor = lookupVendor('3c:22:fb:aa:bb:cc', ouiDb);

      expect(vendor).toBe('Apple, Inc.');
    });

    // @inc-02 @f2 @must — Unknown prefix returns null
    it('should return null for unknown OUI prefix', () => {
      const ouiDb = new Map<string, string>();

      const vendor = lookupVendor('ff:ff:ff:00:00:01', ouiDb);

      expect(vendor).toBeNull();
    });
  });

  // ─── Composite Fingerprint ───

  describe('Composite Fingerprint', () => {
    // @inc-02 @f2 @must — Full signals
    it('should build fingerprint from all available signals', () => {
      const fp = buildCompositeFingerprint({
        mac: 'aa:bb:cc:dd:ee:ff',
        hostname: 'printer-office',
        vendor: 'HP Inc.',
        services: ['631/tcp', '9100/tcp'],
      });

      expect(fp).toContain('aa:bb:cc:dd:ee:ff');
      expect(fp).toContain('printer-office');
      expect(fp).toContain('HP Inc.');
      expect(fp).toContain('631/tcp');
      expect(fp).toContain('9100/tcp');
    });

    // @inc-02 @f2 @must — Minimal signals (MAC only)
    it('should build fingerprint with only MAC when no other signals', () => {
      const fp = buildCompositeFingerprint({
        mac: 'aa:bb:cc:dd:ee:ff',
        hostname: null,
        vendor: null,
        services: [],
      });

      expect(fp).toContain('aa:bb:cc:dd:ee:ff');
      expect(fp).not.toContain('null');
    });
  });

  // ─── IP History Tracking ───

  describe('IP History Tracking', () => {
    // @inc-02 @f2 @must — IP change recorded
    it('should record new IP in device history', () => {
      const device = makeDevice({
        ipHistory: [
          { ipAddress: '192.168.1.100', firstSeen: '2024-01-01T00:00:00', lastSeen: '2024-01-15T00:00:00' },
        ],
      });

      const updated = trackIpChange(device, '192.168.1.150', '2024-01-16T00:00:00');

      expect(updated.ipHistory).toHaveLength(2);
      expect(updated.ipHistory[1].ipAddress).toBe('192.168.1.150');
    });

    // @inc-02 @f2 @must — Same IP revisited creates new entry
    it('should create new entry when same IP is revisited after a different IP', () => {
      const device = makeDevice({
        ipHistory: [
          { ipAddress: '192.168.1.100', firstSeen: '2024-01-01T00:00:00', lastSeen: '2024-01-15T00:00:00' },
          { ipAddress: '192.168.1.150', firstSeen: '2024-01-16T00:00:00', lastSeen: '2024-02-01T00:00:00' },
        ],
      });

      const updated = trackIpChange(device, '192.168.1.100', '2024-02-02T00:00:00');

      expect(updated.ipHistory).toHaveLength(3);
      expect(updated.ipHistory[2].ipAddress).toBe('192.168.1.100');
    });

    // @inc-02 @f2 @must — Multiple IPs tracked independently
    it('should track multiple IPs independently', () => {
      let device = makeDevice();

      device = trackIpChange(device, '192.168.1.10', '2024-01-01T00:00:00');
      device = trackIpChange(device, '192.168.1.20', '2024-01-02T00:00:00');

      expect(device.ipHistory).toHaveLength(2);
    });
  });

  // ─── Device Merge ───

  describe('Device Merge', () => {
    // @inc-02 @f2 @must — Two records merged into one
    it('should merge two devices into one record', () => {
      const deviceA = makeDevice({
        id: 'dev-a',
        macAddress: 'aa:bb:cc:11:22:33',
        normalizedMac: 'aa:bb:cc:11:22:33',
        scanAppearances: 5,
        ipHistory: [
          { ipAddress: '192.168.1.10', firstSeen: '2024-01-01', lastSeen: '2024-01-05' },
        ],
      });
      const deviceB = makeDevice({
        id: 'dev-b',
        macAddress: 'aa:bb:cc:44:55:66',
        normalizedMac: 'aa:bb:cc:44:55:66',
        scanAppearances: 3,
        ipHistory: [
          { ipAddress: '192.168.1.20', firstSeen: '2024-01-02', lastSeen: '2024-01-06' },
        ],
      });

      const result = mergeDevices(deviceA, deviceB, 'Main Server');

      expect(result.mergedDevice.scanAppearances).toBe(8);
      expect(result.mergedDevice.displayName).toBe('Main Server');
      expect(result.removedDeviceIds).toContain('dev-b');
    });

    // @inc-02 @f2 @must — Merge combines IP histories
    it('should combine IP histories from both devices', () => {
      const deviceA = makeDevice({
        id: 'dev-a',
        ipHistory: [
          { ipAddress: '192.168.1.10', firstSeen: '2024-01-01', lastSeen: '2024-01-05' },
          { ipAddress: '192.168.1.11', firstSeen: '2024-01-06', lastSeen: '2024-01-10' },
        ],
      });
      const deviceB = makeDevice({
        id: 'dev-b',
        ipHistory: [
          { ipAddress: '192.168.1.20', firstSeen: '2024-01-02', lastSeen: '2024-01-06' },
          { ipAddress: '192.168.1.21', firstSeen: '2024-01-07', lastSeen: '2024-01-11' },
          { ipAddress: '192.168.1.22', firstSeen: '2024-01-12', lastSeen: '2024-01-15' },
        ],
      });

      const result = mergeDevices(deviceA, deviceB, 'Server');

      expect(result.mergedDevice.ipHistory).toHaveLength(5);
    });
  });

  // ─── Device Split ───

  describe('Device Split', () => {
    // @inc-02 @f2 @must — Split device into two records
    it('should split a device into two records by MAC', () => {
      const device = makeDevice({
        id: 'dev-merged',
        macAddress: 'aa:bb:cc:11:22:33',
        normalizedMac: 'aa:bb:cc:11:22:33',
        scanAppearances: 10,
      });

      const result = splitDevice(device, 'dd:ee:ff:11:22:33', 4);

      expect(result.originalDevice.scanAppearances).toBe(6);
      expect(result.newDevice.scanAppearances).toBe(4);
    });

    // No data lost after split
    it('should not lose scan data after split', () => {
      const device = makeDevice({
        scanAppearances: 10,
      });

      const result = splitDevice(device, 'dd:ee:ff:11:22:33', 4);
      const totalAfter = result.originalDevice.scanAppearances + result.newDevice.scanAppearances;

      expect(totalAfter).toBe(10);
    });
  });
});
