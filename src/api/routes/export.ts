import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/database.js';
import {
  exportDevicesCsv,
  exportDevicesJson,
  exportScansCsv,
  exportScansJson,
  generateExportFilename,
  filterByDateRange,
} from '../export/exporter.js';
import {
  buildDeviceSelectClause,
  derivePresenceStatus,
  getPresenceOfflineThreshold,
  toLegacyIsOnline,
} from '../presence/device-status.js';
import type { Device, Scan } from '@shared/types/device.js';

interface DbDeviceRow {
  id: string;
  mac_address: string;
  ip_address: string;
  hostname: string | null;
  vendor: string | null;
  display_name: string | null;
  is_known: number;
  is_online: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  seen_scan_count?: number | null;
  missed_scan_count?: number | null;
}

interface DbScanRow {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  devices_found: number | null;
  new_devices: number | null;
  subnets_scanned: string | null;
  errors: string | null;
  scan_intensity: string | null;
}

interface DbTagRow {
  tag: string;
}

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

function getTagsForDevice(raw: ReturnType<Database['getDb']>, deviceId: string): string[] {
  const rows = raw.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(deviceId) as DbTagRow[];
  return rows.map((r) => r.tag);
}

function rowToDevice(row: DbDeviceRow, tags: string[], offlineThreshold: number): Device {
  const status = derivePresenceStatus(row, offlineThreshold);
  return {
    id: row.id,
    macAddress: row.mac_address ?? '',
    ipAddress: row.ip_address ?? '',
    hostname: row.hostname ?? undefined,
    vendor: row.vendor ?? undefined,
    displayName: row.display_name ?? undefined,
    isKnown: row.is_known === 1,
    status,
    isOnline: toLegacyIsOnline(status),
    firstSeenAt: row.first_seen_at ?? '',
    lastSeenAt: row.last_seen_at ?? '',
    discoveryMethod: 'arp',
    tags,
  };
}

function rowToScan(row: DbScanRow): Scan {
  return {
    id: row.id,
    status: row.status as Scan['status'],
    startedAt: row.started_at ?? '',
    completedAt: row.completed_at ?? undefined,
    devicesFound: row.devices_found ?? 0,
    newDevices: row.new_devices ?? 0,
    subnetsScanned: row.subnets_scanned ? JSON.parse(row.subnets_scanned) : [],
    errors: row.errors ? JSON.parse(row.errors) : [],
    scanIntensity: row.scan_intensity ?? 'normal',
  };
}

function validationError(reply: FastifyReply, message: string) {
  reply.status(400);
  return {
    error: { code: 'VALIDATION_ERROR', message },
    meta: { timestamp: new Date().toISOString() },
  };
}

function isValidDate(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export async function exportRoutes(fastify: FastifyInstance) {
  fastify.get('/export/devices', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const query = request.query as Record<string, string>;
    const format = query.format;

    if (format !== 'csv' && format !== 'json') {
      return validationError(reply, 'Invalid format. Supported values: csv, json');
    }

    if (query.from && !isValidDate(query.from)) {
      return validationError(reply, 'Invalid "from" date. Expected ISO 8601 format.');
    }
    if (query.to && !isValidDate(query.to)) {
      return validationError(reply, 'Invalid "to" date. Expected ISO 8601 format.');
    }
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      return validationError(reply, '"from" date must be before "to" date.');
    }

    const offlineThreshold = getPresenceOfflineThreshold(fastify);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.tag) {
      conditions.push('id IN (SELECT device_id FROM device_tags WHERE tag = ?)');
      params.push(query.tag);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectClause = buildDeviceSelectClause(raw, offlineThreshold);
    const rows = raw
      .prepare(`SELECT ${selectClause} FROM devices ${where} ORDER BY last_seen_at DESC`)
      .all(...params) as DbDeviceRow[];

    let devices: Device[] = rows.map((row) =>
      rowToDevice(row, getTagsForDevice(raw, row.id), offlineThreshold),
    );

    // Apply status filter
    if (query.status) {
      devices = devices.filter((d) => d.status === query.status);
    }

    // Apply date range filter
    devices = filterByDateRange(devices, query.from, query.to);

    const filename = generateExportFilename('devices', format);

    if (format === 'csv') {
      const csv = exportDevicesCsv(devices);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(csv);
    }

    const json = exportDevicesJson(devices);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(json);
  });

  fastify.get('/export/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const query = request.query as Record<string, string>;
    const format = query.format;

    if (format !== 'csv' && format !== 'json') {
      return validationError(reply, 'Invalid format. Supported values: csv, json');
    }

    if (query.from && !isValidDate(query.from)) {
      return validationError(reply, 'Invalid "from" date. Expected ISO 8601 format.');
    }
    if (query.to && !isValidDate(query.to)) {
      return validationError(reply, 'Invalid "to" date. Expected ISO 8601 format.');
    }
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      return validationError(reply, '"from" date must be before "to" date.');
    }

    const rows = raw
      .prepare('SELECT * FROM scans WHERE status = ? ORDER BY started_at DESC')
      .all('completed') as DbScanRow[];

    let scans: Scan[] = rows.map(rowToScan);

    // Apply date range filter
    scans = filterByDateRange(scans, query.from, query.to);

    const filename = generateExportFilename('scans', format);

    if (format === 'csv') {
      const csv = exportScansCsv(scans);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(csv);
    }

    const json = exportScansJson(scans);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(json);
  });
}
