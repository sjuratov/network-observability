import dns from 'node:dns';
import { XMLParser } from 'fast-xml-parser';

export interface ResolvedNames {
  dns?: string;
  mdns?: string[];
  ssdp?: SsdpDeviceInfo;
  displayName: string;
}

export interface SsdpDeviceInfo {
  friendlyName: string;
  manufacturer?: string;
  modelName?: string;
}

export interface ResolverCache {
  get(ip: string): ResolvedNames | null;
  set(ip: string, names: ResolvedNames, ttl: number): void;
  clear(): void;
}

export async function reverseDnsLookup(ip: string): Promise<string | null> {
  try {
    const hostnames = await dns.promises.reverse(ip);
    return hostnames.length > 0 ? hostnames[0] : null;
  } catch {
    return null;
  }
}

export async function discoverMdns(timeout: number = 5000): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  try {
    const mdnsModule = await import('multicast-dns');
    const mdns = mdnsModule.default();
    return await new Promise<Map<string, string[]>>((resolve) => {
      setTimeout(() => {
        mdns.destroy();
        resolve(results);
      }, timeout);

      mdns.on('response', (response: { answers: Array<{ type: string; name: string; data: string }> }) => {
        for (const answer of response.answers) {
          if (answer.type === 'PTR' || answer.type === 'SRV') {
            const ip = answer.data;
            const existing = results.get(ip) ?? [];
            existing.push(answer.name);
            results.set(ip, existing);
          }
        }
      });

      mdns.query({ questions: [{ name: '_services._dns-sd._udp.local', type: 'PTR' }] });
    });
  } catch {
    return results;
  }
}

export async function discoverSsdp(timeout: number = 5000): Promise<Map<string, SsdpDeviceInfo>> {
  const results = new Map<string, SsdpDeviceInfo>();
  try {
    const ssdpModule = await import('node-ssdp');
    const client = new ssdpModule.Client();
    return await new Promise<Map<string, SsdpDeviceInfo>>((resolve) => {
      setTimeout(() => {
        client.stop();
        resolve(results);
      }, timeout);

      client.on('response', (headers: any, _statusCode: number, rinfo: { address: string }) => {
        if (!results.has(rinfo.address)) {
          results.set(rinfo.address, {
            friendlyName: headers.SERVER ?? headers.USN ?? rinfo.address,
            manufacturer: undefined,
            modelName: undefined,
          });
        }
      });

      client.search('ssdp:all');
    });
  } catch {
    return results;
  }
}

export function parseSsdpDescription(xml: string): SsdpDeviceInfo {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
  });

  const parsed = parser.parse(xml);
  const device = parsed?.root?.device;

  if (!device || !device.friendlyName) {
    throw new Error('Invalid SSDP description XML: missing device or friendlyName');
  }

  return {
    friendlyName: device.friendlyName,
    manufacturer: device.manufacturer ?? undefined,
    modelName: device.modelName ?? undefined,
  };
}

export function prioritizeDisplayName(names: ResolvedNames, userAssigned?: string): string {
  if (userAssigned) return userAssigned;

  if (names.mdns && names.mdns.length > 0) {
    const first = names.mdns[0];
    // Extract instance name before the service type (e.g. "Home Server" from "Home Server._http._tcp.local")
    const match = first.match(/^(.+?)\._/);
    return match ? match[1] : first;
  }

  if (names.dns) return names.dns;

  if (names.ssdp?.friendlyName) return names.ssdp.friendlyName;

  return '';
}

export function createResolverCache(): ResolverCache {
  const store = new Map<string, { names: ResolvedNames; expiresAt: number }>();

  return {
    get(ip: string): ResolvedNames | null {
      const entry = store.get(ip);
      if (!entry) return null;
      if (Date.now() >= entry.expiresAt) {
        store.delete(ip);
        return null;
      }
      return entry.names;
    },
    set(ip: string, names: ResolvedNames, ttl: number): void {
      store.set(ip, { names, expiresAt: Date.now() + ttl * 1000 });
    },
    clear(): void {
      store.clear();
    },
  };
}

export async function resolveDeviceNames(ip: string, cache?: ResolverCache): Promise<ResolvedNames> {
  if (cache) {
    const cached = cache.get(ip);
    if (cached) return cached;
  }

  const [dnsName, mdnsResults, ssdpResults] = await Promise.all([
    reverseDnsLookup(ip),
    discoverMdns(1000).catch(() => new Map<string, string[]>()),
    discoverSsdp(1000).catch(() => new Map<string, SsdpDeviceInfo>()),
  ]);

  const names: ResolvedNames = {
    dns: dnsName ?? undefined,
    mdns: mdnsResults.get(ip),
    ssdp: ssdpResults.get(ip),
    displayName: '',
  };

  names.displayName = prioritizeDisplayName(names);

  if (cache) {
    cache.set(ip, names, 300);
  }

  return names;
}
