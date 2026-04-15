import type { Device, Scan, FilterParams } from '@shared/types/device.js';

export interface ExportOptions {
  format: 'csv' | 'json';
  type: 'devices' | 'scans';
  dateRange?: { from: string; to: string };
  filters?: FilterParams;
}

export interface DeviceExportEnvelope {
  exportedAt: string;
  filters: { from: string | null; to: string | null; tag: string | null; status: string | null };
  totalCount: number;
  devices: Device[];
}

export interface ScanExportEnvelope {
  exportedAt: string;
  filters: { from: string | null; to: string | null };
  totalCount: number;
  scans: Scan[];
}

/**
 * Escape a CSV field per RFC 4180.
 */
export function escapeCsvField(field: string): string {
  if (field.includes('"') || field.includes(',') || field.includes('\n') || field.includes('\r')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

const DEVICE_CSV_HEADERS = [
  'id', 'display_name', 'mac_address', 'current_ip', 'vendor', 'hostname',
  'status', 'tags', 'first_seen', 'last_seen', 'open_ports', 'notes', 'is_known',
] as const;

function deviceToCsvRow(d: Device): string {
  const fields = [
    d.id,
    d.displayName ?? '',
    d.macAddress,
    d.ipAddress,
    d.vendor ?? '',
    d.hostname ?? '',
    d.isOnline ? 'online' : 'offline',
    d.tags.join(';'),
    d.firstSeenAt,
    d.lastSeenAt,
    '',
    d.notes ?? '',
    String(d.isKnown),
  ];
  return fields.map(escapeCsvField).join(',');
}

export function exportDevicesCsv(devices: Device[]): string {
  const header = DEVICE_CSV_HEADERS.join(',');
  const rows = devices.map(deviceToCsvRow);
  return [header, ...rows].join('\n');
}

export function exportDevicesJson(devices: Device[]): string {
  const envelope = {
    exportedAt: new Date().toISOString(),
    totalCount: devices.length,
    devices: devices.map((d) => ({
      id: d.id,
      macAddress: d.macAddress,
      currentIp: d.ipAddress,
      hostname: d.hostname ?? null,
      vendor: d.vendor ?? null,
      displayName: d.displayName ?? null,
      status: d.isOnline ? 'online' : 'offline',
      isKnown: d.isKnown,
      tags: d.tags,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      notes: d.notes ?? null,
    })),
  };
  return JSON.stringify(envelope, null, 2);
}

const SCAN_CSV_HEADERS = [
  'scan_id', 'started_at', 'completed_at', 'duration_seconds',
  'status', 'devices_found', 'new_devices',
] as const;

function computeDuration(startedAt: string, completedAt?: string): string {
  if (!completedAt) return '';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return String(Math.round(ms / 1000));
}

function scanToCsvRow(s: Scan): string {
  const fields = [
    s.id,
    s.startedAt,
    s.completedAt ?? '',
    computeDuration(s.startedAt, s.completedAt),
    s.status,
    String(s.devicesFound),
    String(s.newDevices),
  ];
  return fields.map(escapeCsvField).join(',');
}

export function exportScansCsv(scans: Scan[]): string {
  const header = SCAN_CSV_HEADERS.join(',');
  const rows = scans.map(scanToCsvRow);
  return [header, ...rows].join('\n');
}

export function exportScansJson(scans: Scan[]): string {
  const envelope = {
    exportedAt: new Date().toISOString(),
    totalCount: scans.length,
    scans: scans.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      completedAt: s.completedAt ?? null,
      status: s.status,
      devicesFound: s.devicesFound,
      newDevices: s.newDevices,
      subnetsScanned: s.subnetsScanned,
      errors: s.errors,
    })),
  };
  return JSON.stringify(envelope, null, 2);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function generateExportFilename(type: string, format: 'csv' | 'json', date?: Date): string {
  const d = date ?? new Date();
  const datePart = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const timePart = `${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  return `${type}_${datePart}_${timePart}.${format}`;
}

export function filterByDateRange<T extends { firstSeenAt?: string; startedAt?: string }>(
  items: T[],
  from?: string,
  to?: string,
): T[] {
  if (!from && !to) return items;
  const fromMs = from ? new Date(from).getTime() : -Infinity;
  const toMs = to ? new Date(to).getTime() : Infinity;

  return items.filter((item) => {
    const dateStr = item.startedAt ?? item.firstSeenAt;
    if (!dateStr) return false;
    const ts = new Date(dateStr).getTime();
    return ts >= fromMs && ts < toMs;
  });
}
