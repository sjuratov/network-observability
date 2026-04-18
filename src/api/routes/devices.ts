import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/database.js';
import {
  buildDeviceSelectClause,
  derivePresenceStatus,
  getPresenceOfflineThreshold,
  isSupportedStatusFilter,
  toLegacyIsOnline,
} from '../presence/device-status.js';
import { consumeActivityHistoryFailure, consumeFullInventoryFailure } from './test-support-state.js';

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
  created_at: string | null;
  updated_at: string | null;
  seen_scan_count?: number | null;
  missed_scan_count?: number | null;
}

interface DbHistoryRow {
  id: number;
  device_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string | null;
}

interface DbTagRow {
  tag: string;
}

function rowToDevice(row: DbDeviceRow, tags: string[], offlineThreshold: number) {
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

function paginationMeta(total: number, limit: number, offset: number) {
  const hasMore = offset + limit < total;
  return {
    limit,
    hasMore,
    nextCursor: hasMore ? String(offset + limit) : null,
    total,
  };
}

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

function getTagsForDevice(db: Database, deviceId: string): string[] {
  const rows = db.getDb().prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(deviceId) as DbTagRow[];
  return rows.map((row) => row.tag);
}

function emptyStructuredHistory(row?: DbDeviceRow, offlineThreshold = 2) {
  const status = row ? derivePresenceStatus(row, offlineThreshold) : 'unknown';
  return {
    presenceSummary: {
      status,
      firstSeenAt: row?.first_seen_at ?? '',
      lastSeenAt: row?.last_seen_at ?? '',
      lastChangedAt: null,
      summaryLabel: row ? 'No additional activity recorded yet.' : 'No activity history available.',
    },
    ipHistory: row?.ip_address
      ? [{
          ipAddress: row.ip_address,
          firstSeenAt: row.first_seen_at ?? '',
          lastSeenAt: row.last_seen_at ?? '',
        }]
      : [],
    activityEvents: [],
  };
}

function buildStructuredHistory(row: DbDeviceRow | undefined, rows: DbHistoryRow[], offlineThreshold: number) {
  if (!row) {
    return emptyStructuredHistory(undefined, offlineThreshold);
  }

  if (rows.length === 0) {
    return emptyStructuredHistory(row, offlineThreshold);
  }

  const ipHistoryByAddress = new Map<string, { firstSeenAt: string; lastSeenAt: string }>();
  const currentIp = row.ip_address ?? '';
  if (currentIp) {
    ipHistoryByAddress.set(currentIp, {
      firstSeenAt: row.first_seen_at ?? '',
      lastSeenAt: row.last_seen_at ?? '',
    });
  }

  for (const historyRow of rows.filter((entry) => entry.field_name === 'ipAddress' || entry.field_name === 'ip_address')) {
    for (const ipAddress of [historyRow.old_value, historyRow.new_value]) {
      if (!ipAddress) {
        continue;
      }

      const existing = ipHistoryByAddress.get(ipAddress);
      if (!existing) {
        ipHistoryByAddress.set(ipAddress, {
          firstSeenAt: historyRow.changed_at ?? row.first_seen_at ?? '',
          lastSeenAt: historyRow.changed_at ?? row.last_seen_at ?? '',
        });
        continue;
      }

      existing.firstSeenAt = existing.firstSeenAt && historyRow.changed_at
        ? (existing.firstSeenAt < historyRow.changed_at ? existing.firstSeenAt : historyRow.changed_at)
        : (existing.firstSeenAt || historyRow.changed_at || '');
      existing.lastSeenAt = existing.lastSeenAt && historyRow.changed_at
        ? (existing.lastSeenAt > historyRow.changed_at ? existing.lastSeenAt : historyRow.changed_at)
        : (existing.lastSeenAt || historyRow.changed_at || '');
    }
  }

  const activityEvents = rows
    .map((historyRow) => {
      if (historyRow.field_name === 'ipAddress' || historyRow.field_name === 'ip_address') {
        return {
          type: 'ip-change',
          label: `IP changed to ${historyRow.new_value ?? currentIp}`,
          timestamp: historyRow.changed_at ?? row.last_seen_at ?? '',
          previousValue: historyRow.old_value,
          nextValue: historyRow.new_value,
        };
      }

      if (historyRow.field_name === 'presence') {
        const wentOnline = historyRow.new_value === 'online';
        return {
          type: wentOnline ? 'presence-online' : 'presence-offline',
          label: wentOnline ? 'Device came online' : 'Device went offline',
          timestamp: historyRow.changed_at ?? row.last_seen_at ?? '',
          previousValue: historyRow.old_value,
          nextValue: historyRow.new_value,
        };
      }

      return null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  const lastPresenceChange = rows
    .filter((historyRow) => historyRow.field_name === 'presence' && historyRow.changed_at)
    .map((historyRow) => historyRow.changed_at as string)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;

  return {
    presenceSummary: {
      status: derivePresenceStatus(row, offlineThreshold),
      firstSeenAt: row.first_seen_at ?? '',
      lastSeenAt: row.last_seen_at ?? '',
      lastChangedAt: lastPresenceChange,
      summaryLabel: activityEvents.length > 0
        ? `Latest activity recorded at ${lastPresenceChange ?? row.last_seen_at ?? ''}`
        : 'No additional activity recorded yet.',
    },
    ipHistory: Array.from(ipHistoryByAddress.entries())
      .map(([ipAddress, timestamps]) => ({
        ipAddress,
        firstSeenAt: timestamps.firstSeenAt,
        lastSeenAt: timestamps.lastSeenAt,
      }))
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)),
    activityEvents,
  };
}

function validationError(reply: FastifyReply, message: string, details?: string[]) {
  reply.status(400);
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message,
      ...(details ? { details } : {}),
    },
    meta: { timestamp: new Date().toISOString() },
  };
}

