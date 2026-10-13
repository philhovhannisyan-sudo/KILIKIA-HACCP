import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { assertEquipmentUsable, assertEventTime } from '../../core/equipment';
import { AppError, badRequest, conflict, notFound } from '../../core/errors';
import { can } from '../../core/rbac';
import { ulid } from '../../core/ids';
import { parseDecimal } from '../../../shared/number';
import { registerDeviation } from './deviation';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseDecimal(String(v));
  return n === null || !Number.isFinite(n) ? null : n;
};
const within = (v: number, min: number | null, max: number | null) => (min === null || v >= min) && (max === null || v <= max);

export const monitoringRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;

  app.get('/api/fg-batches', { config: { auth: 'user' } }, async () =>
    db().prepare(`SELECT b.id, b.code, b.status, b.produced_date, p.name_i18n AS product FROM fg_batch b JOIN product p ON p.id = b.product_id ORDER BY b.produced_date DESC, b.code`).all());

  // Запись мониторинга ККТ/OPRP (A03). Выход за предел — одна транзакция: запись, НС, карантин, уведомление, журнал (К11)
  app.post('/api/monitoring', { config: { auth: 'ccp.monitoring.create' } }, async (req) => {
    const b = (req.body ?? {}) as { parameterId?: string; fgBatchId?: string; value?: unknown; pass?: unknown; eventAt?: string; equipmentId?: string | null };
    const d = db();
    const actor = actorOf(req);
    const p = d.prepare(`SELECT pr.*, cp.code AS cp_code, cp.type AS cp_type, cp.id AS cp_id FROM control_parameter pr
      JOIN control_point cp ON cp.id = pr.control_point_id WHERE pr.id = ? AND cp.active = 1`).get(b.parameterId) as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!p) throw badRequest('field_required', { field: 'parameterId' });
    const batch = d.prepare('SELECT id, code FROM fg_batch WHERE id = ?').get(b.fgBatchId) as { id: string; code: string } | undefined;
    if (!batch) throw badRequest('field_required', { field: 'fgBatchId' });
    const equipmentId = b.equipmentId || p.equipment_id;
    if (!equipmentId) throw badRequest('field_required', { field: 'equipmentId' });
    assertEquipmentUsable(d, equipmentId);
    const eventAt = assertEventTime(d, b.eventAt ?? clock.nowIso());
    let valueNum: number | null = null;
    let valuePass: number | null = null;
    let inLimits: boolean;
    if (p.kind === 'numeric') {
      valueNum = num(b.value);
      if (valueNum === null) throw badRequest('invalid_number', { field: 'value' });
      inLimits = within(valueNum, p.limit_min, p.limit_max);
    } else {
      if (typeof b.pass !== 'boolean') throw badRequest('pass_required');
      valuePass = Number(b.pass);
      inLimits = b.pass;
    }
    const id = ulid();
    const result = d.transaction(() => {
      let nc: { ncId: string; ncCode: string } | null = null;
      if (!inLimits) {
        const v = valueNum !== null ? `${valueNum}${p.unit ? ' ' + p.unit : ''}` : 'fail';
        const lim = [p.limit_min !== null ? `≥ ${p.limit_min}` : '', p.limit_max !== null ? `≤ ${p.limit_max}` : ''].filter(Boolean).join(', ');
        nc = registerDeviation(d, actor, { sourceType: 'monitoring', sourceId: id, fgBatchId: batch.id, cpType: p.cp_type,
          description: `${p.cp_code} / ${p.code}: ${v}${lim ? ` (${lim})` : ''} — ${batch.code}` });
      }
      d.prepare(`INSERT INTO monitoring_record (id, control_point_id, parameter_id, fg_batch_id, value_num, value_pass, event_at, recorded_at,
        operator_id, operator_name_snapshot, equipment_id, limit_min_snapshot, limit_max_snapshot, in_limits, nc_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, p.cp_id, p.id, batch.id, valueNum, valuePass, eventAt, clock.nowIso(), actor.id, actor.fullName, equipmentId,
          p.limit_min, p.limit_max, Number(inLimits), nc?.ncId ?? null);
      appendAudit(d, actor, { module: 'A03', objectType: 'monitoring_record', objectId: id, action: 'create',
        after: { parameter: `${p.cp_code}/${p.code}`, batch: batch.code, value: valueNum ?? valuePass, inLimits, nc: nc?.ncCode ?? null } });
      return { id, inLimits, nc };
    })();
    return result;
  });

  // ── A10: среда и холодовая цепь ──
  app.get('/api/env-points', { config: { auth: 'a10.module.read' } }, async () =>
    db().prepare(`SELECT p.*, e.code AS equipment_code, e.next_cal_date FROM env_point p LEFT JOIN equipment e ON e.id = p.equipment_id ORDER BY p.code`).all());

  app.get('/api/env-records', { config: { auth: 'a10.module.read' } }, async (req) => {
    const q = req.query as { from?: string; to?: string; pointId?: string };
    return envRecords(db(), q.from, q.to, q.pointId);
  });

  app.post('/api/env-records', { config: { auth: 'env.record.create' } }, async (req) => {
    const b = (req.body ?? {}) as { pointId?: string; value?: unknown; eventAt?: string };
    const d = db();
    const actor = actorOf(req);
    const pt = d.prepare('SELECT * FROM env_point WHERE id = ?').get(b.pointId) as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!pt) throw badRequest('field_required', { field: 'pointId' });
    if (pt.equipment_id) assertEquipmentUsable(d, pt.equipment_id);
    const value = num(b.value);
    if (value === null) throw badRequest('invalid_number', { field: 'value' });
    const eventAt = assertEventTime(d, b.eventAt ?? clock.nowIso());
    const inLimits = within(value, pt.limit_min, pt.limit_max);
    const id = ulid();
    d.transaction(() => {
      d.prepare(`INSERT INTO env_record (id, point_id, value, event_at, recorded_at, recorded_by, recorded_by_name_snapshot, in_limits) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, pt.id, value, eventAt, clock.nowIso(), actor.id, actor.fullName, Number(inLimits));
      // Отклонение среды: уведомление ответственным; решение о НС принимает человек (Р-12)
      if (!inLimits) for (const role of ['haccp_lead', 'qa_lab']) {
        d.prepare(`INSERT INTO notification (id, recipient_role, type, ref_type, ref_id, params, created_at) VALUES (?, ?, 'env_deviation', 'env_record', ?, ?, ?)`)
          .run(ulid(), role, id, JSON.stringify({ point: pt.code, value, unit: pt.unit }), clock.nowIso());
      }
      appendAudit(d, actor, { module: 'A10', objectType: 'env_record', objectId: id, action: 'create', after: { point: pt.code, value, inLimits } });
    })();
    return { id, inLimits };
  });

  app.post('/api/env-records/:id/corrections', { config: { auth: 'env.record.correct' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { value?: unknown; reason?: string };
    const reason = String(b.reason ?? '').trim();
    if (!reason) throw badRequest('reason_required');
    const d = db();
    const actor = actorOf(req);
    const r = d.prepare('SELECT r.*, p.limit_min, p.limit_max FROM env_record r JOIN env_point p ON p.id = r.point_id WHERE r.id = ?').get(id) as Record<string, any> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!r) throw notFound('env_record', id);
    if (!can(actor, 'env.record.correct_any')) {
      const hours = JSON.parse(d.prepare("SELECT value FROM setting WHERE key = 'event_backdate_hours'").pluck().get() as string) as number;
      if (r.recorded_by !== actor.id) throw new AppError(403, 'forbidden', { permission: 'env.record.correct_any' });
      if ((clock.now().getTime() - Date.parse(r.recorded_at)) / 3600_000 > hours) throw new AppError(403, 'correction_window_expired', { hours, permission: 'env.record.correct_any' });
    }
    const value = num(b.value);
    if (value === null) throw badRequest('invalid_number', { field: 'value' });
    const inLimits = within(value, r.limit_min, r.limit_max);
    d.transaction(() => {
      d.prepare('INSERT INTO env_correction (id, original_id, value, in_limits, reason, author_id, author_name_snapshot, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(ulid(), id, value, Number(inLimits), reason, actor.id, actor.fullName, clock.nowIso());
      appendAudit(d, actor, { module: 'A10', objectType: 'env_record', objectId: id, action: 'correct', before: { value: r.value }, after: { value, inLimits }, comment: reason });
    })();
    return envRecords(d, undefined, undefined, undefined, id)[0];
  });

  // Ручная регистрация НС по отклонению среды (Р-12)
  app.post('/api/env-records/:id/nonconformity', { config: { auth: 'nc.record.create' } }, async (req) => {
    const { id } = req.params as { id: string };
    const d = db();
    const r = envRecords(d, undefined, undefined, undefined, id)[0];
    if (!r) throw notFound('env_record', id);
    if (r.effective_in_limits) throw conflict('record_in_limits');
    const exists = d.prepare("SELECT code FROM nonconformity WHERE source_type = 'environment' AND source_id = ?").pluck().get(id) as string | undefined;
    if (exists) throw conflict('nc_exists', { code: exists });
    return d.transaction(() => registerDeviation(d, actorOf(req), { sourceType: 'environment', sourceId: id, fgBatchId: null, cpType: null,
      description: `${r.point_code}: ${r.effective_value} ${r.unit} (${[r.limit_min !== null ? `≥ ${r.limit_min}` : '', r.limit_max !== null ? `≤ ${r.limit_max}` : ''].filter(Boolean).join(', ')})` }))();
  });

  // Минимальный реестр несоответствий D04 (полный модуль — фаза 6)
  app.get('/api/nonconformities', { config: { auth: 'd04.module.read' } }, async () =>
    db().prepare(`SELECT n.*, b.code AS batch_code, m.code AS lot_code FROM nonconformity n LEFT JOIN fg_batch b ON b.id = n.fg_batch_id
      LEFT JOIN material_lot m ON m.id = n.material_lot_id ORDER BY n.registered_at DESC`).all());

  app.get('/api/notifications', { config: { auth: 'user' } }, async (req) => {
    const a = actorOf(req);
    const roles = a.roles.length ? a.roles : ['-'];
    return db().prepare(`SELECT * FROM notification WHERE (recipient_user_id = ? OR recipient_role IN (${roles.map(() => '?').join(',')})) ORDER BY created_at DESC LIMIT 50`)
      .all(a.id, ...roles).map((n) => ({ ...(n as object), params: JSON.parse((n as { params: string }).params ?? '{}') }));
  });
};

