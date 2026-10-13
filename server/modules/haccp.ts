import type { RouteRegistrar } from '../http';
import { actorOf } from '../http';
import { appendAudit } from '../core/audit';
import { clock } from '../core/clock';
import { authorize, can } from '../core/rbac';
import { availableTransitions, transition } from '../core/fsm';
import { AppError, badRequest, conflict, notFound } from '../core/errors';
import { ulid } from '../core/ids';
import { parseDecimal } from '../../shared/number';
import { FSM_ENTITIES, type FsmEntity } from '../../shared/fsm';
import { registerDeviation } from './monitoring/deviation';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const n = parseDecimal(String(v));
  return n === null ? NaN : n;
};

export const withinLimits = (value: number, min: number | null, max: number | null) =>
  (min === null || value >= min) && (max === null || value <= max);

export const haccpRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;

  app.get('/api/control-points', { config: { auth: 'a03.module.read' } }, async () => {
    const d = db();
    const cps = d.prepare('SELECT * FROM control_point WHERE active = 1 ORDER BY type, code').all() as Record<string, unknown>[];
    return cps.map((cp) => ({
      ...cp,
      parameters: d.prepare('SELECT * FROM control_parameter WHERE control_point_id = ? ORDER BY code').all(cp.id),
    }));
  });

  // Изменение критического предела (К6, Р-10): право → состояние плана
  app.patch('/api/control-parameters/:id', { config: { auth: 'ccp.limit.update' } }, async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { limitMin?: unknown; limitMax?: unknown; comment?: string };
    const d = db();
    const p = d.prepare(`SELECT pr.*, cp.plan_lineage_id, cp.code AS cp_code FROM control_parameter pr
      JOIN control_point cp ON cp.id = pr.control_point_id WHERE pr.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!p) throw notFound('control_parameter', id);
    const draft = d.prepare("SELECT id FROM haccp_plan WHERE lineage_id = ? AND status = 'draft'").pluck().get(p.plan_lineage_id) as string | undefined;
    if (!draft) {
      const current = d.prepare(`SELECT id, status, version FROM haccp_plan WHERE lineage_id = ? AND status <> 'archived' ORDER BY version DESC LIMIT 1`)
        .get(p.plan_lineage_id) as { id: string; status: string; version: number };
      throw conflict('plan_locked', {
        planStatus: current.status, version: current.version,
        available: availableTransitions(d, 'haccp_plan', current.status).map((t) => ({ to: t.to_state, permission: t.permission })),
      }, `HACCP plan v${current.version} is ${current.status}; limits can be changed only in a draft version (start a revision first)`);
    }
    const min = 'limitMin' in body ? num(body.limitMin) : (p.limit_min as number | null);
    const max = 'limitMax' in body ? num(body.limitMax) : (p.limit_max as number | null);
    if (Number.isNaN(min) || Number.isNaN(max)) throw badRequest('invalid_number');
    if (min !== null && max !== null && min > max) throw badRequest('limit_min_gt_max');
    d.transaction(() => {
      d.prepare('UPDATE control_parameter SET limit_min = ?, limit_max = ? WHERE id = ?').run(min, max, id);
      appendAudit(d, actorOf(req), {
        module: 'A03', objectType: 'control_parameter', objectId: id, action: 'limit.update',
        before: { limitMin: p.limit_min, limitMax: p.limit_max }, after: { limitMin: min, limitMax: max }, comment: body.comment ?? null,
      });
    })();
    return d.prepare('SELECT * FROM control_parameter WHERE id = ?').get(id);
  });

  const recordWithCorrections = (id: string) => {
    const d = db();
    const r = d.prepare('SELECT * FROM monitoring_record WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r) throw notFound('monitoring_record', id);
    const corrections = d.prepare('SELECT * FROM monitoring_correction WHERE original_id = ? ORDER BY at').all(id) as Record<string, unknown>[];
    const last = corrections[corrections.length - 1];
    return {
      ...r, corrections,
      effective: last ? { value_num: last.value_num, value_pass: last.value_pass, in_limits: last.in_limits, correctionId: last.id }
        : { value_num: r.value_num, value_pass: r.value_pass, in_limits: r.in_limits, correctionId: null },
    };
  };

  app.get('/api/monitoring', { config: { auth: 'a03.module.read' } }, async () =>
    (db().prepare('SELECT id FROM monitoring_record ORDER BY event_at DESC').pluck().all() as string[]).map(recordWithCorrections));
  app.get('/api/monitoring/:id', { config: { auth: 'a03.module.read' } }, async (req) => recordWithCorrections((req.params as { id: string }).id));

  // Исправление записи мониторинга — только записью-корректировкой (К10, Р-11)
  app.post('/api/monitoring/:id/corrections', { config: { auth: 'ccp.monitoring.correct' } }, async (req) => {
    const { id } = req.params as { id: string };
    const actor = actorOf(req);
    const body = (req.body ?? {}) as { value?: unknown; pass?: unknown; reason?: string };
    const reason = String(body.reason ?? '').trim();
    if (!reason) throw badRequest('reason_required');
    const d = db();
    const rec = recordWithCorrections(id) as Record<string, unknown> & { effective: { in_limits: number } };
    if (!can(actor, 'ccp.monitoring.correct_any')) {
      const hours = JSON.parse(d.prepare("SELECT value FROM setting WHERE key = 'event_backdate_hours'").pluck().get() as string) as number;
      const age = (clock.now().getTime() - Date.parse(rec.recorded_at as string)) / 3600_000;
      if (rec.operator_id !== actor.id) throw new AppError(403, 'forbidden', { permission: 'ccp.monitoring.correct_any' }, 'Only own records can be corrected');
      if (age > hours) throw new AppError(403, 'correction_window_expired', { hours, permission: 'ccp.monitoring.correct_any' }, `Own records can be corrected within ${hours} h`);
    }
    const param = d.prepare('SELECT * FROM control_parameter WHERE id = ?').get(rec.parameter_id) as { kind: string };
    let valueNum: number | null = null;
    let valuePass: number | null = null;
    let inLimits: boolean;
    if (param.kind === 'numeric') {
      valueNum = num(body.value);
      if (valueNum === null || Number.isNaN(valueNum)) throw badRequest('invalid_number');
      inLimits = withinLimits(valueNum, rec.limit_min_snapshot as number | null, rec.limit_max_snapshot as number | null);
    } else {
      if (typeof body.pass !== 'boolean') throw badRequest('pass_required');
      valuePass = Number(body.pass);
      inLimits = body.pass;
    }
    const correctionId = ulid();
    d.transaction(() => {
      let ncId: string | null = null;
      if (!inLimits && rec.effective.in_limits) {
        const cp = d.prepare('SELECT code, type FROM control_point WHERE id = ?').get(rec.control_point_id) as { code: string; type: 'CCP' | 'OPRP' };
        ncId = registerDeviation(d, actor, {
          sourceType: 'monitoring', sourceId: id, fgBatchId: rec.fg_batch_id as string, cpType: cp.type,
          description: `${cp.code}: корректировка записи — значение вне предела (${valueNum ?? (valuePass ? 'pass' : 'fail')})`,
        }).ncId;
      }
      d.prepare(`INSERT INTO monitoring_correction (id, original_id, value_num, value_pass, in_limits, reason, author_id, author_name_snapshot, at, nc_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(correctionId, id, valueNum, valuePass, Number(inLimits), reason, actor.id, actor.fullName, clock.nowIso(), ncId);
      appendAudit(d, actor, {
        module: 'A03', objectType: 'monitoring_record', objectId: id, action: 'correct',
        before: rec.effective, after: { value_num: valueNum, value_pass: valuePass, in_limits: Number(inLimits), correctionId }, comment: reason,
      });
    })();
    return recordWithCorrections(id);
  });

  // ── Движок автоматов: доступные переходы и выполнение перехода ──
  const entityOf = (e: string): FsmEntity => {
    if (!(e in FSM_ENTITIES)) throw badRequest('unknown_entity', { entity: e });
    return e as FsmEntity;
  };
  app.get('/api/fsm/:entity/:id', { config: { auth: 'user' } }, async (req) => {
    const { entity, id } = req.params as { entity: string; id: string };
    const def = FSM_ENTITIES[entityOf(entity)];
    authorize(actorOf(req), `${def.module.toLowerCase()}.module.read`);
    const row = db().prepare(`SELECT status FROM ${def.table} WHERE id = ?`).get(id) as { status: string } | undefined;
    if (!row) throw notFound(entity, id);
    const actor = actorOf(req);
    return {
      status: row.status,
      transitions: availableTransitions(db(), def.machine, row.status).map((t) => ({
        to: t.to_state, permission: t.permission, commentRequired: !!t.comment_required, allowed: can(actor, t.permission),
      })),
    };
  });
  app.post('/api/fsm/:entity/:id/transition', { config: { auth: 'engine' } }, async (req) => {
    const { entity, id } = req.params as { entity: string; id: string };
    const { to, comment } = (req.body ?? {}) as { to?: string; comment?: string };
    if (!to) throw badRequest('target_state_required');
    const d = db();
    const status = d.transaction(() => transition(d, actorOf(req), entityOf(entity), id, to, { comment }))();
    return { status };
  });
};
