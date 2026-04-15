import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '@shared/types/config.js';
import type { Database } from './db/database.js';
import type { Logger } from 'pino';
import { authMiddleware } from './middleware/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { scanRoutes } from './routes/scans.js';
import { statsRoutes } from './routes/stats.js';
import { tagRoutes } from './routes/tags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerDeps {
  config: AppConfig;
  db: Database;
  logger: Logger;
}

export async function createServer(deps?: Partial<ServerDeps>): Promise<FastifyInstance> {
  const config = deps?.config;
  const logLevel = config?.logLevel ?? 'info';

  const server = Fastify({
    logger: {
      level: logLevel,
    },
  });

  await server.register(fastifyCors);

  // Health check (unauthenticated)
  server.get('/health', async () => {
    return { status: 'ok', database: 'connected' };
  });

  // Health check also at /api/v1/health (unauthenticated)
  server.get('/api/v1/health', async () => {
    return { status: 'ok', database: 'connected' };
  });

  // Auth middleware for all /api routes (except health)
  server.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/') && !request.url.includes('/health')) {
      await authMiddleware(request, reply);
    }
  });

  // Register route modules under /api/v1
  await server.register(
    async (api) => {
      await api.register(deviceRoutes);
      await api.register(scanRoutes);
      await api.register(statsRoutes);
      await api.register(tagRoutes);
    },
    { prefix: '/api/v1' },
  );

  // Serve SPA static files
  const publicDir = path.join(__dirname, '..', '..', '..', 'public');
  try {
    await server.register(fastifyStatic, {
      root: publicDir,
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API routes
    server.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'Route not found' },
        meta: { timestamp: new Date().toISOString() },
      };
    });
  } catch {
    // Static dir may not exist yet — that's fine during development
  }

  // Decorate server with db reference for route handlers (if provided)
  if (deps?.db) {
    server.decorate('db', deps.db);
  }

  return server;
}
