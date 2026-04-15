import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

const tags: Tag[] = [
  { id: 'tag-001', name: 'IoT', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'tag-002', name: 'Media', createdAt: '2024-01-01T00:00:00.000Z' },
];

let tagCounter = tags.length;

export async function tagRoutes(fastify: FastifyInstance) {
  fastify.get('/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      data: tags,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.post('/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { name: string };
    tagCounter++;
    const tag: Tag = {
      id: `tag-${String(tagCounter).padStart(3, '0')}`,
      name: body.name,
      createdAt: new Date().toISOString(),
    };
    tags.push(tag);
    reply.status(201);

    return {
      data: tag,
      meta: { timestamp: new Date().toISOString() },
    };
  });

  fastify.delete('/tags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const index = tags.findIndex((t) => t.id === id);
    if (index !== -1) {
      tags.splice(index, 1);
    }
    reply.status(204);
    return;
  });
}
