import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Scan } from '@shared/types/device.js';

const scans: Scan[] = [
  {
    id: 'scan-001',
    status: 'completed',
    startedAt: '2024-01-15T10:00:00.000Z',
    completedAt: '2024-01-15T10:05:00.000Z',
    devicesFound: 3,
    newDevices: 1,
    subnetsScanned: ['192.168.1.0/24'],
    errors: [],
    scanIntensity: 'normal',
  },
];

export async function scanRoutes(fastify: FastifyInstance) {
  fastify.get('/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit || '25', 10), 100);
    const cursor = parseInt(query.cursor || '0', 10);
    const total = scans.length;
    const page = scans.slice(cursor, cursor + limit);
    const hasMore = cursor + limit < total;

    return {
      data: page,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: {
          limit,
          hasMore,
          nextCursor: hasMore ? String(cursor + limit) : null,
          total,
        },
      },
    };
  });

  fastify.get('/scans/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const scan = scans.find((s) => s.id === id);

    if (!scan) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Scan ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    return {
      data: scan,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.post('/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const running = scans.find((s) => s.status === 'in-progress');
    if (running) {
      reply.status(409);
      return {
        error: { code: 'CONFLICT', message: 'A scan is already in progress' },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    const newScan: Scan = {
      id: `scan-${String(scans.length + 1).padStart(3, '0')}`,
      status: 'in-progress',
      startedAt: new Date().toISOString(),
      devicesFound: 0,
      newDevices: 0,
      subnetsScanned: ['192.168.1.0/24'],
      errors: [],
      scanIntensity: 'normal',
    };

    scans.push(newScan);
    reply.status(201);

    return {
      data: newScan,
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