/** Записи среды с учётом корректировок. Общий запрос для экрана, графика и печати. */
export function envRecords(d: import('../../db/connection').DB, from?: string, to?: string, pointId?: string, id?: string) {
  const where: string[] = []; const args: unknown[] = [];
  if (from) { where.push('r.event_at >= ?'); args.push(from); }
  if (to) { where.push('r.event_at < ?'); args.push(to); }
  if (pointId) { where.push('r.point_id = ?'); args.push(pointId); }
  if (id) { where.push('r.id = ?'); args.push(id); }
  return d.prepare(`SELECT r.*, p.code AS point_code, p.zone_i18n, p.kind, p.unit, p.limit_min, p.limit_max,
      coalesce(c.value, r.value) AS effective_value, coalesce(c.in_limits, r.in_limits) AS effective_in_limits,
      c.reason AS correction_reason, c.author_name_snapshot AS correction_author, c.at AS correction_at,
      (SELECT code FROM nonconformity n WHERE n.source_type = 'environment' AND n.source_id = r.id) AS nc_code
    FROM env_record r JOIN env_point p ON p.id = r.point_id
    LEFT JOIN env_correction c ON c.id = (SELECT id FROM env_correction WHERE original_id = r.id ORDER BY at DESC LIMIT 1)
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.event_at DESC`).all(...args) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
}
