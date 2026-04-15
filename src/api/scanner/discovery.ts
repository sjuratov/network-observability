import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { XMLParser } from 'fast-xml-parser';
import type { ScanResult, Scan } from '@shared/types/device.js';

export type ScanCapability = 'full' | 'restricted';

export interface ScanOptions {
  subnets: string[];
  intensity: 'quick' | 'normal' | 'thorough';
}

let cachedCapability: ScanCapability | null = null;

/** Check if running inside Docker on a bridge network (macOS Docker Desktop). */
function isDockerBridgeNetwork(): boolean {
  if (!existsSync('/.dockerenv')) return false;
  const subnets = detectSubnets();
  return subnets.length > 0 && subnets.every(s => {
    const [ip] = s.split('/');
    return isDockerBridgeSubnet(ip);
  });
}

/** Detect whether raw sockets (ARP/SYN) are available on a real network. Result is cached. */
export async function detectScanCapabilities(): Promise<ScanCapability> {
  if (cachedCapability) return cachedCapability;

  // Docker bridge networks can do ARP technically, but only see VM-internal IPs — not the real LAN
  if (isDockerBridgeNetwork()) {
    cachedCapability = 'restricted';
    return cachedCapability;
  }

  try {
    const subnets = detectSubnets();
    const testSubnet = subnets[0] ?? '192.168.1.0/24';
    const [network] = testSubnet.split('/');
    const parts = network.split('.');
    parts[3] = '1';
    const gatewayIp = parts.join('.');

    const xml = await execNmap(['--privileged', '-sn', '-PR', gatewayIp, '-oX', '-'], 10000);
    if (xml.includes('state="up"') || xml.includes('<host ')) {
      cachedCapability = 'full';
    } else {
      cachedCapability = 'restricted';
    }
  } catch {
    cachedCapability = 'restricted';
  }
  return cachedCapability;
}

