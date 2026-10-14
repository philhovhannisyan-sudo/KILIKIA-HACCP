import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import type { DB } from '../../db/connection';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { availableTransitions } from '../../core/fsm';
import { badRequest, conflict, notFound } from '../../core/errors';
import { can } from '../../core/rbac';
import { ulid } from '../../core/ids';
import { addDays } from '../../../shared/time';
import { nextCode } from '../monitoring/deviation';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const SIX_M = ['man', 'machine', 'method', 'material', 'measurement', 'environment'] as const;

/** Карточка несоответствия: источник, «5 почему», Исикава, CAPA. Общий код экрана, протокола и пакета для аудита. */
export function ncDetail(db: DB, id: string): Row {
  const nc = db.prepare(`SELECT n.*, b.code AS batch_code, m.code AS lot_code FROM nonconformity n
    LEFT JOIN fg_batch b ON b.id = n.fg_batch_id LEFT JOIN material_lot m ON m.id = n.material_lot_id WHERE n.id = ?`).get(id) as Row | undefined;
  if (!nc) throw notFound('nonconformity', id);
  const why = db.prepare('SELECT steps, root_cause FROM five_whys WHERE nc_id = ?').get(id) as { steps: string; root_cause: string | null } | undefined;
  const source = sourceInfo(db, nc.source_type, nc.source_id);
  return {
    ...nc, source,
    fiveWhys: why ? JSON.parse(why.steps) : [],
    ishikawa: db.prepare('SELECT category, text FROM ishikawa_cause WHERE nc_id = ? ORDER BY rowid').all(id),
    capa: db.prepare(`SELECT c.*, u.full_name AS owner_name, v.full_name AS eff_checked_by_name FROM capa c JOIN user u ON u.id = c.owner_id
      LEFT JOIN user v ON v.id = c.eff_checked_by WHERE c.nc_id = ? ORDER BY c.code`).all(id),
  };
}

function sourceInfo(db: DB, type: string, sourceId: string | null): Row | null {
  if (!sourceId) return null;
  if (type === 'monitoring') return db.prepare(`SELECT r.id, r.event_at, r.value_num, r.value_pass, cp.code AS cp_code, cp.type AS cp_type, pr.name_i18n AS parameter, pr.unit
    FROM monitoring_record r JOIN control_point cp ON cp.id = r.control_point_id JOIN control_parameter pr ON pr.id = r.parameter_id WHERE r.id = ?`).get(sourceId) as Row;
  if (type === 'environment') return db.prepare('SELECT r.id, r.event_at, r.value, p.code AS point_code, p.unit FROM env_record r JOIN env_point p ON p.id = r.point_id WHERE r.id = ?').get(sourceId) as Row;
  if (type === 'recall') return db.prepare('SELECT id, code, type, duration_min FROM trace_exercise WHERE id = ?').get(sourceId) as Row;
  if (type === 'audit') return db.prepare('SELECT id, code, audit_date FROM internal_audit WHERE id = ?').get(sourceId) as Row;
  if (type === 'incoming') return db.prepare('SELECT id, code, received_date FROM material_lot WHERE id = ?').get(sourceId) as Row;
  if (type === 'claim') return db.prepare('SELECT id, code, received_date FROM claim WHERE id = ?').get(sourceId) as Row;
  return null;
}

