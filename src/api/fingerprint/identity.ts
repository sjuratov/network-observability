import { randomUUID } from 'node:crypto';

export interface DeviceIdentity {
  id: string;
  macAddress: string;
  normalizedMac: string;
  isRandomizedMac: boolean;
  vendor: string | null;
  hostname: string | null;
  compositeFingerprint: string;
  ipHistory: IpHistoryEntry[];
  scanAppearances: number;
  displayName: string | null;
}

export interface IpHistoryEntry {
  ipAddress: string;
  firstSeen: string;
  lastSeen: string;
}

export interface MergeResult {
  mergedDevice: DeviceIdentity;
  removedDeviceIds: string[];
}

export interface SplitResult {
  originalDevice: DeviceIdentity;
  newDevice: DeviceIdentity;
}

/**
 * Normalize MAC to lowercase colon-separated format.
 */
export function normalizeMac(mac: string): string {
  const hex = mac.replace(/[:-]/g, '').toLowerCase();
  return hex.match(/.{2}/g)!.join(':');
}

/**
 * Detect locally-administered (randomized) MAC.
 * The second nibble of the first octet has bit 1 (the "locally administered" bit) set
 * when nibble value is 2, 3, 6, 7, A, B, E, or F — i.e. second nibble & 0x2 !== 0.
 */
export function isRandomizedMac(mac: string): boolean {
  const normalized = normalizeMac(mac);
  const secondNibble = parseInt(normalized[1], 16);
  return (secondNibble & 0x2) !== 0;
}

/**
 * Look up vendor by OUI prefix (first 3 octets).
 */
export function lookupVendor(
  mac: string,
  ouiDb: Map<string, string>,
): string | null {
  const normalized = normalizeMac(mac);
  const prefix = normalized.slice(0, 8); // "aa:bb:cc"
  return ouiDb.get(prefix) ?? null;
}

/**
 * Build a composite fingerprint string from available signals.
 */
export function buildCompositeFingerprint(params: {
  mac: string;
  hostname?: string | null;
  vendor?: string | null;
  services?: string[];
}): string {
  const parts: string[] = [params.mac];
  if (params.hostname) parts.push(params.hostname);
  if (params.vendor) parts.push(params.vendor);
  if (params.services && params.services.length > 0) {
    parts.push(...params.services);
  }
  return parts.join('|');
}

/**
 * Match a scanned MAC+IP to an existing device, or create a new one.
 */
export function resolveDeviceIdentity(
  mac: string,
  ipAddress: string,
  existingDevices: DeviceIdentity[],
): DeviceIdentity {
  const normalized = normalizeMac(mac);
  const now = new Date().toISOString();

  const match = existingDevices.find(d => d.normalizedMac === normalized);
  if (match) {
    return trackIpChange(match, ipAddress, now);
  }

  return {
    id: randomUUID(),
    macAddress: normalized,
    normalizedMac: normalized,
    isRandomizedMac: isRandomizedMac(normalized),
    vendor: null,
    hostname: null,
    compositeFingerprint: buildCompositeFingerprint({ mac: normalized }),
    ipHistory: [{ ipAddress, firstSeen: now, lastSeen: now }],
    scanAppearances: 1,
    displayName: null,
  };
}

/**
 * Record a new IP address in the device's history.
 */
export function trackIpChange(
  device: DeviceIdentity,
  newIp: string,
  timestamp: string,
): DeviceIdentity {
  const newEntry: IpHistoryEntry = {
    ipAddress: newIp,
    firstSeen: timestamp,
    lastSeen: timestamp,
  };

  return {
    ...device,
    ipHistory: [...device.ipHistory, newEntry],
  };
}

/**
 * Merge two device records into one, combining histories and appearances.
 */
export function mergeDevices(
  deviceA: DeviceIdentity,
  deviceB: DeviceIdentity,
  keepDisplayName: string,
): MergeResult {
  const mergedDevice: DeviceIdentity = {
    ...deviceA,
    scanAppearances: deviceA.scanAppearances + deviceB.scanAppearances,
    ipHistory: [...deviceA.ipHistory, ...deviceB.ipHistory],
    displayName: keepDisplayName,
  };

  return {
    mergedDevice,
    removedDeviceIds: [deviceB.id],
  };
}

/**
 * Split a device into two records, dividing scan appearances.
 */
export function splitDevice(
  device: DeviceIdentity,
  macToSplit: string,
  appearances: number,
): SplitResult {
  const normalizedSplitMac = normalizeMac(macToSplit);

  const originalDevice: DeviceIdentity = {
    ...device,
    scanAppearances: device.scanAppearances - appearances,
  };

  const newDevice: DeviceIdentity = {
    ...device,
    id: randomUUID(),
    macAddress: normalizedSplitMac,
    normalizedMac: normalizedSplitMac,
    scanAppearances: appearances,
    ipHistory: [],
    displayName: null,
  };

  return { originalDevice, newDevice };
}
