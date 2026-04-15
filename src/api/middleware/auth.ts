import { FastifyRequest, FastifyReply } from 'fastify';

const VALID_API_KEY = process.env.API_KEY || 'test-api-key-valid';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'];
  if (!apiKey || apiKey !== VALID_API_KEY) {
    reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid API key' },
      meta: { timestamp: new Date().toISOString() },
    });
    return;
  }
}
