import type { Device, Scan, DashboardStats, FilterParams } from '@shared/types/device.js';

export function filterDevices(devices: Device[], filters: FilterParams): Device[] {
  return devices.filter((d) => {
    if (filters.status === 'online' && !d.isOnline) return false;
    if (filters.status === 'offline' && d.isOnline) return false;
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
        cmp = (a.ipAddress ?? '').localeCompare(b.ipAddress ?? '', undefined, { numeric: true });
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
  const offlineDevices = devices.filter((d) => !d.isOnline).length;

  let lastScanAt: string | null = null;
  let lastScanStatus: string | null = null;

  if (scans.length > 0) {
    const sorted = [...scans].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    lastScanAt = sorted[0].startedAt;
    lastScanStatus = sorted[0].status;
  }

  return { totalDevices, newDevices24h, offlineDevices, lastScanAt, lastScanStatus };
}
