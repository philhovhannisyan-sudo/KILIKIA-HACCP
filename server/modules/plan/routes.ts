import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import type { DB } from '../../db/connection';
import type { Actor } from '../../core/actor';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { authorize } from '../../core/rbac';
import { assertDeletable } from '../../core/integrity';
import { badRequest, conflict, notFound } from '../../core/errors';
import { ulid } from '../../core/ids';
import { parseDecimal } from '../../../shared/number';
import { evaluateTree, type TreeAnswer } from '../../../shared/regulatory/decisionTree';
import { categorize, hazardResult, isSignificant, type Criteria } from '../../../shared/regulatory/oprp';
import { assertEditable, getPlan, loadPlan, startRevision, userText } from './service';

const str = (v: unknown, field: string, required = true): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw badRequest('field_required', { field });
  return s;
};
const numOrNull = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseDecimal(String(v));
  if (n === null || !Number.isFinite(n)) throw badRequest('invalid_number', { field });
  return n;
};

/** Изменение плана: право → состояние (только черновик) → транзакция с записью в журнал. */
function editPlan<T>(db: DB, actor: Actor, planId: string, action: string, fn: () => T, before?: unknown): T {
  authorize(actor, 'haccp.plan.edit');
  const plan = getPlan(db, planId);
  assertEditable(db, plan);
  return db.transaction(() => {
    const result = fn();
    appendAudit(db, actor, { module: 'A01', objectType: 'haccp_plan', objectId: planId, action, before, after: result === undefined ? undefined : result });
    return result;
  })();
}

function recomputeHazard(db: DB, hazardId: string) {
  const h = db.prepare('SELECT significant FROM hazard WHERE id = ?').get(hazardId) as { significant: number };
  const answers = db.prepare('SELECT node, answer, justification FROM hazard_decision WHERE hazard_id = ? ORDER BY ord').all(hazardId) as TreeAnswer[];
  const tree = evaluateTree(answers);
  const o = db.prepare('SELECT result FROM oprp_assessment WHERE hazard_id = ?').pluck().get(hazardId) as string | undefined;
  const result = hazardResult(!!h.significant, tree.status === 'complete' ? tree.outcome : null,
    tree.status === 'complete' && tree.outcome === 'NOT_CCP' ? ((o as 'OPRP' | 'PRP' | 'CCP_CANDIDATE' | undefined) ?? null) : null);
  db.prepare('UPDATE hazard SET result = ? WHERE id = ?').run(result, hazardId);
  return result;
}

