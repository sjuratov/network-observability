import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/database.js';

function getDb(fastify: FastifyInstance): Database {
  return (fastify as unknown as { db: Database }).db;
}

export async function tagRoutes(fastify: FastifyInstance) {
  fastify.get('/tags', async () => {
    const db = getDb(fastify);
    const raw = db.getDb();

    // Get distinct tags across all devices
    const rows = raw
      .prepare('SELECT DISTINCT tag, MIN(created_at) as created_at FROM device_tags GROUP BY tag ORDER BY tag')
      .all() as { tag: string; created_at: string | null }[];

    const data = rows.map((r, i) => ({
      id: `tag-${String(i + 1).padStart(3, '0')}`,
      name: r.tag,
      createdAt: r.created_at ?? new Date().toISOString(),
    }));

    return {
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.post('/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { name: string };
    const now = new Date().toISOString();
    const tagId = `tag-${randomUUID().slice(0, 8)}`;

    // Tags exist as entries in device_tags. A standalone tag is stored as a
    // device_tags row with a sentinel device_id so it shows up in GET /tags
    // even before being assigned to any device.
    const db = getDb(fastify);
    const raw = db.getDb();

    // Check if this tag name already exists
    const existing = raw.prepare('SELECT tag FROM device_tags WHERE tag = ? LIMIT 1').get(body.name);
    if (!existing) {
      raw.prepare('INSERT INTO device_tags (device_id, tag, created_at) VALUES (?, ?, ?)').run('__unassigned__', body.name, now);
    }

    reply.status(201);
    return {
      data: {
        id: tagId,
        name: body.name,
        createdAt: now,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.delete('/tags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    // The id in the URL is synthetic (tag-001, etc.). We need to resolve
    // which tag name to delete. For backward compat, we lookup by index
    // or just delete all device_tags with matching tag name.
    const db = getDb(fastify);
    const raw = db.getDb();

    // Get ordered tags to resolve index-based IDs
    const allTags = raw
      .prepare('SELECT DISTINCT tag FROM device_tags ORDER BY tag')
      .all() as { tag: string }[];

    // Try to match tag-NNN pattern to index
    const match = id.match(/^tag-(\d+)$/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < allTags.length) {
        raw.prepare('DELETE FROM device_tags WHERE tag = ?').run(allTags[idx].tag);
      }
    }

    reply.status(204);
    return;
  });
}
