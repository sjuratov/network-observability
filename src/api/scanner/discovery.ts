import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import type { ScanResult, Scan } from '@shared/types/device.js';

export interface ScanOptions {
  subnets: string[];
  intensity: 'quick' | 'normal' | 'thorough';
}

/** Detect local subnets from network interfaces. */
export function detectSubnets(): string[] {
  const ifaces = networkInterfaces();
  const subnets: string[] = [];
  for (const entries of Object.values(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.internal || entry.family !== 'IPv4') continue;
      const cidr = entry.cidr;
      if (cidr) {
        // Normalise to network address from CIDR
        const [ip, prefix] = cidr.split('/');
        const parts = ip.split('.').map(Number);
        const mask = prefix ? Number(prefix) : 24;
        const maskBits = (0xffffffff << (32 - mask)) >>> 0;
        const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
        const netNum = (ipNum & maskBits) >>> 0;
        const netAddr = `${(netNum >>> 24) & 0xff}.${(netNum >>> 16) & 0xff}.${(netNum >>> 8) & 0xff}.${netNum & 0xff}`;
        subnets.push(`${netAddr}/${mask}`);
      }
    }
  }
  return subnets.length > 0 ? subnets : ['192.168.1.0/24'];
}

/** Run nmap with given args and return XML stdout. */
function execNmap(args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('nmap', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/** Run an ARP scan on a subnet. */
async function runArpScan(subnet: string, scanId: string): Promise<ScanResult[]> {
  const xml = await execNmap(['-sn', '-PR', subnet, '-oX', '-']);
  return parseNmapXml(xml, scanId, 'arp');
}

/** Run an ICMP ping sweep on a subnet. */
async function runIcmpScan(subnet: string, scanId: string): Promise<ScanResult[]> {
  const xml = await execNmap(['-sn', '-PE', subnet, '-oX', '-']);
  return parseNmapXml(xml, scanId, 'icmp');
}

/** Run a TCP SYN scan on a subnet. */
async function runTcpSynScan(subnet: string, scanId: string, ports = '22,80,443,8080,8443'): Promise<ScanResult[]> {
  const xml = await execNmap(['-sS', '-p', ports, subnet, '-oX', '-']);
  return parseNmapXml(xml, scanId, 'tcp_syn');
}

/** Parse nmap XML output into ScanResult[]. */
function parseNmapXml(xml: string, scanId: string, method: string): ScanResult[] {
  try {
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const doc = parser.parse(xml);

    const hosts = Array.isArray(doc?.nmaprun?.host)
      ? doc.nmaprun.host
      : doc?.nmaprun?.host
        ? [doc.nmaprun.host]
        : [];

    const results: ScanResult[] = [];
    for (const host of hosts) {
      const status = host?.status?.['@_state'] ?? host?.status;
      if (status === 'down') continue;

      let ip = '';
      let mac = '';
      let hostname = '';
      let vendor = '';

      const addrs = Array.isArray(host.address) ? host.address : host.address ? [host.address] : [];
      for (const addr of addrs) {
        const type = addr['@_addrtype'];
        if (type === 'ipv4') ip = addr['@_addr'] ?? '';
        if (type === 'mac') {
          mac = addr['@_addr'] ?? '';
          vendor = addr['@_vendor'] ?? '';
        }
      }

      if (host.hostnames?.hostname) {
        const hn = Array.isArray(host.hostnames.hostname) ? host.hostnames.hostname[0] : host.hostnames.hostname;
        hostname = hn?.['@_name'] ?? '';
      }

      if (!ip) continue;

      results.push({
        scanId,
        deviceId: '',
        macAddress: mac,
        ipAddress: ip,
        hostname: hostname || undefined,
        vendor: vendor || undefined,
        discoveryMethod: method,
      });
    }
    return results;
  } catch {
    return [];
  }
}

/** Run a full network scan. */
export async function runScan(options: ScanOptions): Promise<Scan> {
  const scanId = randomUUID();
  const startedAt = new Date().toISOString();
  const subnets = options.subnets.length > 0 ? options.subnets : detectSubnets();
  const errors: string[] = [];
  let allResults: ScanResult[] = [];

  for (const subnet of subnets) {
    // ARP + ICMP always run
    const scanners: Promise<ScanResult[]>[] = [
      runArpScan(subnet, scanId).catch(err => { errors.push(`ARP scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
      runIcmpScan(subnet, scanId).catch(err => { errors.push(`ICMP scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
    ];

    // TCP SYN only for thorough
    if (options.intensity === 'thorough') {
      scanners.push(
        runTcpSynScan(subnet, scanId).catch(err => { errors.push(`TCP SYN scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
      );
    }

    const batchResults = await Promise.all(scanners);
    for (const batch of batchResults) {
      allResults = allResults.concat(batch);
    }
  }

  const deduped = deduplicateResults(allResults);
  const completedAt = new Date().toISOString();

  return {
    id: scanId,
    status: 'completed',
    startedAt,
    completedAt,
    devicesFound: deduped.length,
    newDevices: deduped.length,
    subnetsScanned: subnets,
    errors,
    scanIntensity: options.intensity,
  };
}

/** Deduplicate scan results. Key on MAC address when present, otherwise IP. */
export function deduplicateResults(results: ScanResult[]): ScanResult[] {
  const byMac = new Map<string, ScanResult>();
  const byIpOnly: ScanResult[] = [];

  for (const result of results) {
    const key = result.macAddress || '';
    if (key) {
      const existing = byMac.get(key);
      if (existing) {
        // Merge discovery methods
        const methods = new Set(existing.discoveryMethod.split(','));
        methods.add(result.discoveryMethod);
        existing.discoveryMethod = [...methods].join(',');
        // Keep most complete data
        if (!existing.hostname && result.hostname) existing.hostname = result.hostname;
        if (!existing.vendor && result.vendor) existing.vendor = result.vendor;
        if (!existing.ipAddress && result.ipAddress) existing.ipAddress = result.ipAddress;
        if (result.openPorts?.length) {
          existing.openPorts = [...(existing.openPorts ?? []), ...result.openPorts];
        }
      } else {
        byMac.set(key, { ...result });
      }
    } else {
      // No MAC — deduplicate by IP among MAC-less results
      const existingIp = byIpOnly.find(r => r.ipAddress === result.ipAddress);
      if (existingIp) {
        const methods = new Set(existingIp.discoveryMethod.split(','));
        methods.add(result.discoveryMethod);
        existingIp.discoveryMethod = [...methods].join(',');
        if (!existingIp.hostname && result.hostname) existingIp.hostname = result.hostname;
        if (!existingIp.vendor && result.vendor) existingIp.vendor = result.vendor;
      } else {
        byIpOnly.push({ ...result });
      }
    }
  }

  // Merge IP-only results with MAC results if same IP
  const merged = [...byMac.values()];
  for (const ipResult of byIpOnly) {
    const macMatch = merged.find(r => r.ipAddress === ipResult.ipAddress);
    if (macMatch) {
      const methods = new Set(macMatch.discoveryMethod.split(','));
      for (const m of ipResult.discoveryMethod.split(',')) methods.add(m);
      macMatch.discoveryMethod = [...methods].join(',');
      if (!macMatch.hostname && ipResult.hostname) macMatch.hostname = ipResult.hostname;
      if (!macMatch.vendor && ipResult.vendor) macMatch.vendor = ipResult.vendor;
    } else {
      merged.push(ipResult);
    }
  }

  return merged;
}

function classifyError(err: unknown): string {
  if (err instanceof Error) {
    if ('code' in err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') return 'Permission denied';
      if (code === 'ETIMEDOUT' || code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'Timeout';
      if (code === 'ENOENT') return 'nmap not found';
    }
    if (err.message.includes('KILLED') || err.message.includes('timed out')) return 'Timeout';
    return err.message;
  }
  return String(err);
}
