import type { DB } from '../../db/connection';
import type { Actor } from '../../core/actor';
import { appendAudit } from '../../core/audit';
import { availableTransitions, transition } from '../../core/fsm';
import { clock } from '../../core/clock';
import { conflict, notFound } from '../../core/errors';
import { ulid } from '../../core/ids';

export const userText = (text: string) => JSON.stringify({ src: text.trim() });
export const parseI18n = (v: string | null): Record<string, string> => (v ? JSON.parse(v) : {});
const textOf = (v: string | null) => { const o = parseI18n(v); return o.src ?? o.ru ?? ''; };

export interface PlanRow {
  id: string; lineage_id: string; version: number; status: string; title_i18n: string; scope: string; wizard_state: string;
  site_verified_date: string | null; site_verified_by: string | null; approved_at: string | null; approved_by: string | null;
  effective_from: string | null; effective_to: string | null; created_at: string;
}

export function getPlan(db: DB, id: string): PlanRow {
  const p = db.prepare('SELECT * FROM haccp_plan WHERE id = ?').get(id) as PlanRow | undefined;
  if (!p) throw notFound('haccp_plan', id);
  return p;
}

/** Изменять можно только черновик; иначе — 409 с перечнем допустимых переходов (К15). */
export function assertEditable(db: DB, plan: PlanRow) {
  if (plan.status !== 'draft') {
    throw conflict('plan_locked', {
      planStatus: plan.status, version: plan.version,
      available: availableTransitions(db, 'haccp_plan', plan.status).map((t) => ({ to: t.to_state, permission: t.permission })),
    }, `HACCP plan v${plan.version} is ${plan.status}; only a draft can be changed (start a revision first)`);
  }
}

export const SCREENS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Заполненность экранов мастера. Экран 7 считается заполненным, когда 1–6 заполнены и описана верификация. */
export function completeness(db: DB, planId: string): Record<number, boolean> {
  const p = getPlan(db, planId);
  const ws = JSON.parse(p.wizard_state) as Record<string, string>;
  const one = (sql: string, ...a: unknown[]) => db.prepare(sql).pluck().get(...a) as number;
  const hazards = db.prepare('SELECT id, significant, result FROM hazard WHERE plan_id = ?').all(planId) as { id: string; significant: number; result: string }[];
  const controlled = hazards.filter((h) => h.result === 'CCP' || h.result === 'OPRP');
  const c: Record<number, boolean> = {
    1: one('SELECT count(*) FROM haccp_team_member WHERE plan_id = ?', planId) > 0,
    2: (JSON.parse(p.scope) as string[]).length > 0 && !!textOf(ws.intendedUse ?? null),
    3: one('SELECT count(*) FROM process_step WHERE plan_id = ?', planId) >= 2 && !!p.site_verified_date && !!p.site_verified_by,
    4: hazards.length > 0,
    5: hazards.length > 0 && hazards.every((h) => h.result !== 'pending' && h.result !== 'needs_change'),
    6: controlled.every((h) => {
      const cp = db.prepare('SELECT id FROM control_point WHERE hazard_id = ? AND active = 1').pluck().get(h.id) as string | undefined;
      if (!cp) return false;
      const params = db.prepare('SELECT kind, limit_min, limit_max FROM control_parameter WHERE control_point_id = ?').all(cp) as { kind: string; limit_min: number | null; limit_max: number | null }[];
      return params.length > 0 && params.every((x) => x.kind === 'pass_fail' || x.limit_min !== null || x.limit_max !== null);
    }),
    7: false,
  };
  // Экран 6 имеет смысл только после определения ККТ/OPRP на экране 5
  c[6] = c[6] && c[5];
  c[7] = [1, 2, 3, 4, 5, 6].every((s) => c[s]) && !!textOf(ws.verification ?? null);
  return c;
}

/** Полный план для экрана и печати. */
export function loadPlan(db: DB, id: string) {
  const plan = getPlan(db, id);
  const steps = db.prepare('SELECT * FROM process_step WHERE plan_id = ? ORDER BY ord').all(id) as Record<string, unknown>[];
  const hazards = (db.prepare(`SELECT h.*, s.ord AS step_ord FROM hazard h JOIN process_step s ON s.id = h.step_id
    WHERE h.plan_id = ? ORDER BY s.ord, h.rowid`).all(id) as Record<string, unknown>[]).map((h) => ({
    ...h,
    decisions: db.prepare('SELECT node, answer, justification FROM hazard_decision WHERE hazard_id = ? ORDER BY ord').all(h.id),
    oprp: (() => {
      const o = db.prepare('SELECT criteria, justification, result, override_candidate FROM oprp_assessment WHERE hazard_id = ?').get(h.id) as
        { criteria: string; justification: string | null; result: string | null; override_candidate: number } | undefined;
      return o ? { ...o, criteria: JSON.parse(o.criteria), override_candidate: !!o.override_candidate } : null;
    })(),
  }));
  const controlPoints = (db.prepare('SELECT * FROM control_point WHERE plan_lineage_id = ? AND active = 1 ORDER BY type, code').all(plan.lineage_id) as Record<string, unknown>[])
    .map((cp) => ({ ...cp, parameters: db.prepare('SELECT * FROM control_parameter WHERE control_point_id = ? ORDER BY code').all(cp.id) }));
  const team = db.prepare('SELECT * FROM haccp_team_member WHERE plan_id = ? ORDER BY rowid').all(id);
  const versions = db.prepare('SELECT id, version, status, approved_at, effective_from, effective_to FROM haccp_plan WHERE lineage_id = ? ORDER BY version').all(plan.lineage_id);
  const approver = plan.approved_by ? (db.prepare('SELECT full_name FROM user WHERE id = ?').pluck().get(plan.approved_by) as string) : null;
  return {
    plan: { ...plan, scope: JSON.parse(plan.scope) as string[], wizard_state: JSON.parse(plan.wizard_state), approved_by_name: approver },
    team, steps, hazards, controlPoints, versions, completeness: completeness(db, id),
  };
}

