import { FastifyRequest, FastifyReply } from 'fastify';

let configuredApiKey: string = process.env.API_KEY || 'test-api-key-valid';

export function setApiKey(key: string) {
  configuredApiKey = key;
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];
  if (!apiKey || apiKey !== configuredApiKey) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
      meta: { timestamp: new Date().toISOString() },
    });
    return;
  }
}
