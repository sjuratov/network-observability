import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Database } from '../db/database.js';

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

function rowToDevice(row: DbDeviceRow, tags: string[]) {
  return {
    id: row.id,
    macAddress: row.mac_address ?? '',
    ipAddress: row.ip_address ?? '',
    hostname: row.hostname ?? undefined,
    vendor: row.vendor ?? undefined,
    displayName: row.display_name ?? undefined,
    isKnown: row.is_known === 1,
    isOnline: row.is_online === 1,
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
  return rows.map(r => r.tag);
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
    const status = query.status;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (search) {
      conditions.push(
        `(LOWER(hostname) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(ip_address) LIKE ? OR LOWER(mac_address) LIKE ? OR LOWER(vendor) LIKE ?)`,
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    if (tag) {
      conditions.push(`id IN (SELECT device_id FROM device_tags WHERE tag = ?)`);
      params.push(tag);
    }

    if (status === 'online') {
      conditions.push('is_online = 1');
    } else if (status === 'offline') {
      conditions.push('is_online = 0');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = raw.prepare(`SELECT COUNT(*) as cnt FROM devices ${where}`).get(...params) as { cnt: number };
    const total = countRow.cnt;

    const rows = raw
      .prepare(`SELECT * FROM devices ${where} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, cursor) as DbDeviceRow[];

    const data = rows.map(row => rowToDevice(row, getTagsForDevice(db, row.id)));

    return {
      data,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: paginationMeta(total, limit, cursor),
      },
    };
  });

  fastify.get('/devices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const { id } = request.params as { id: string };
    const row = db.getDb().prepare('SELECT * FROM devices WHERE id = ?').get(id) as DbDeviceRow | undefined;

    if (!row) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Device ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    return {
      data: rowToDevice(row, getTagsForDevice(db, row.id)),
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.patch('/devices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const raw = db.getDb();
    const { id } = request.params as { id: string };
    const row = raw.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DbDeviceRow | undefined;

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
      for (const t of body.tags) {
        insertTag.run(id, t, now);
      }
    }

    const updated = raw.prepare('SELECT * FROM devices WHERE id = ?').get(id) as DbDeviceRow;
    const tags = body.tags !== undefined ? body.tags : getTagsForDevice(db, id);

    return {
      data: rowToDevice(updated, tags),
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.get('/devices/:id/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb(fastify);
    const { id } = request.params as { id: string };
    const rows = db.getDb()
      .prepare('SELECT * FROM device_history WHERE device_id = ? ORDER BY changed_at DESC')
      .all(id) as DbHistoryRow[];

    const data = rows.map(r => ({
      deviceId: r.device_id,
      fieldName: r.field_name,
      oldValue: r.old_value ?? '',
      newValue: r.new_value ?? '',
      changedAt: r.changed_at ?? '',
    }));

    return {
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  // Get port/service data for a device (from latest scan result)
  fastify.get('/devices/:id/ports', async (request: FastifyRequest, reply: FastifyReply) => {
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