/** Новая версия при пересмотре: копия команды, схемы, опасностей и решений; ККТ/OPRP — те же сущности (К16). */
export function startRevision(db: DB, actor: Actor, planId: string, comment: string): string {
  const old = getPlan(db, planId);
  transition(db, actor, 'haccp_plan', planId, 'under_revision', { comment });
  const newId = ulid();
  db.prepare(`INSERT INTO haccp_plan (id, lineage_id, version, status, title_i18n, scope, wizard_state, site_verified_date, site_verified_by, created_at)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`).run(newId, old.lineage_id,
    (db.prepare('SELECT max(version) FROM haccp_plan WHERE lineage_id = ?').pluck().get(old.lineage_id) as number) + 1,
    old.title_i18n, old.scope, old.wizard_state, old.site_verified_date, old.site_verified_by, clock.nowIso());
  for (const m of db.prepare('SELECT * FROM haccp_team_member WHERE plan_id = ?').all(planId) as Record<string, unknown>[]) {
    db.prepare('INSERT INTO haccp_team_member (id, plan_id, name, role, competence) VALUES (?, ?, ?, ?, ?)').run(ulid(), newId, m.name, m.role, m.competence);
  }
  const stepMap = new Map<string, string>();
  for (const s of db.prepare('SELECT * FROM process_step WHERE plan_id = ? ORDER BY ord').all(planId) as Record<string, unknown>[]) {
    const sid = ulid();
    stepMap.set(s.id as string, sid);
    db.prepare('INSERT INTO process_step (id, plan_id, ord, name_i18n, description) VALUES (?, ?, ?, ?, ?)').run(sid, newId, s.ord, s.name_i18n, s.description);
  }
  const hazardMap = new Map<string, string>();
  for (const h of db.prepare('SELECT * FROM hazard WHERE plan_id = ?').all(planId) as Record<string, unknown>[]) {
    const hid = ulid();
    hazardMap.set(h.id as string, hid);
    db.prepare(`INSERT INTO hazard (id, plan_id, step_id, type, description_i18n, likelihood, severity, significant, control_measure_i18n, result)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(hid, newId, stepMap.get(h.step_id as string), h.type, h.description_i18n, h.likelihood, h.severity, h.significant, h.control_measure_i18n, h.result);
    for (const d of db.prepare('SELECT * FROM hazard_decision WHERE hazard_id = ? ORDER BY ord').all(h.id) as Record<string, unknown>[]) {
      db.prepare('INSERT INTO hazard_decision (id, hazard_id, node, answer, justification, ord) VALUES (?, ?, ?, ?, ?, ?)').run(ulid(), hid, d.node, d.answer, d.justification, d.ord);
    }
    const o = db.prepare('SELECT * FROM oprp_assessment WHERE hazard_id = ?').get(h.id) as Record<string, unknown> | undefined;
    if (o) db.prepare('INSERT INTO oprp_assessment (id, hazard_id, criteria, justification, result, override_candidate, override_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(ulid(), hid, o.criteria, o.justification, o.result, o.override_candidate, o.override_by);
  }
  // ККТ/OPRP остаются теми же сущностями линии плана — переносим их ссылки на копии стадий и опасностей
  for (const cp of db.prepare('SELECT id, hazard_id, step_id FROM control_point WHERE plan_lineage_id = ?').all(old.lineage_id) as { id: string; hazard_id: string | null; step_id: string | null }[]) {
    db.prepare('UPDATE control_point SET hazard_id = ?, step_id = ? WHERE id = ?')
      .run(cp.hazard_id ? hazardMap.get(cp.hazard_id) ?? null : null, cp.step_id ? stepMap.get(cp.step_id) ?? null : null, cp.id);
  }
  appendAudit(db, actor, { module: 'A01', objectType: 'haccp_plan', objectId: newId, action: 'create_version', after: { from: planId, lineage: old.lineage_id }, comment });
  return newId;
}

/** После утверждения: дата и автор, вступление в силу; предыдущая версия на пересмотре → архив. */
export function afterPlanApproved(db: DB, actor: Actor, planId: string) {
  const p = getPlan(db, planId);
  const today = clock.today();
  db.prepare('UPDATE haccp_plan SET approved_at = ?, approved_by = ?, effective_from = ? WHERE id = ?').run(clock.nowIso(), actor.id, today, planId);
  for (const old of db.prepare("SELECT id FROM haccp_plan WHERE lineage_id = ? AND status = 'under_revision' AND id <> ?").pluck().all(p.lineage_id, planId) as string[]) {
    db.prepare('UPDATE haccp_plan SET effective_to = ? WHERE id = ?').run(today, old);
    transition(db, actor, 'haccp_plan', old, 'archived', { system: true, comment: `v${p.version}` });
  }
}
