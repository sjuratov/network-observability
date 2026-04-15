import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface DeviceRecord {
  id: string;
  macAddress: string;
  ipAddress: string;
  hostname?: string;
  vendor?: string;
  displayName?: string;
  isKnown: boolean;
  isOnline: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  discoveryMethod: string;
  tags: string[];
}

interface HistoryEntry {
  deviceId: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
}

const devices: DeviceRecord[] = [
  {
    id: 'device-001',
    macAddress: 'AA:BB:CC:DD:EE:01',
    ipAddress: '192.168.1.10',
    hostname: 'living-room-tv',
    vendor: 'Samsung',
    displayName: 'Smart TV',
    isKnown: true,
    isOnline: true,
    firstSeenAt: '2024-01-01T00:00:00.000Z',
    lastSeenAt: '2024-01-15T12:00:00.000Z',
    discoveryMethod: 'arp',
    tags: ['Media', 'IoT'],
  },
  {
    id: 'device-002',
    macAddress: 'AA:BB:CC:DD:EE:02',
    ipAddress: '192.168.1.20',
    hostname: 'office-printer',
    vendor: 'HP',
    displayName: 'Office Printer',
    isKnown: true,
    isOnline: false,
    firstSeenAt: '2024-01-02T00:00:00.000Z',
    lastSeenAt: '2024-01-14T08:00:00.000Z',
    discoveryMethod: 'arp',
    tags: ['IoT'],
  },
  {
    id: 'device-003',
    macAddress: 'AA:BB:CC:DD:EE:03',
    ipAddress: '192.168.1.30',
    hostname: 'laptop',
    vendor: 'Apple',
    displayName: 'MacBook Pro',
    isKnown: true,
    isOnline: true,
    firstSeenAt: '2024-01-03T00:00:00.000Z',
    lastSeenAt: '2024-01-15T12:00:00.000Z',
    discoveryMethod: 'arp',
    tags: [],
  },
];

const history: HistoryEntry[] = [
  {
    deviceId: 'device-001',
    fieldName: 'displayName',
    oldValue: 'Unknown',
    newValue: 'Smart TV',
    changedAt: '2024-01-10T00:00:00.000Z',
  },
];

function paginationMeta(total: number, limit: number, offset: number) {
  const hasMore = offset + limit < total;
  return {
    limit,
    hasMore,
    nextCursor: hasMore ? String(offset + limit) : null,
    total,
  };
}

export async function deviceRoutes(fastify: FastifyInstance) {
  fastify.get('/devices', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query.limit || '25', 10), 100);
    const cursor = parseInt(query.cursor || '0', 10);
    const search = query.search?.toLowerCase();
    const tag = query.tag;
    const status = query.status;

    let filtered = [...devices];

    if (search) {
      filtered = filtered.filter(
        (d) =>
          d.hostname?.toLowerCase().includes(search) ||
          d.displayName?.toLowerCase().includes(search) ||
          d.ipAddress.toLowerCase().includes(search) ||
          d.macAddress.toLowerCase().includes(search) ||
          d.vendor?.toLowerCase().includes(search),
      );
    }

    if (tag) {
      filtered = filtered.filter((d) => d.tags.includes(tag));
    }

    if (status === 'online') {
      filtered = filtered.filter((d) => d.isOnline);
    } else if (status === 'offline') {
      filtered = filtered.filter((d) => !d.isOnline);
    }

    const total = filtered.length;
    const page = filtered.slice(cursor, cursor + limit);

    return {
      data: page,
      meta: {
        timestamp: new Date().toISOString(),
        pagination: paginationMeta(total, limit, cursor),
      },
    };
  });

  fastify.get('/devices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const device = devices.find((d) => d.id === id);

    if (!device) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Device ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    return {
      data: device,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.patch('/devices/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const device = devices.find((d) => d.id === id);

    if (!device) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: `Device ${id} not found` },
        meta: { timestamp: new Date().toISOString() },
      };
    }

    const body = request.body as { displayName?: string; tags?: string[] };

    if (body.displayName !== undefined) {
      const oldName = device.displayName;
      device.displayName = body.displayName;
      history.push({
        deviceId: id,
        fieldName: 'displayName',
        oldValue: oldName || '',
        newValue: body.displayName,
        changedAt: new Date().toISOString(),
      });
    }

    if (body.tags !== undefined) {
      device.tags = body.tags;
    }

    return {
      data: device,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.get('/devices/:id/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const entries = history.filter((h) => h.deviceId === id);

    return {
      data: entries,
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