function internalError(reply: FastifyReply, message: string) {
  reply.status(500);
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
    meta: { timestamp: new Date().toISOString() },
  };
}

export async function deviceRoutes(fastify: FastifyInstance) {
  fastify.get('/devices', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit || '25', 10), 100);
    const cursor = parseInt(query.cursor || '0', 10);
    const search = query.search?.toLowerCase();
    const tag = query.tag;
    const statusFilter = query.status;
    const offlineThreshold = getPresenceOfflineThreshold(fastify);
    if (query.limit === '100' && consumeFullInventoryFailure()) {
      return internalError(reply, 'Full device inventory retrieval failed');
    }

    if (statusFilter && !isSupportedStatusFilter(statusFilter)) {
      return validationError(
        reply,
        `Unsupported status filter "${statusFilter}"`,
        ['Supported values: online, offline'],
      );
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push(
        '(LOWER(hostname) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(ip_address) LIKE ? OR LOWER(mac_address) LIKE ? OR LOWER(vendor) LIKE ?)',
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    if (tag) {
      conditions.push('id IN (SELECT device_id FROM device_tags WHERE tag = ?)');
      params.push(tag);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectClause = buildDeviceSelectClause(raw, offlineThreshold);
    const rows = raw
      .prepare(`SELECT ${selectClause} FROM devices ${where} ORDER BY last_seen_at DESC`)
      .all(...params) as DbDeviceRow[];

    const devices = rows.map((row) => rowToDevice(row, getTagsForDevice(db, row.id), offlineThreshold));
    const filteredDevices = statusFilter
      ? devices.filter((device) => device.status === statusFilter)
      : devices;
    const paginatedDevices = filteredDevices.slice(cursor, cursor + limit);

    return {
      data: paginatedDevices,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: paginationMeta(filteredDevices.length, limit, cursor),
      },
    };
  });

  fastify.get('/devices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const { id } = request.params as { id: string };
    const offlineThreshold = getPresenceOfflineThreshold(fastify);
    const selectClause = buildDeviceSelectClause(raw, offlineThreshold);
    const row = raw
      .prepare(`SELECT ${selectClause} FROM devices WHERE id = ?`)
      .get(id) as DbDeviceRow | undefined;

    if (!row) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Device ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    return {
      data: rowToDevice(row, getTagsForDevice(db, row.id), offlineThreshold),
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.patch('/devices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const { id } = request.params as { id: string };
    const offlineThreshold = getPresenceOfflineThreshold(fastify);
    const selectClause = buildDeviceSelectClause(raw, offlineThreshold);
    const row = raw
      .prepare(`SELECT ${selectClause} FROM devices WHERE id = ?`)
      .get(id) as DbDeviceRow | undefined;

    if (!row) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Device ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    const body = request.body as { displayName?: string; tags?: string[]; isKnown?: boolean; notes?: string };
    const now = new Date().toISOString();

    if (body.displayName !== undefined) {
      raw.prepare(
        'INSERT INTO device_history (device_id, field_name, old_value, new_value, changed_at) VALUES (?, ?, ?, ?, ?)',
      ).run(id, 'displayName', row.display_name ?? '', body.displayName, now);
      raw.prepare('UPDATE devices SET display_name = ?, updated_at = ? WHERE id = ?').run(body.displayName, now, id);
    }

    if (body.isKnown !== undefined) {
      raw.prepare('UPDATE devices SET is_known = ?, updated_at = ? WHERE id = ?').run(body.isKnown ? 1 : 0, now, id);
    }

    if (body.tags !== undefined) {
      raw.prepare('DELETE FROM device_tags WHERE device_id = ?').run(id);
      const insertTag = raw.prepare('INSERT INTO device_tags (device_id, tag, created_at) VALUES (?, ?, ?)');
      for (const tag of body.tags) {
        insertTag.run(id, tag, now);
      }
    }

    const updated = raw
      .prepare(`SELECT ${selectClause} FROM devices WHERE id = ?`)
      .get(id) as DbDeviceRow;
    const tags = body.tags !== undefined ? body.tags : getTagsForDevice(db, id);

    return {
      data: rowToDevice(updated, tags, offlineThreshold),
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.get('/devices/:id/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const { id } = request.params as { id: string };
    const offlineThreshold = getPresenceOfflineThreshold(fastify);
    const selectClause = buildDeviceSelectClause(raw, offlineThreshold);
    const row = raw
      .prepare(`SELECT ${selectClause} FROM devices WHERE id = ?`)
      .get(id) as DbDeviceRow | undefined;

    if (consumeActivityHistoryFailure(id)) {
      return internalError(reply, 'Activity aggregation failed');
    }

    const rows = raw
      .prepare('SELECT * FROM device_history WHERE device_id = ? ORDER BY changed_at DESC')
      .all(id) as DbHistoryRow[];
    return buildStructuredHistory(row, rows, offlineThreshold);
  });

  fastify.get('/devices/:id/ports', async (request: FastifyRequest) => {
    const db = getDb(fastify);
    const { id } = request.params as { id: string };
    const row = db.getDb()
      .prepare('SELECT open_ports FROM scan_results WHERE device_id = ? AND open_ports IS NOT NULL ORDER BY created_at DESC LIMIT 1')
      .get(id) as { open_ports: string } | undefined;

    const ports = row?.open_ports ? JSON.parse(row.open_ports) : [];

    return {
      data: ports,
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
