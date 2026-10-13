import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

export async function buildApp() {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString(), timeZone: 'Asia/Yerevan' }));

  if (existsSync(DIST)) {
    await app.register(fastifyStatic, { root: DIST, wildcard: false });
  }

  // SPA: любые не-API маршруты отдают index.html; неизвестный API — 404 JSON
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
    if (!existsSync(DIST)) return reply.code(503).send('Client is not built: run "npm start"');
    return reply.type('text/html').sendFile('index.html');
  });

  return app;
}