export const ncRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;
  const withTransitions = (req: { actor: unknown }, nc: Row) => {
    const a = actorOf(req as never);
    return {
      ...nc,
      transitions: availableTransitions(db(), 'nc', nc.status).map((t) => ({ to: t.to_state, permission: t.permission, commentRequired: !!t.comment_required, allowed: can(a, t.permission) })),
      capa: nc.capa.map((c: Row) => ({ ...c, transitions: availableTransitions(db(), 'capa', c.status).map((t) => ({ to: t.to_state, permission: t.permission, commentRequired: !!t.comment_required, allowed: can(a, t.permission) })) })),
    };
  };

  app.get('/api/nonconformities/:id', { config: { auth: 'd04.module.read' } }, async (req) => withTransitions(req, ncDetail(db(), (req.params as { id: string }).id)));
  app.get('/api/people', { config: { auth: 'user' } }, async () => db().prepare('SELECT id, full_name FROM user WHERE active = 1 ORDER BY full_name').all());

  // Ручная регистрация несоответствия (входной контроль, аудит, претензия, прочее)
  app.post('/api/nonconformities', { config: { auth: 'nc.record.create' } }, async (req) => {
    const b = (req.body ?? {}) as { sourceType?: string; description?: string; severity?: string; fgBatchId?: string | null; dueDate?: string };
    const d = db();
    if (!['incoming', 'audit', 'claim', 'manual'].includes(String(b.sourceType))) throw badRequest('field_required', { field: 'sourceType' });
    if (!['minor', 'major', 'critical'].includes(String(b.severity))) throw badRequest('field_required', { field: 'severity' });
    const description = String(b.description ?? '').trim();
    if (!description) throw badRequest('field_required', { field: 'description' });
    if (b.fgBatchId && !d.prepare('SELECT 1 FROM fg_batch WHERE id = ?').get(b.fgBatchId)) throw notFound('fg_batch', b.fgBatchId);
    const id = ulid();
    const code = nextCode(d, 'nonconformity', 'NC');
    d.transaction(() => {
      d.prepare(`INSERT INTO nonconformity (id, code, source_type, fg_batch_id, description, severity, status, registered_at, due_date) VALUES (?, ?, ?, ?, ?, ?, 'registered', ?, ?)`)
        .run(id, code, b.sourceType, b.fgBatchId || null, description, b.severity, clock.nowIso(), b.dueDate || addDays(clock.today(), 30));
      appendAudit(d, actorOf(req), { module: 'D04', objectType: 'nonconformity', objectId: id, action: 'create', after: { code, source: b.sourceType } });
    })();
    return withTransitions(req, ncDetail(d, id));
  });

  // «5 почему» и Исикава (6M) → первопричина
  app.put('/api/nonconformities/:id/analysis', { config: { auth: 'nc.record.analyze' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { fiveWhys?: string[]; rootCause?: string; ishikawa?: { category?: string; text?: string }[] };
    const d = db();
    const nc = ncDetail(d, id);
    if (!['registered', 'in_analysis'].includes(nc.status)) throw conflict('nc_analysis_locked', { status: nc.status });
    const whys = (b.fiveWhys ?? []).map((s) => String(s).trim()).filter(Boolean);
    const ishikawa = (b.ishikawa ?? []).filter((c) => String(c.text ?? '').trim()).map((c) => {
      if (!SIX_M.includes(c.category as never)) throw badRequest('field_required', { field: 'ishikawa.category' });
      return { category: c.category!, text: String(c.text).trim() };
    });
    const root = String(b.rootCause ?? '').trim() || null;
    d.transaction(() => {
      d.prepare('DELETE FROM five_whys WHERE nc_id = ?').run(id);
      if (whys.length) d.prepare('INSERT INTO five_whys (id, nc_id, steps, root_cause) VALUES (?, ?, ?, ?)').run(ulid(), id, JSON.stringify(whys), root);
      d.prepare('DELETE FROM ishikawa_cause WHERE nc_id = ?').run(id);
      for (const c of ishikawa) d.prepare('INSERT INTO ishikawa_cause (id, nc_id, category, text) VALUES (?, ?, ?, ?)').run(ulid(), id, c.category, c.text);
      d.prepare('UPDATE nonconformity SET root_cause = ? WHERE id = ?').run(root, id);
      appendAudit(d, actorOf(req), { module: 'D04', objectType: 'nonconformity', objectId: id, action: 'analysis', before: { rootCause: nc.root_cause }, after: { whys: whys.length, ishikawa: ishikawa.length, rootCause: root } });
    })();
    return withTransitions(req, ncDetail(d, id));
  });

  app.post('/api/nonconformities/:id/capa', { config: { auth: 'capa.action.create' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { action?: string; type?: string; ownerId?: string; dueDate?: string };
    const d = db();
    const nc = ncDetail(d, id);
    if (!['root_cause_identified', 'capa_assigned'].includes(nc.status)) throw conflict('nc_capa_locked', { status: nc.status });
    const action = String(b.action ?? '').trim();
    if (!action) throw badRequest('field_required', { field: 'action' });
    if (!['corrective', 'preventive'].includes(String(b.type))) throw badRequest('field_required', { field: 'type' });
    if (!d.prepare('SELECT 1 FROM user WHERE id = ?').get(b.ownerId)) throw badRequest('field_required', { field: 'ownerId' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate))) throw badRequest('field_required', { field: 'dueDate' });
    const cid = ulid();
    const code = nextCode(d, 'capa', 'CAPA');
    d.transaction(() => {
      d.prepare(`INSERT INTO capa (id, code, nc_id, action, type, owner_id, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned')`).run(cid, code, id, action, b.type, b.ownerId, b.dueDate);
      appendAudit(d, actorOf(req), { module: 'D04', objectType: 'capa', objectId: cid, action: 'create', after: { code, nc: nc.code } });
    })();
    return withTransitions(req, ncDetail(d, id));
  });

  // Проверка результативности CAPA (дата, результат, кто проверил) — условие закрытия НС (К21)
  app.put('/api/capa/:id/effectiveness', { config: { auth: 'capa.effectiveness.verify' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { result?: string; date?: string };
    const d = db();
    const c = d.prepare('SELECT * FROM capa WHERE id = ?').get(id) as Row | undefined;
    if (!c) throw notFound('capa', id);
    if (c.status !== 'done') throw conflict('capa_not_done', { code: c.code, status: c.status });
    const result = String(b.result ?? '').trim();
    if (!result) throw badRequest('field_required', { field: 'result' });
    const date = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : clock.today();
    if (date > clock.today()) throw badRequest('date_in_future', { field: 'date' });
    d.transaction(() => {
      d.prepare('UPDATE capa SET eff_checked_date = ?, eff_result = ?, eff_checked_by = ? WHERE id = ?').run(date, result, actorOf(req).id, id);
      appendAudit(d, actorOf(req), { module: 'D04', objectType: 'capa', objectId: id, action: 'effectiveness', after: { date, result } });
    })();
    return withTransitions(req, ncDetail(d, c.nc_id));
  });
};
