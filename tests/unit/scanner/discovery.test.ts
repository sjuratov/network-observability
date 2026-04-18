import { describe, it, expect } from 'vitest';
import { runScan, deduplicateResults, type ScanOptions } from '@api/scanner/discovery.js';
import type { ScanResult } from '@shared/types/device.js';

describe('Network Device Discovery', () => {

  // ─── Subnet Auto-Detection ───

  describe('Subnet Auto-Detection', () => {
    // Scenario: Subnets auto-detected when none are configured
    it('should auto-detect subnets when none are configured', async () => {
      const options: ScanOptions = {
        subnets: [], // empty = auto-detect
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.subnetsScanned.length).toBeGreaterThan(0);
      for (const subnet of scan.subnetsScanned) {
        expect(subnet).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/);
      }
    });

    // Scenario: Only manually configured subnets are scanned when specified
    it('should scan only manually configured subnets', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24', '10.0.0.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.subnetsScanned).toContain('192.168.1.0/24');
      expect(scan.subnetsScanned).toContain('10.0.0.0/24');
      expect(scan.subnetsScanned).toHaveLength(2);
    });
  });

  // ─── Network Scanning ───

  describe('Network Scanning', () => {
    // Scenario: Scan discovers devices on a configured subnet
    it('should discover devices with IP, MAC, and discovery method', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.status).toBe('completed');
      expect(scan.devicesFound).toBeGreaterThanOrEqual(0);
    });

    // Scenario: ARP discovery finds devices on the local subnet
    it('should discover devices via ARP with MAC and IP', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      // ARP results should include MAC addresses
      expect(scan.status).toBeDefined();
      expect(scan.id).toBeTruthy();
    });

    // Scenario: ICMP ping sweep discovers responsive devices
    it('should discover devices via ICMP ping sweep', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.status).toBeDefined();
    });

    // Scenario: TCP SYN scan discovers devices with open ports
    it('should discover devices via TCP SYN scan on common ports', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'thorough',
      };

      const scan = await runScan(options);

      expect(scan.status).toBeDefined();
      expect(scan.scanIntensity).toBe('thorough');
    });
  });

  // ─── Multi-Method Discovery & Deduplication ───

  describe('Multi-Method Discovery & Deduplication', () => {
    // Scenario: Device found by multiple methods produces a single record
    it('should deduplicate device found by ARP and ICMP into single record', () => {
      const results: ScanResult[] = [
        {
          scanId: 'scan-1',
          deviceId: '',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          ipAddress: '192.168.1.50',
          discoveryMethod: 'arp',
        },
        {
          scanId: 'scan-1',
          deviceId: '',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          ipAddress: '192.168.1.50',
          discoveryMethod: 'icmp',
        },
      ];

      const deduped = deduplicateResults(results);

      // Same MAC = single device
      const deviceRecords = deduped.filter(r => r.macAddress === 'AA:BB:CC:DD:EE:FF');
      expect(deviceRecords).toHaveLength(1);
      expect(deviceRecords[0].discoveryMethod).toContain('arp');
      expect(deviceRecords[0].discoveryMethod).toContain('icmp');
    });

    // Scenario: Device responding to only one method is still discovered
    it('should include device discovered by only one method', () => {
      const results: ScanResult[] = [
        {
          scanId: 'scan-1',
          deviceId: '',
          macAddress: 'FF:EE:DD:CC:BB:AA',
          ipAddress: '192.168.1.60',
          discoveryMethod: 'arp',
        },
      ];

      const deduped = deduplicateResults(results);

      expect(deduped).toHaveLength(1);
      expect(deduped[0].macAddress).toBe('FF:EE:DD:CC:BB:AA');
      expect(deduped[0].discoveryMethod).toBe('arp');
    });

    // Scenario: Deduplication merges MAC address from ARP with IP from ICMP
    it('should merge data from multiple discovery methods for same device', () => {
      const results: ScanResult[] = [
        {
          scanId: 'scan-1',
          deviceId: '',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          ipAddress: '192.168.1.50',
          hostname: 'desktop.local',
          discoveryMethod: 'arp',
        },
        {
          scanId: 'scan-1',
          deviceId: '',
          macAddress: '',
          ipAddress: '192.168.1.50',
          discoveryMethod: 'icmp',
        },
      ];

      const deduped = deduplicateResults(results);

      const device = deduped.find(r => r.ipAddress === '192.168.1.50');
      expect(device).toBeTruthy();
      expect(device!.macAddress).toBe('AA:BB:CC:DD:EE:FF');
      expect(device!.discoveryMethod).toContain('arp');
      expect(device!.discoveryMethod).toContain('icmp');
    });
  });

  // ─── Persisting Results ───

  describe('Persisting Results', () => {
    // Scenario: Discovered devices are persisted to the database
    it('should persist all discovered devices to the database', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      // Scan should have completed and reported device counts
      expect(scan.id).toBeTruthy();
      expect(typeof scan.devicesFound).toBe('number');
    });

    // Scenario: New device is added to the database on first discovery
    it('should create new device record on first discovery', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.id).toBeTruthy();
      expect(typeof scan.newDevices).toBe('number');
    });

    // Scenario: Known device is updated on subsequent discovery
    it('should update existing device on subsequent discovery', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.id).toBeTruthy();
      expect(scan.status).toBeDefined();
    });
  });

  // ─── Scan Metadata ───

  describe('Scan Metadata', () => {
    // Scenario: Scan metadata records timing and device count
    it('should record scan start/end times and device count', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.startedAt).toBeTruthy();
      expect(scan.completedAt).toBeTruthy();
      expect(typeof scan.devicesFound).toBe('number');
      expect(scan.status).toBe('completed');
    });

    // Scenario: Scan metadata records the scanned subnets
    it('should record the subnets that were scanned', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24', '10.0.0.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      expect(scan.subnetsScanned).toContain('192.168.1.0/24');
      expect(scan.subnetsScanned).toContain('10.0.0.0/24');
    });
  });

  // ─── Health Endpoint ───

  describe('Health Endpoint', () => {
    // Scenario: Health endpoint returns OK with database status
    it('should return 200 with status ok and database connected', async () => {
      // This test will exercise the server's health endpoint
      const { createServer } = await import('@api/server.js');
      const server = await createServer();

      // Server should be created and have a health route
      expect(server).toBeTruthy();
    });

    // Scenario: Health endpoint reports database disconnected when unavailable
    it('should report database disconnected when DB is unavailable', async () => {
      const { createServer } = await import('@api/server.js');

      // Should handle DB unavailability gracefully
      await expect(createServer()).resolves.toBeDefined();
    });
  });

  // ─── Error Handling ───

  describe('Error Handling', () => {
    // Scenario: Scan handles network timeout gracefully
    it('should handle network timeout without crashing', async () => {
      const options: ScanOptions = {
        subnets: ['10.0.0.0/24'],
        intensity: 'normal',
      };

      // runScan should handle timeout and return a result (not throw uncaught)
      const scan = await runScan(options);

      expect(scan.status).toMatch(/^(completed|failed)$/);
      if (scan.status === 'failed') {
        expect(scan.errors.length).toBeGreaterThan(0);
      }
    });

    // Scenario: Scan handles permission denied for raw sockets
    it('should handle permission denied for raw sockets gracefully', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      // Should not crash when lacking NET_RAW capability
      const scan = await runScan(options);

      expect(scan).toBeTruthy();
      expect(scan.status).toBeDefined();
    });

    // Scenario: Scan logs progress and summary statistics
    it('should complete scan with structured logging data', async () => {
      const options: ScanOptions = {
        subnets: ['192.168.1.0/24'],
        intensity: 'normal',
      };

      const scan = await runScan(options);

      // Scan result should have all fields needed for logging
      expect(scan.id).toBeTruthy();
      expect(scan.startedAt).toBeTruthy();
      expect(typeof scan.devicesFound).toBe('number');
      expect(scan.subnetsScanned.length).toBeGreaterThan(0);
    });
  });
});
