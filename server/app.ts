import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store';
import type { AuthSpec, Ctx } from './http';
import { AppError, forbidden } from './core/errors';
import { loadActor } from './core/actor';
import { clock } from './core/clock';
import { SESSION_COOKIE, authRoutes, hashToken } from './modules/auth';
import { platformRoutes } from './modules/platform';
import { haccpRoutes } from './modules/haccp';
import { planRoutes } from './modules/plan/routes';
import { printRoutes } from './modules/print';
import { monitoringRoutes } from './modules/monitoring/routes';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

export interface AppOptions { dataDir: string; fresh?: boolean; demoMode?: boolean; testMode?: boolean; serveClient?: boolean }

export interface RouteInfo { method: string; url: string; auth: AuthSpec | undefined }

export async function buildApp(opts: AppOptions): Promise<FastifyInstance & { ctx: Ctx; routesInfo: RouteInfo[] }> {
  const app = Fastify({ logger: false });
  const store = new Store(opts.dataDir, opts.fresh);
  const ctx: Ctx = { store, demoMode: opts.demoMode ?? true, testMode: opts.testMode ?? false };
  const routesInfo: RouteInfo[] = [];

  await app.register(fastifyCookie);
  app.addContentTypeParser(['application/gzip', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: 200 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  // Маршрут /api без декларации доступа не регистрируется (единая точка проверки прав)
  app.addHook('onRoute', (r) => {
    if (!r.url.startsWith('/api/')) return;
    const auth = (r.config as { auth?: AuthSpec } | undefined)?.auth;
    if (!auth) throw new Error(`Route ${r.method} ${r.url} has no auth declaration`);
    for (const m of [r.method].flat()) routesInfo.push({ method: m, url: r.url, auth });
  });

  app.decorateRequest('actor', null);
  app.addHook('preHandler', async (req) => {
    const auth = req.routeOptions.config?.auth;
    if (!req.url.startsWith('/api/') || !auth || auth === 'public') return;
    const token = req.cookies[SESSION_COOKIE];
    const db = store.db;
    const s = token
      ? (db.prepare('SELECT user_id, expires_at FROM session WHERE token_hash = ?').get(hashToken(token)) as { user_id: string; expires_at: string } | undefined)
      : undefined;
    const actor = s && s.expires_at > clock.nowIso() ? loadActor(db, s.user_id) : null;
    if (!actor) throw new AppError(401, 'unauthenticated', {}, 'Sign-in required');
    req.actor = actor;
    if (auth !== 'user' && auth !== 'engine' && !actor.permissions.has(auth)) throw forbidden(auth);
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code, params: err.params, message: err.message });
    const msg = String((err as Error).message ?? '');
    const imm = /immutable:(\w+)/.exec(msg);
    if (imm) return reply.code(409).send({ error: 'immutable', params: { table: imm[1] }, message: `${imm[1]} records cannot be changed or deleted` });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', params: {}, message: msg });
    console.error(err);
    return reply.code(500).send({ error: 'internal', params: {}, message: 'Internal error' });
  });

  app.get('/api/health', { config: { auth: 'public' } }, async () => ({ status: 'ok', time: clock.nowIso(), timeZone: 'Asia/Yerevan' }));
  authRoutes(app, ctx);
  platformRoutes(app, ctx);
  haccpRoutes(app, ctx);
  planRoutes(app, ctx);
  printRoutes(app, ctx);
  monitoringRoutes(app, ctx);

  if (opts.serveClient !== false && existsSync(DIST)) {
    await app.register(fastifyStatic, { root: DIST, wildcard: false });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found', params: {}, message: 'Not found' });
    if (!existsSync(DIST)) return reply.code(503).send('Client is not built: run "npm start"');
    return reply.type('text/html').sendFile('index.html');
  });

  app.addHook('onClose', async () => store.close());
  return Object.assign(app, { ctx, routesInfo }) as unknown as FastifyInstance & { ctx: Ctx; routesInfo: RouteInfo[] };
}
