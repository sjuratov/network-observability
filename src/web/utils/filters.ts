import type { Device, Scan, DashboardStats, FilterParams } from '@shared/types/device.js';

export type BreakdownGroupBy = 'vendor' | 'tag' | 'status' | 'method' | 'age' | 'known';

export interface BreakdownItem {
  label: string;
  count: number;
}

function groupAndSort(counts: Record<string, number>): BreakdownItem[] {
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function buildBreakdownData(devices: Device[], groupBy: BreakdownGroupBy, now?: number): BreakdownItem[] {
  if (devices.length === 0) return [];

  const counts: Record<string, number> = {};

  switch (groupBy) {
    case 'vendor':
      for (const d of devices) {
        const key = d.vendor || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
      }
      break;

    case 'tag':
      for (const d of devices) {
        if (d.tags.length === 0) {
          counts['Untagged'] = (counts['Untagged'] || 0) + 1;
        } else {
          for (const tag of d.tags) {
            counts[tag] = (counts[tag] || 0) + 1;
          }
        }
      }
      break;

    case 'status':
      for (const d of devices) {
        const status = d.status ?? (d.isOnline ? 'Online' : 'Offline');
        const key = status.charAt(0).toUpperCase() + status.slice(1);
        counts[key] = (counts[key] || 0) + 1;
      }
      break;

    case 'method':
      for (const d of devices) {
        const key = d.discoveryMethod || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
      }
      break;

    case 'age': {
      const timestamp = now ?? Date.now();
      const DAY = 24 * 60 * 60 * 1000;
      for (const d of devices) {
        const age = timestamp - new Date(d.firstSeenAt).getTime();
        if (age < DAY) counts['< 1 day'] = (counts['< 1 day'] || 0) + 1;
        else if (age < 7 * DAY) counts['1–7 days'] = (counts['1–7 days'] || 0) + 1;
        else if (age < 30 * DAY) counts['7–30 days'] = (counts['7–30 days'] || 0) + 1;
        else counts['30+ days'] = (counts['30+ days'] || 0) + 1;
      }
      break;
    }

    case 'known':
      for (const d of devices) {
        const key = d.isKnown ? 'Known' : 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
      }
      break;
  }

  return groupAndSort(counts);
}

export function compareIpAddresses(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '', undefined, { numeric: true });
}

export function filterDevices(devices: Device[], filters: FilterParams): Device[] {
  return devices.filter((d) => {
    const status = d.status ?? (d.isOnline ? 'online' : 'offline');
    if (filters.status === 'online' && status !== 'online') return false;
    if (filters.status === 'offline' && status !== 'offline') return false;
    if (filters.tag && !d.tags.includes(filters.tag)) return false;
    if (filters.vendor && d.vendor !== filters.vendor) return false;
    return true;
  });
}

export function sortDevices(devices: Device[], sortBy: string, order: 'asc' | 'desc'): Device[] {
  const sorted = [...devices].sort((a, b) => {
    let cmp: number;
    switch (sortBy) {
      case 'name':
        cmp = (a.displayName ?? '').localeCompare(b.displayName ?? '');
        break;
      case 'lastSeen':
        cmp = new Date(a.lastSeenAt).getTime() - new Date(b.lastSeenAt).getTime();
        break;
      case 'ip':
        cmp = compareIpAddresses(a.ipAddress, b.ipAddress);
        break;
      default:
        cmp = 0;
    }
    return order === 'desc' ? -cmp : cmp;
  });
  return sorted;
}

export function searchDevices(devices: Device[], query: string): Device[] {
  if (!query) return devices;
  const q = query.toLowerCase();
  return devices.filter((d) => {
    const fields = [
      d.displayName,
      d.macAddress,
      d.ipAddress,
      d.vendor,
      d.hostname,
      ...d.tags,
    ];
    return fields.some((f) => f && f.toLowerCase().includes(q));
  });
}

export function computeStats(devices: Device[], scans: Scan[]): DashboardStats {
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  const totalDevices = devices.length;
  const newDevices24h = devices.filter(
    (d) => now - new Date(d.firstSeenAt).getTime() < twentyFourHours,
  ).length;
  const offlineDevices = devices.filter((d) => (d.status ?? (d.isOnline ? 'online' : 'offline')) === 'offline').length;
  const onlineDevices = totalDevices - offlineDevices;

  let lastScanAt: string | null = null;
  let lastScanStatus: string | null = null;

  if (scans.length > 0) {
    const sorted = [...scans].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    lastScanAt = sorted[0].startedAt;
    lastScanStatus = sorted[0].status;
  }

  return { totalDevices, onlineDevices, newDevices24h, offlineDevices, lastScanAt, lastScanStatus };
}
