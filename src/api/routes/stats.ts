import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/overview', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      data: {
        totalDevices: 3,
        newDevices24h: 1,
        offlineDevices: 1,
        lastScanAt: '2024-01-15T10:05:00.000Z',
      },
      meta: { timestamp: new Date().toISOString() },
    };
  });
}
