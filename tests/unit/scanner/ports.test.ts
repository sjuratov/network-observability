import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  scanPorts,
  detectPortChanges,
  identifyService,
  parsePortRange,
  extractVersion,
  parseNmapPortXml,
  parseNmapPortXmlFile,
  computePortScanTimeoutMs,
} from '@api/scanner/ports.js';
import type { PortScanResult } from '@api/scanner/ports.js';

describe('Port & Service Detection (F5)', () => {
  // ─── TCP Port Scanning ───

  describe('TCP Port Scanning', () => {
    it('should detect open TCP ports on a device', async () => {
      const results = await scanPorts('192.168.1.10', 'top-100', 'normal');

      expect(Array.isArray(results)).toBe(true);
      for (const r of results) {
        expect(r).toHaveProperty('port');
        expect(r).toHaveProperty('protocol');
        expect(r).toHaveProperty('state');
      }
    });

    it('should return an empty list for a device with no open ports', async () => {
      const results = await scanPorts('192.168.1.50', 'top-100', 'normal');

      expect(Array.isArray(results)).toBe(true);
    });

    it('preserves every open port from nmap XML even when stdout contains non-XML text before the XML payload', () => {
      // Validates: specs/frd-port-detection.md AC-1, F5.7, F5.10
      const expectedPorts = [
        { port: 1234, protocol: 'tcp', state: 'open', service: 'svc-a', version: undefined },
        { port: 5678, protocol: 'tcp', state: 'open', service: 'svc-b', version: undefined },
      ] as const;

      const xmlPorts = expectedPorts.map(
        (entry) => `
      <port protocol="${entry.protocol}" portid="${entry.port}">
        <state state="${entry.state}" />
        <service name="${entry.service}" />
      </port>`,
      ).join('');

      const stdout = `Starting Nmap 7.94SVN
<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up" reason="syn-ack" />
    <address addr="192.168.1.200" addrtype="ipv4" />
    <ports>${xmlPorts}
    </ports>
  </host>
</nmaprun>`;

      expect(parseNmapPortXml(stdout)).toEqual(expectedPorts);
    });

    it('parses every open port from an nmap XML output file', () => {
      // Validates: specs/frd-port-detection.md AC-1, F5.7, F5.10
      const expectedPorts = [
        { port: 1234, protocol: 'tcp', state: 'open', service: 'svc-a', version: undefined },
        { port: 5678, protocol: 'tcp', state: 'open', service: 'svc-b', version: undefined },
      ] as const;

      const xmlPorts = expectedPorts.map(
        (entry) => `
      <port protocol="${entry.protocol}" portid="${entry.port}">
        <state state="${entry.state}" />
        <service name="${entry.service}" />
      </port>`,
      ).join('');

      const xml = `<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up" reason="syn-ack" />
    <address addr="192.168.1.200" addrtype="ipv4" />
    <ports>${xmlPorts}
    </ports>
  </host>
</nmaprun>`;

      const tempDir = mkdtempSync(join(tmpdir(), 'netobserver-'));
      const xmlFile = join(tempDir, 'scan.xml');
      writeFileSync(xmlFile, xml, 'utf8');

      try {
        expect(parseNmapPortXmlFile(xmlFile)).toEqual(expectedPorts);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('scales multi-host port scan timeout by discovered host count', () => {
      // Validates: specs/frd-port-detection.md F5.7, F5.9
      expect(computePortScanTimeoutMs({
        hostCount: 27,
        perHostTimeoutMs: 120_000,
        minimumTimeoutMs: 180_000,
      })).toBe(3_240_000);

      expect(computePortScanTimeoutMs({
        hostCount: 1,
        perHostTimeoutMs: 120_000,
        minimumTimeoutMs: 180_000,
      })).toBe(180_000);
    });
  });

  // ─── Service Identification ───

  describe('Service Identification', () => {
    it('should identify SSH on port 22', () => {
      const service = identifyService(22);

      expect(service).toBe('ssh');
    });

    it('should identify HTTP on port 80', () => {
      const service = identifyService(80);

      expect(service).toBe('http');
    });

    it('should identify HTTPS on port 443', () => {
      const service = identifyService(443);

      expect(service).toBe('https');
    });

    it('should identify DNS on port 53', () => {
      const service = identifyService(53);

      expect(service).toBe('dns');
    });

    it('should identify SMB on port 445', () => {
      const service = identifyService(445);

      expect(service).toBe('smb');
    });

    it('should identify IPP (printer) on port 631', () => {
      const service = identifyService(631);

      expect(service).toBe('ipp');
    });

    it('should identify HTTP-Alt on port 8080', () => {
      const service = identifyService(8080);

      expect(service).toBe('http-alt');
    });

    it('should return null for an unknown port with no banner', () => {
      const service = identifyService(54321);

      expect(service).toBeNull();
    });
  });

  // ─── Port Range Parsing ───

  describe('Port Range Parsing', () => {
    it('should parse top-100 preset into 100 ports', () => {
      const ports = parsePortRange('top-100');

      expect(ports).toHaveLength(100);
      for (const p of ports) {
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(65535);
      }
    });

    it('should parse top-1000 preset into 1000 ports', () => {
      const ports = parsePortRange('top-1000');

      expect(ports).toHaveLength(1000);
    });

    it('includes 1080 and 8888 in the top-1000 preset used for normal scans', () => {
      // Validates: specs/frd-port-detection.md AC-1, F5.5, F5.8
      const ports = parsePortRange('top-1000');

      expect(ports).toContain(1080);
      expect(ports).toContain(8888);
      expect(ports).toHaveLength(1000);
    });

    it('should parse a custom range "1-1024" into sequential ports', () => {
      const ports = parsePortRange('1-1024');

      expect(ports).toHaveLength(1024);
      expect(ports[0]).toBe(1);
      expect(ports[ports.length - 1]).toBe(1024);
    });

    it('should parse a custom range with commas "22,80,443"', () => {
      const ports = parsePortRange('22,80,443');

      expect(ports).toEqual([22, 80, 443]);
    });
  });

  // ─── Port Change Tracking ───

  describe('Port Change Tracking', () => {
    const makePort = (port: number, state: 'open' | 'closed' = 'open'): PortScanResult => ({
      port,
      protocol: 'tcp',
      state,
    });

    it('should detect a newly opened port', () => {
      const previous: PortScanResult[] = [makePort(22), makePort(80)];
      const current: PortScanResult[] = [makePort(22), makePort(80), makePort(443)];

      const changes = detectPortChanges('device-1', current, previous);

      expect(changes.length).toBeGreaterThanOrEqual(1);
      const opened = changes.find(c => c.port === 443);
      expect(opened).toBeDefined();
      expect(opened!.previousState).toBe('closed');
      expect(opened!.currentState).toBe('open');
    });

    it('should detect a closed port', () => {
      const previous: PortScanResult[] = [makePort(22), makePort(80), makePort(8080)];
      const current: PortScanResult[] = [makePort(22), makePort(80)];

      const changes = detectPortChanges('device-1', current, previous);

      expect(changes.length).toBeGreaterThanOrEqual(1);
      const closed = changes.find(c => c.port === 8080);
      expect(closed).toBeDefined();
      expect(closed!.previousState).toBe('open');
      expect(closed!.currentState).toBe('closed');
    });

    it('should return no changes when ports are identical', () => {
      const ports: PortScanResult[] = [makePort(22), makePort(80)];

      const changes = detectPortChanges('device-1', ports, ports);

      expect(changes).toHaveLength(0);
    });

    it('should include a detection timestamp on each change', () => {
      const previous: PortScanResult[] = [makePort(22)];
      const current: PortScanResult[] = [makePort(22), makePort(443)];

      const changes = detectPortChanges('device-1', current, previous);

      for (const change of changes) {
        expect(change.detectedAt).toBeTruthy();
      }
    });
  });

  // ─── Version Detection ───

  describe('Version Detection', () => {
    it('should extract version from SSH banner', () => {
      const version = extractVersion('SSH-2.0-OpenSSH_8.9');

      expect(version).toBe('OpenSSH_8.9');
    });

    it('should return null for banner with no version info', () => {
      const version = extractVersion('');

      expect(version).toBeNull();
    });

    it('should identify service from banner when port is unknown', () => {
      const service = identifyService(2222, 'SSH-2.0-OpenSSH_8.9');

      expect(service).toBe('ssh');
    });
  });
});
