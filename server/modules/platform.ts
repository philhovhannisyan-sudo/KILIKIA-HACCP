import { gunzipSync, gzipSync } from 'node:zlib';
import type { RouteRegistrar } from '../http';
import { actorOf } from '../http';
import { appendAudit, verifyChain } from '../core/audit';
import { clock } from '../core/clock';
import { AppError, badRequest, notFound } from '../core/errors';
import { exportState, type StateFile } from '../backup/dump';
import { countEntities } from '../queries/stats';
import { dashboard } from '../queries/dashboard';

export const platformRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;

  app.get('/api/dashboard', { config: { auth: 'user' } }, async () => dashboard(db(), clock.today()));
  app.get('/api/stats', { config: { auth: 'user' } }, async () => countEntities(db()));
  app.get('/api/settings', { config: { auth: 'user' } }, async () =>
    Object.fromEntries((db().prepare('SELECT key, value, is_demo FROM setting').all() as { key: string; value: string; is_demo: number }[])
      .map((s) => [s.key, { value: JSON.parse(s.value), demo: !!s.is_demo }])));
  app.get('/api/meta', { config: { auth: 'public' } }, async () => ({ demoMode: ctx.demoMode, today: clock.today(), timeZone: 'Asia/Yerevan' }));

  // ── Журнал аудита: только чтение и проверка; изменение и удаление отклоняются (К8) ──
  app.get('/api/audit', { config: { auth: 'audit.log.read' } }, async (req) => {
    const q = req.query as { limit?: string; offset?: string; objectId?: string };
    const limit = Math.min(Number(q.limit) || 100, 500);
    const offset = Number(q.offset) || 0;
    const where = q.objectId ? 'WHERE object_id = ?' : '';
    const args = q.objectId ? [q.objectId] : [];
    const rows = db().prepare(`SELECT * FROM audit_log ${where} ORDER BY seq DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as Record<string, unknown>[];
    const total = db().prepare(`SELECT count(*) FROM audit_log ${where}`).pluck().get(...args) as number;
    return { total, items: rows.map((r) => ({ ...r, roles_snapshot: JSON.parse(r.roles_snapshot as string) })) };
  });
  app.get('/api/audit/verify', { config: { auth: 'audit.log.read' } }, async () => verifyChain(db()));
  const immutable = async () => { throw new AppError(405, 'audit_immutable', {}, 'Audit log entries cannot be changed or deleted; add a correction entry instead'); };
  app.put('/api/audit/:id', { config: { auth: 'user' } }, immutable);
  app.patch('/api/audit/:id', { config: { auth: 'user' } }, immutable);
  app.delete('/api/audit/:id', { config: { auth: 'user' } }, immutable);

  // ── Экспорт / импорт / сброс ──
  app.post('/api/system/export', { config: { auth: 'system.backup.export' } }, async (req, reply) => {
    const state = exportState(db(), clock.nowIso());
    db().transaction(() => appendAudit(db(), actorOf(req), { module: 'E02', objectType: 'system', action: 'system.export' }))();
    const name = `haccp-state-${clock.today()}.json.gz`;
    reply.header('content-type', 'application/gzip').header('content-disposition', `attachment; filename="${name}"`);
    return gzipSync(JSON.stringify(state));
  });

  app.post('/api/system/import', { config: { auth: 'system.backup.import' }, bodyLimit: 200 * 1024 * 1024 }, async (req) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('import_invalid_format');
    let state: StateFile;
    try {
      const raw = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
      state = JSON.parse(raw.toString('utf8'));
    } catch {
      throw badRequest('import_invalid_format', {}, 'File is not a valid state file');
    }
    const r = ctx.store.import(actorOf(req), state);
    return { ok: true, backupFile: r.backupFile.split(/[\\/]/).pop() };
  });

  app.post('/api/system/reset', { config: { auth: 'system.demo.reset' } }, async (req) => {
    if (!ctx.demoMode) throw new AppError(409, 'demo_mode_off', {}, 'Reset is available in demo mode only');
    const r = ctx.store.reset(actorOf(req));
    return { ok: true, backupFile: r.backupFile.split(/[\\/]/).pop() };
  });

  // ── Пользователи и роли ──
  app.get('/api/users', { config: { auth: 'user.account.read' } }, async () =>
    (db().prepare(`SELECT u.id, u.login, u.full_name AS fullName, u.active, group_concat(r.code) AS roles
      FROM user u LEFT JOIN user_role ur ON ur.user_id = u.id LEFT JOIN role r ON r.id = ur.role_id GROUP BY u.id ORDER BY u.login`).all() as
      { roles: string | null }[]).map((u) => ({ ...u, roles: u.roles ? u.roles.split(',').sort() : [] })));

  app.put('/api/users/:id/roles', { config: { auth: 'user.role.update' } }, async (req) => {
    const { id } = req.params as { id: string };
    const roles = (req.body as { roles?: unknown })?.roles;
    if (!Array.isArray(roles) || roles.length === 0) throw badRequest('roles_required');
    const d = db();
    if (!d.prepare('SELECT 1 FROM user WHERE id = ?').get(id)) throw notFound('user', id);
    const roleIds = roles.map((code) => {
      const rid = d.prepare('SELECT id FROM role WHERE code = ?').pluck().get(code) as string | undefined;
      if (!rid) throw badRequest('unknown_role', { role: code });
      return rid;
    });
    d.transaction(() => {
      const before = d.prepare('SELECT r.code FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.code').pluck().all(id);
      d.prepare('DELETE FROM user_role WHERE user_id = ?').run(id);
      for (const rid of roleIds) d.prepare('INSERT INTO user_role (user_id, role_id) VALUES (?, ?)').run(id, rid);
      appendAudit(d, actorOf(req), { module: 'E02', objectType: 'user', objectId: id, action: 'roles.update', before: { roles: before }, after: { roles: [...roles].sort() } });
    })();
    return { ok: true };
  });

  if (ctx.testMode) {
    // Только в тестовом режиме: подмена серверного времени
    app.post('/api/test/clock', { config: { auth: 'public' } }, async (req) => {
      clock.set((req.body as { now?: string | null })?.now ?? null);
      return { now: clock.nowIso(), today: clock.today() };
    });
  }
};