export const planRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;
  const threshold = () => JSON.parse(db().prepare("SELECT value FROM setting WHERE key = 'significance_threshold'").pluck().get() as string) as number;

  app.get('/api/plans', { config: { auth: 'a01.module.read' } }, async () =>
    db().prepare(`SELECT id, lineage_id, version, status, title_i18n, approved_at, effective_from, effective_to FROM haccp_plan ORDER BY lineage_id, version`).all());

  app.get('/api/plans/:id', { config: { auth: 'a01.module.read' } }, async (req) => {
    const data = loadPlan(db(), (req.params as { id: string }).id);
    return { ...data, settings: { significanceThreshold: threshold() } };
  });

  app.get('/api/products', { config: { auth: 'user' } }, async () => db().prepare('SELECT id, code, name_i18n, spec_i18n, shelf_life_days, packaging_i18n FROM product ORDER BY code').all());
  app.get('/api/equipment', { config: { auth: 'user' } }, async () => db().prepare('SELECT * FROM equipment ORDER BY code').all());

  // Новый план (черновик v1 новой линии)
  app.post('/api/plans', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const title = str((req.body as { title?: string })?.title, 'title');
    const d = db();
    const id = ulid();
    d.transaction(() => {
      d.prepare(`INSERT INTO haccp_plan (id, lineage_id, version, status, title_i18n, created_at) VALUES (?, ?, 1, 'draft', ?, ?)`)
        .run(id, `PLAN-${ulid()}`, userText(title), clock.nowIso());
      appendAudit(d, actorOf(req), { module: 'A01', objectType: 'haccp_plan', objectId: id, action: 'create', after: { title } });
    })();
    return loadPlan(d, id);
  });

  // Экран 1 — группа ХАССП
  app.put('/api/plans/:id/team', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id } = req.params as { id: string };
    const members = (req.body as { members?: { name?: string; role?: string; competence?: string }[] })?.members;
    if (!Array.isArray(members) || members.length === 0) throw badRequest('field_required', { field: 'members' });
    const rows = members.map((m, i) => ({ name: str(m.name, `members[${i}].name`), role: str(m.role, `members[${i}].role`), competence: (m.competence ?? '').trim() }));
    editPlan(db(), actorOf(req), id, 'screen1.team', () => {
      db().prepare('DELETE FROM haccp_team_member WHERE plan_id = ?').run(id);
      for (const m of rows) db().prepare('INSERT INTO haccp_team_member (id, plan_id, name, role, competence) VALUES (?, ?, ?, ?, ?)').run(ulid(), id, m.name, m.role, m.competence);
      return { members: rows.length };
    });
    return loadPlan(db(), id);
  });

  // Экран 2 — продукт и предполагаемое использование
  app.put('/api/plans/:id/product', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { scope?: string[]; intendedUse?: string; description?: string };
    if (!Array.isArray(b.scope) || b.scope.length === 0) throw badRequest('field_required', { field: 'scope' });
    for (const p of b.scope) if (!db().prepare('SELECT 1 FROM product WHERE id = ?').get(p)) throw notFound('product', p);
    const intendedUse = str(b.intendedUse, 'intendedUse');
    editPlan(db(), actorOf(req), id, 'screen2.product', () => {
      const ws = JSON.parse(getPlan(db(), id).wizard_state);
      ws.intendedUse = userText(intendedUse);
      if (b.description !== undefined) ws.productDescription = userText(String(b.description));
      db().prepare('UPDATE haccp_plan SET scope = ?, wizard_state = ? WHERE id = ?').run(JSON.stringify(b.scope), JSON.stringify(ws), id);
      return { scope: b.scope };
    });
    return loadPlan(db(), id);
  });

  // Экран 3 — схема процесса (порядок = порядок массива) и подтверждение на месте
  app.put('/api/plans/:id/steps', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { steps?: { id?: string; name?: string }[]; siteVerifiedDate?: string | null; siteVerifiedBy?: string | null };
    if (!Array.isArray(b.steps) || b.steps.length === 0) throw badRequest('field_required', { field: 'steps' });
    const d = db();
    editPlan(d, actorOf(req), id, 'screen3.flow', () => {
      const existing = new Map((d.prepare('SELECT id, name_i18n FROM process_step WHERE plan_id = ?').all(id) as { id: string; name_i18n: string }[]).map((s) => [s.id, s]));
      const keep = new Set(b.steps!.filter((s) => s.id).map((s) => s.id!));
      for (const sid of existing.keys()) if (!keep.has(sid)) { assertDeletable(d, 'process_step', sid); d.prepare('DELETE FROM process_step WHERE id = ?').run(sid); }
      b.steps!.forEach((s, ord) => {
        if (s.id && existing.has(s.id)) {
          d.prepare('UPDATE process_step SET ord = ? WHERE id = ?').run(ord, s.id);
          if (s.name !== undefined) d.prepare('UPDATE process_step SET name_i18n = ? WHERE id = ?').run(userText(str(s.name, `steps[${ord}].name`)), s.id);
        } else {
          d.prepare('INSERT INTO process_step (id, plan_id, ord, name_i18n) VALUES (?, ?, ?, ?)').run(ulid(), id, ord, userText(str(s.name, `steps[${ord}].name`)));
        }
      });
      if (b.siteVerifiedDate !== undefined) {
        if (b.siteVerifiedDate && b.siteVerifiedDate > clock.today()) throw badRequest('date_in_future', { field: 'siteVerifiedDate' });
        d.prepare('UPDATE haccp_plan SET site_verified_date = ?, site_verified_by = ? WHERE id = ?').run(b.siteVerifiedDate || null, (b.siteVerifiedBy ?? '').trim() || null, id);
      }
      return { steps: b.steps!.length };
    });
    return loadPlan(d, id);
  });

  // Экран 4 — анализ опасностей
  app.put('/api/plans/:id/hazards', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { id?: string; stepId?: string; type?: string; description?: string; likelihood?: number; severity?: number; controlMeasure?: string };
    const d = db();
    if (!['bio', 'chem', 'phys', 'allergen'].includes(String(b.type))) throw badRequest('field_required', { field: 'type' });
    const lik = Number(b.likelihood); const sev = Number(b.severity);
    if (![1, 2, 3].includes(lik) || ![1, 2, 3].includes(sev)) throw badRequest('invalid_scale', { min: 1, max: 3 });
    if (!d.prepare('SELECT 1 FROM process_step WHERE id = ? AND plan_id = ?').get(b.stepId, id)) throw badRequest('field_required', { field: 'stepId' });
    const desc = str(b.description, 'description');
    const significant = isSignificant(lik, sev, threshold());
    let hid = b.id;
    editPlan(d, actorOf(req), id, 'screen4.hazard', () => {
      if (hid) {
        if (!d.prepare('SELECT 1 FROM hazard WHERE id = ? AND plan_id = ?').get(hid, id)) throw notFound('hazard', hid);
        d.prepare('UPDATE hazard SET step_id = ?, type = ?, description_i18n = ?, likelihood = ?, severity = ?, significant = ?, control_measure_i18n = ? WHERE id = ?')
          .run(b.stepId, b.type, userText(desc), lik, sev, Number(significant), userText(b.controlMeasure ?? ''), hid);
      } else {
        hid = ulid();
        d.prepare(`INSERT INTO hazard (id, plan_id, step_id, type, description_i18n, likelihood, severity, significant, control_measure_i18n, result)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).run(hid, id, b.stepId, b.type, userText(desc), lik, sev, Number(significant), userText(b.controlMeasure ?? ''));
      }
      return { hazard: hid, significant, result: recomputeHazard(d, hid!) };
    });
    return loadPlan(d, id);
  });

  app.delete('/api/plans/:id/hazards/:hid', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id, hid } = req.params as { id: string; hid: string };
    const d = db();
    editPlan(d, actorOf(req), id, 'screen4.hazard.delete', () => {
      d.prepare('DELETE FROM hazard_decision WHERE hazard_id = ?').run(hid);
      d.prepare('DELETE FROM oprp_assessment WHERE hazard_id = ?').run(hid);
      assertDeletable(d, 'hazard', hid);
      d.prepare('DELETE FROM hazard WHERE id = ? AND plan_id = ?').run(hid, id);
      return { hazard: hid };
    });
    return loadPlan(d, id);
  });

  // Экран 5 — дерево решений и категоризация OPRP
  app.put('/api/plans/:id/hazards/:hid/decisions', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id, hid } = req.params as { id: string; hid: string };
    const b = (req.body ?? {}) as { answers?: TreeAnswer[]; oprp?: { criteria?: Partial<Criteria>; overrideCandidate?: boolean; justification?: string } | null };
    const d = db();
    const actor = actorOf(req);
    const hz = d.prepare('SELECT significant FROM hazard WHERE id = ? AND plan_id = ?').get(hid, id) as { significant: number } | undefined;
    if (!hz) throw notFound('hazard', hid);
    if (!hz.significant) throw conflict('hazard_not_significant', {}, 'Decision tree applies to significant hazards only');
    const answers = Array.isArray(b.answers) ? b.answers : [];
    const tree = evaluateTree(answers);
    if (tree.status === 'invalid') throw badRequest('tree_invalid', { reason: tree.error, at: tree.at });
    let oprpResult: string | null = null;
    if (b.oprp && tree.status === 'complete' && tree.outcome === 'NOT_CCP') {
      if (b.oprp.overrideCandidate) {
        authorize(actor, 'haccp.plan.approve'); // отклонить «кандидата в ККТ» может только руководитель ХАССП (Р-3)
        str(b.oprp.justification, 'oprp.justification');
      }
      const cat = categorize(b.oprp.criteria ?? {}, !!b.oprp.overrideCandidate);
      if (cat.status === 'invalid') throw badRequest('oprp_invalid', { reason: cat.error, criterion: cat.criterion });
      oprpResult = cat.outcome;
    }
    const result = editPlan(d, actor, id, 'screen5.decision', () => {
      d.prepare('DELETE FROM hazard_decision WHERE hazard_id = ?').run(hid);
      answers.forEach((a, ord) => d.prepare('INSERT INTO hazard_decision (id, hazard_id, node, answer, justification, ord) VALUES (?, ?, ?, ?, ?, ?)')
        .run(ulid(), hid, a.node, a.answer, a.justification.trim(), ord));
      d.prepare('DELETE FROM oprp_assessment WHERE hazard_id = ?').run(hid);
      if (oprpResult) {
        d.prepare('INSERT INTO oprp_assessment (id, hazard_id, criteria, justification, result, override_candidate, override_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(ulid(), hid, JSON.stringify(b.oprp!.criteria), b.oprp!.justification?.trim() || null, oprpResult, Number(!!b.oprp!.overrideCandidate), b.oprp!.overrideCandidate ? actor.id : null);
      }
      return { hazard: hid, tree: tree.status === 'complete' ? tree.outcome : null, oprp: oprpResult, result: recomputeHazard(d, hid) };
    });
    return { ...loadPlan(d, id), decision: result };
  });

  // Экран 6 — ККТ/OPRP: пределы, мониторинг, корректирующие действия (единая сущность с реестром A03)
  app.put('/api/plans/:id/control-points', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as {
      id?: string; code?: string; hazardId?: string; name?: string; responsibleRole?: string; correctiveAction?: string;
      parameters?: { id?: string; code?: string; name?: string; kind?: string; limitMin?: unknown; limitMax?: unknown; unit?: string; method?: string; frequency?: string; equipmentId?: string | null }[];
    };
    const d = db();
    const actor = actorOf(req);
    const plan = getPlan(d, id);
    const hz = d.prepare('SELECT id, step_id, result FROM hazard WHERE id = ? AND plan_id = ?').get(b.hazardId, id) as { id: string; step_id: string; result: string } | undefined;
    if (!hz) throw badRequest('field_required', { field: 'hazardId' });
    if (hz.result !== 'CCP' && hz.result !== 'OPRP') throw conflict('hazard_not_controlled', { result: hz.result }, 'Only CCP/OPRP hazards need a control point');
    const code = str(b.code, 'code');
    const params = (b.parameters ?? []).map((p, i) => {
      const kind = p.kind === 'pass_fail' ? 'pass_fail' : 'numeric';
      const limitMin = kind === 'numeric' ? numOrNull(p.limitMin, `parameters[${i}].limitMin`) : null;
      const limitMax = kind === 'numeric' ? numOrNull(p.limitMax, `parameters[${i}].limitMax`) : null;
      if (kind === 'numeric' && limitMin === null && limitMax === null) throw badRequest('limit_required', { field: `parameters[${i}]` });
      if (limitMin !== null && limitMax !== null && limitMin > limitMax) throw badRequest('limit_min_gt_max');
      if (p.equipmentId && !d.prepare('SELECT 1 FROM equipment WHERE id = ?').get(p.equipmentId)) throw notFound('equipment', p.equipmentId);
      return {
        id: p.id, code: str(p.code, `parameters[${i}].code`), name: str(p.name, `parameters[${i}].name`), kind, limitMin, limitMax,
        unit: (p.unit ?? '').trim() || null, method: str(p.method, `parameters[${i}].method`), frequency: str(p.frequency, `parameters[${i}].frequency`), equipmentId: p.equipmentId || null,
      };
    });
    if (params.length === 0) throw badRequest('field_required', { field: 'parameters' });
    const cpId = b.id ?? ulid();
    const existing = b.id ? (d.prepare('SELECT * FROM control_point WHERE id = ? AND plan_lineage_id = ?').get(b.id, plan.lineage_id) as Record<string, unknown> | undefined) : undefined;
    if (b.id && !existing) throw notFound('control_point', b.id);
    // Изменение пределов существующего параметра требует права ccp.limit.update (К6)
    for (const p of params) {
      if (!p.id) continue;
      const old = d.prepare('SELECT limit_min, limit_max FROM control_parameter WHERE id = ? AND control_point_id = ?').get(p.id, cpId) as { limit_min: number | null; limit_max: number | null } | undefined;
      if (!old) throw notFound('control_parameter', p.id);
      if (old.limit_min !== p.limitMin || old.limit_max !== p.limitMax) authorize(actor, 'ccp.limit.update');
    }
    if (d.prepare('SELECT 1 FROM control_point WHERE plan_lineage_id = ? AND code = ? AND id <> ?').get(plan.lineage_id, code, cpId)) throw conflict('code_taken', { code });
    editPlan(d, actor, id, 'screen6.control_point', () => {
      const fields = [code, hz.result, hz.id, hz.step_id, userText(str(b.name, 'name')), str(b.responsibleRole, 'responsibleRole'), userText(str(b.correctiveAction, 'correctiveAction'))];
      if (existing) d.prepare('UPDATE control_point SET code = ?, type = ?, hazard_id = ?, step_id = ?, name_i18n = ?, responsible_role = ?, corrective_action_i18n = ? WHERE id = ?').run(...fields, cpId);
      else d.prepare('INSERT INTO control_point (code, type, hazard_id, step_id, name_i18n, responsible_role, corrective_action_i18n, id, plan_lineage_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(...fields, cpId, plan.lineage_id);
      const keep = new Set(params.filter((p) => p.id).map((p) => p.id));
      for (const old of d.prepare('SELECT id FROM control_parameter WHERE control_point_id = ?').pluck().all(cpId) as string[]) {
        if (!keep.has(old)) { assertDeletable(d, 'control_parameter', old); d.prepare('DELETE FROM control_parameter WHERE id = ?').run(old); }
      }
      for (const p of params) {
        const v = [p.code, userText(p.name), p.kind, p.limitMin, p.limitMax, p.unit, userText(p.method), userText(p.frequency), p.equipmentId];
        if (p.id) d.prepare('UPDATE control_parameter SET code = ?, name_i18n = ?, kind = ?, limit_min = ?, limit_max = ?, unit = ?, method_i18n = ?, frequency_i18n = ?, equipment_id = ? WHERE id = ?').run(...v, p.id);
        else d.prepare('INSERT INTO control_parameter (code, name_i18n, kind, limit_min, limit_max, unit, method_i18n, frequency_i18n, equipment_id, id, control_point_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...v, ulid(), cpId);
      }
      return { controlPoint: cpId, code };
    }, existing ? { code: existing.code } : undefined);
    return { ...loadPlan(d, id), controlPointId: cpId };
  });

  // Экран 7 — верификация и документирование
  app.put('/api/plans/:id/verification', { config: { auth: 'haccp.plan.edit' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { verification?: string; validation?: string; records?: string };
    const verification = str(b.verification, 'verification');
    editPlan(db(), actorOf(req), id, 'screen7.verification', () => {
      const ws = JSON.parse(getPlan(db(), id).wizard_state);
      ws.verification = userText(verification);
      if (b.validation !== undefined) ws.validation = userText(String(b.validation));
      if (b.records !== undefined) ws.records = userText(String(b.records));
      db().prepare('UPDATE haccp_plan SET wizard_state = ? WHERE id = ?').run(JSON.stringify(ws), id);
      return { verification: true };
    });
    return loadPlan(db(), id);
  });

  // Пересмотр утверждённого плана → новая версия-черновик
  app.post('/api/plans/:id/revise', { config: { auth: 'haccp.plan.revise' } }, async (req) => {
    const { id } = req.params as { id: string };
    const comment = str((req.body as { comment?: string })?.comment, 'comment');
    const d = db();
    const newId = d.transaction(() => startRevision(d, actorOf(req), id, comment))();
    return loadPlan(d, newId);
  });

};
