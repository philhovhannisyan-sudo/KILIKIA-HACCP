import { createHash, randomBytes } from 'node:crypto';
import type { RouteRegistrar } from '../http';
import { actorOf } from '../http';
import { loadActor } from '../core/actor';
import { AppError, badRequest } from '../core/errors';
import { clock } from '../core/clock';
import { ulid } from '../core/ids';
import { verifyPassword } from '../core/password';
import { isWritePermission } from '../../shared/permissions';

export const SESSION_COOKIE = 'haccp_sid';
const SESSION_HOURS = 12;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const authRoutes: RouteRegistrar = (app, ctx) => {
  // Экран входа в демо-режиме показывает учётки (brief §3.5)
  app.get('/api/auth/demo-users', { config: { auth: 'public' } }, async () => {
    if (!ctx.demoMode) return { demo: false, users: [] };
    const db = ctx.store.db;
    const users = db.prepare(`SELECT u.login, u.full_name AS fullName, group_concat(r.code) AS roles
      FROM user u JOIN user_role ur ON ur.user_id = u.id JOIN role r ON r.id = ur.role_id
      WHERE u.active = 1 GROUP BY u.id ORDER BY u.rowid`).all() as { login: string; fullName: string; roles: string }[];
    return { demo: true, password: 'demo', users: users.map((u) => ({ ...u, roles: u.roles.split(',').sort() })) };
  });

  app.post('/api/auth/login', { config: { auth: 'public' } }, async (req, reply) => {
    const body = (req.body ?? {}) as { login?: string; password?: string };
    const login = String(body.login ?? '').trim();
    if (!login || typeof body.password !== 'string') throw badRequest('login_required');
    const db = ctx.store.db;
    const u = db.prepare('SELECT id, password_hash, active FROM user WHERE login = ?').get(login) as
      { id: string; password_hash: string; active: number } | undefined;
    const ok = !!u && !!u.active && verifyPassword(body.password, u.password_hash);
    db.prepare('INSERT INTO login_event (id, login, user_id, at, result, ip) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ulid(), login, u?.id ?? null, clock.nowIso(), ok ? 'success' : 'failure', req.ip);
    if (!ok) throw new AppError(401, 'invalid_credentials', {}, 'Invalid login or password');
    const token = randomBytes(32).toString('base64url');
    const now = clock.now();
    db.prepare('INSERT INTO session (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), u!.id, now.toISOString(), new Date(now.getTime() + SESSION_HOURS * 3600_000).toISOString());
    reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: SESSION_HOURS * 3600 });
    return me(loadActor(db, u!.id)!);
  });

  app.post('/api/auth/logout', { config: { auth: 'user' } }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) ctx.store.db.prepare('DELETE FROM session WHERE token_hash = ?').run(hashToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { config: { auth: 'user' } }, async (req) => me(actorOf(req)));
};

function me(a: ReturnType<typeof loadActor> & object) {
  const permissions = [...a.permissions].sort();
  return {
    id: a.id, login: a.login, fullName: a.fullName, roles: a.roles, permissions,
    canWrite: permissions.some(isWritePermission),
  };
}