/** Reset cached capability (for testing). */
export function resetCachedCapability(): void {
  cachedCapability = null;
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
        let mask = prefix ? Number(prefix) : 24;

        // Docker bridge networks are typically /16 — narrow to /24 around our IP
        // to avoid scanning 65K hosts on a virtual network
        if (mask < 24 && isDockerBridgeSubnet(ip)) {
          mask = 24;
        }

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

/** Check if an IP is in Docker's default bridge ranges (172.16-31.x.x). */
function isDockerBridgeSubnet(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

/** Run nmap with given args and return XML stdout. */
function execNmap(args: string[], timeoutMs = 30000): Promise<string> {
  console.log(JSON.stringify({ msg: `execNmap called`, args: args.join(' '), timeoutMs }));
  return new Promise((resolve, reject) => {
    const child = execFile('nmap', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`nmap error: ${error.message}, stderr: ${stderr}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.log(`nmap stderr: ${stderr.substring(0, 200)}`);
      }
      resolve(stdout);
    });
  });
}

/** Calculate a reasonable timeout (ms) based on subnet prefix length. */
function subnetTimeoutMs(subnet: string): number {
  const parts = subnet.split('/');
  const prefix = parseInt(parts[1] ?? '24', 10);
  // /24 = 256 hosts → 60s, /16 = 65536 hosts → 300s
  if (prefix >= 24) return 60_000;
  if (prefix >= 20) return 120_000;
  return 300_000;
}

// ─── Full-capability scans (Linux / host networking with raw sockets) ───

/** Run an ARP scan on a subnet. Requires raw sockets. */
async function runArpScan(subnet: string, scanId: string): Promise<ScanResult[]> {
  const xml = await execNmap(['-sn', '-PR', subnet, '-oX', '-'], subnetTimeoutMs(subnet));
  return parseNmapXml(xml, scanId, 'arp');
}

/** Run an ICMP ping sweep on a subnet. Requires raw sockets. */
async function runIcmpScan(subnet: string, scanId: string): Promise<ScanResult[]> {
  const xml = await execNmap(['-sn', '-PE', subnet, '-oX', '-'], subnetTimeoutMs(subnet));
  return parseNmapXml(xml, scanId, 'icmp');
}

/** Run a TCP SYN scan on a subnet. Requires raw sockets. */
async function runTcpSynScan(subnet: string, scanId: string, ports = '22,80,443,8080,8443'): Promise<ScanResult[]> {
  const xml = await execNmap(['-sS', '-p', ports, subnet, '-oX', '-'], subnetTimeoutMs(subnet));
  return parseNmapXml(xml, scanId, 'tcp_syn');
}

// ─── Restricted scans (macOS Docker Desktop / no raw sockets) ───

/** Run a default ping scan (TCP ACK port 80 + ICMP). Works without raw sockets. */
async function runDefaultPingScan(subnet: string, scanId: string): Promise<ScanResult[]> {
  const xml = await execNmap(['-sn', subnet, '-oX', '-'], subnetTimeoutMs(subnet));
  return parseNmapXml(xml, scanId, 'ping');
}

/** Run a TCP connect scan. Works as unprivileged user. */
async function runTcpConnectScan(subnet: string, scanId: string, ports = '22,80,443,8080,8443'): Promise<ScanResult[]> {
  const xml = await execNmap(['-sT', '-p', ports, subnet, '-oX', '-'], subnetTimeoutMs(subnet));
  return parseNmapXml(xml, scanId, 'tcp_connect');
}

/** Parse nmap XML output into ScanResult[]. */
function parseNmapXml(xml: string, scanId: string, method: string): ScanResult[] {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const doc = parser.parse(xml);

    const hosts = Array.isArray(doc?.nmaprun?.host)
      ? doc.nmaprun.host
      : doc?.nmaprun?.host
        ? [doc.nmaprun.host]
        : [];

    console.log(JSON.stringify({ msg: `parseNmapXml: ${method}, XML length: ${xml.length}, hosts found: ${hosts.length}` }));

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
  } catch (err) {
    console.error(`parseNmapXml error for method ${method}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/** Build scan tasks based on detected capability and requested intensity. */
function buildScanTasks(
  capability: ScanCapability,
  intensity: ScanOptions['intensity'],
  subnet: string,
  scanId: string,
  errors: string[],
): Promise<ScanResult[]>[] {
  if (capability === 'full') {
    // Full mode: ARP + ICMP always, TCP SYN for thorough
    const tasks: Promise<ScanResult[]>[] = [
      runArpScan(subnet, scanId).catch(err => { errors.push(`ARP scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
      runIcmpScan(subnet, scanId).catch(err => { errors.push(`ICMP scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
    ];
    if (intensity === 'thorough') {
      tasks.push(
        runTcpSynScan(subnet, scanId).catch(err => { errors.push(`TCP SYN scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
      );
    }
    return tasks;
  }

  // Restricted mode: default ping always, TCP connect for normal/thorough
  const tasks: Promise<ScanResult[]>[] = [
    runDefaultPingScan(subnet, scanId).catch(err => { errors.push(`Ping scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
  ];
  if (intensity !== 'quick') {
    tasks.push(
      runTcpConnectScan(subnet, scanId).catch(err => { errors.push(`TCP connect scan failed for ${subnet}: ${classifyError(err)}`); return []; }),
    );
  }
  return tasks;
}

/** Run a full network scan. Adapts strategy based on raw-socket availability. */
export async function runScan(options: ScanOptions): Promise<Scan> {
  const scanId = randomUUID();
  const startedAt = new Date().toISOString();
  const subnets = options.subnets.length > 0 ? options.subnets : detectSubnets();
  const errors: string[] = [];
  let allResults: ScanResult[] = [];

  const capability = await detectScanCapabilities();
  const modeLabel = capability === 'full' ? 'full (ARP + SYN mode)' : 'restricted (TCP connect mode)';
  console.log(JSON.stringify({ msg: `Scan capabilities detected: ${modeLabel}`, capability }));

  for (const subnet of subnets) {
    console.log(JSON.stringify({ msg: `Scanning subnet`, subnet, capability, intensity: options.intensity }));
    const scanners = buildScanTasks(capability, options.intensity, subnet, scanId, errors);
    console.log(JSON.stringify({ msg: `Built ${scanners.length} scan tasks for ${subnet}` }));
    const batchResults = await Promise.all(scanners);
    for (const batch of batchResults) {
      console.log(JSON.stringify({ msg: `Batch returned ${batch.length} results` }));
      allResults = allResults.concat(batch);
    }
  }

  const deduped = deduplicateResults(allResults);
  const completedAt = new Date().toISOString();

  const scanMeta = {
    id: scanId,
    status: 'completed' as const,
    startedAt,
    completedAt,
    devicesFound: deduped.length,
    newDevices: deduped.length,
    subnetsScanned: subnets,
    errors,
    scanIntensity: options.intensity,
  };

  return Object.assign(scanMeta, { results: deduped });
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
