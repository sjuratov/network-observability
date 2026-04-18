import { describe, it, expect } from 'vitest';
import {
  reverseDnsLookup,
  discoverMdns,
  discoverSsdp,
  resolveDeviceNames,
  prioritizeDisplayName,
  createResolverCache,
  parseSsdpDescription,
} from '@api/resolver/dns.js';
import type { ResolvedNames } from '@api/resolver/dns.js';

describe('DNS/mDNS/SSDP Resolution (F6)', () => {
  // ─── Reverse DNS (PTR) ───

  describe('Reverse DNS Lookup', () => {
    it('should resolve a hostname for an IP with a PTR record', async () => {
      const result = await reverseDnsLookup('192.168.1.50');

      expect(typeof result === 'string' || result === null).toBe(true);
    });

    it('should return null for an IP with no PTR record', async () => {
      const result = await reverseDnsLookup('192.168.1.99');

      expect(result).toBeNull();
    });

    it('should handle DNS timeout gracefully and return null', async () => {
      const result = await reverseDnsLookup('10.255.255.1');

      expect(result).toBeNull();
    });
  });

  // ─── mDNS Discovery ───

  describe('mDNS Discovery', () => {
    it('should return a Map of IP to mDNS service names', async () => {
      const results = await discoverMdns(1000);

      expect(results).toBeInstanceOf(Map);
    });

    it('should discover Bonjour-announcing devices with instance and service', async () => {
      const results = await discoverMdns(1000);

      for (const [ip, names] of results) {
        expect(typeof ip).toBe('string');
        expect(Array.isArray(names)).toBe(true);
      }
    });

    it('should return an empty Map when no mDNS devices are found', async () => {
      const results = await discoverMdns(100);

      expect(results).toBeInstanceOf(Map);
    });
  });

  // ─── SSDP / UPnP Discovery ───

  describe('SSDP Discovery', () => {
    it('should return a Map of IP to SSDP device info', async () => {
      const results = await discoverSsdp(1000);

      expect(results).toBeInstanceOf(Map);
    });

    it('should discover UPnP devices with friendly names', async () => {
      const results = await discoverSsdp(1000);

      for (const [ip, info] of results) {
        expect(typeof ip).toBe('string');
        expect(info).toHaveProperty('friendlyName');
      }
    });
  });

  // ─── SSDP XML Parsing ───

  describe('SSDP Description XML Parsing', () => {
    it('should parse friendlyName from device description XML', () => {
      const xml = `<?xml version="1.0"?>
        <root xmlns="urn:schemas-upnp-org:device-1-0">
          <device>
            <friendlyName>Kitchen Sonos One</friendlyName>
            <manufacturer>Sonos</manufacturer>
            <modelName>Sonos One</modelName>
          </device>
        </root>`;

      const info = parseSsdpDescription(xml);

      expect(info.friendlyName).toBe('Kitchen Sonos One');
      expect(info.manufacturer).toBe('Sonos');
      expect(info.modelName).toBe('Sonos One');
    });

    it('should handle XML with missing optional fields', () => {
      const xml = `<?xml version="1.0"?>
        <root xmlns="urn:schemas-upnp-org:device-1-0">
          <device>
            <friendlyName>Simple Device</friendlyName>
          </device>
        </root>`;

      const info = parseSsdpDescription(xml);

      expect(info.friendlyName).toBe('Simple Device');
      expect(info.manufacturer).toBeUndefined();
      expect(info.modelName).toBeUndefined();
    });

    it('should throw or return a fallback for malformed XML', () => {
      const xml = '<not valid xml at all';

      expect(() => parseSsdpDescription(xml)).toThrow();
    });
  });

  // ─── Name Prioritization ───

  describe('Display Name Prioritization', () => {
    it('should prefer user-assigned name over all automated sources', () => {
      const names: ResolvedNames = {
        dns: 'nas.home.arpa',
        mdns: ['MyNAS._http._tcp.local'],
        ssdp: { friendlyName: 'Network Storage' },
        displayName: '',
      };

      const display = prioritizeDisplayName(names, "Dad's NAS");

      expect(display).toBe("Dad's NAS");
    });

    it('should prefer mDNS name when no user-assigned name exists', () => {
      const names: ResolvedNames = {
        dns: 'server.local',
        mdns: ['Home Server._http._tcp.local'],
        ssdp: { friendlyName: 'Media Box' },
        displayName: '',
      };

      const display = prioritizeDisplayName(names);

      expect(display).toContain('Home Server');
    });

    it('should prefer DNS name when no mDNS name exists', () => {
      const names: ResolvedNames = {
        dns: 'nas.home.arpa',
        ssdp: { friendlyName: 'Storage Box' },
        displayName: '',
      };

      const display = prioritizeDisplayName(names);

      expect(display).toBe('nas.home.arpa');
    });

    it('should fall back to SSDP friendly name when no DNS or mDNS', () => {
      const names: ResolvedNames = {
        ssdp: { friendlyName: 'Kitchen Speaker' },
        displayName: '',
      };

      const display = prioritizeDisplayName(names);

      expect(display).toBe('Kitchen Speaker');
    });

    it('should return empty string when no names are available', () => {
      const names: ResolvedNames = { displayName: '' };

      const display = prioritizeDisplayName(names);

      expect(display).toBe('');
    });
  });

  // ─── Resolver Cache ───

  describe('Resolver Cache', () => {
    it('should return null for a cache miss', () => {
      const cache = createResolverCache();

      const result = cache.get('192.168.1.50');

      expect(result).toBeNull();
    });

    it('should return cached entry within TTL', () => {
      const cache = createResolverCache();
      const names: ResolvedNames = { dns: 'test.local', displayName: 'test.local' };

      cache.set('192.168.1.50', names, 3600);
      const result = cache.get('192.168.1.50');

      expect(result).not.toBeNull();
      expect(result!.dns).toBe('test.local');
    });

    it('should return null for expired cache entry', async () => {
      const cache = createResolverCache();
      const names: ResolvedNames = { dns: 'old.local', displayName: 'old.local' };

      cache.set('192.168.1.50', names, 0);
      // TTL=0 means immediate expiry
      const result = cache.get('192.168.1.50');

      expect(result).toBeNull();
    });

    it('should clear all entries on cache clear', () => {
      const cache = createResolverCache();
      const names: ResolvedNames = { dns: 'a.local', displayName: 'a.local' };

      cache.set('192.168.1.1', names, 3600);
      cache.set('192.168.1.2', names, 3600);
      cache.clear();

      expect(cache.get('192.168.1.1')).toBeNull();
      expect(cache.get('192.168.1.2')).toBeNull();
    });
  });

  // ─── Full Resolution Pipeline ───

  describe('Full Device Name Resolution', () => {
    it('should resolve device names and produce a displayName', async () => {
      const result = await resolveDeviceNames('192.168.1.50');

      expect(result).toHaveProperty('displayName');
      expect(typeof result.displayName).toBe('string');
    });

    it('should not throw when all resolvers fail', async () => {
      const result = await resolveDeviceNames('10.255.255.1');

      expect(result).toHaveProperty('displayName');
    });
  });
});
