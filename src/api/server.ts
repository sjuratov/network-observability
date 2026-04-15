import Fastify from 'fastify';

export async function createServer() {
  const server = Fastify({ logger: false });

  server.get('/health', async () => {
    return { status: 'ok', database: 'connected' };
  });

  return server;
}
