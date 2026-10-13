import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (cookie: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, payload?: unknown) => {
  const r = await t.app.inject({ method, url, headers: { cookie }, payload: payload as Json });
  return { status: r.statusCode, body: r.json() as Json };
};
const why = (q: string) => ({ justification: `Обоснование: ${q}` });

/** Проходит все 7 экранов мастера для нового плана через API и возвращает его id. */
async function passWizard(cookie: string) {
  const products = (await call(cookie, 'GET', '/api/products')).body as unknown as { id: string }[];
  const eq = (await call(cookie, 'GET', '/api/equipment')).body as unknown as { id: string; code: string }[];
  let r = await call(cookie, 'POST', '/api/plans', { title: 'Новый план: повидло' });
  expect(r.status).toBe(200);
  const id = r.body.plan.id;
  r = await call(cookie, 'PUT', `/api/plans/${id}/team`, { members: [{ name: 'А. Петросян', role: 'Руководитель' }, { name: 'Д. Акопян', role: 'Технолог' }] });
  expect(r.body.completeness['1']).toBe(true);
  r = await call(cookie, 'PUT', `/api/plans/${id}/product`, { scope: [products[0].id], intendedUse: 'Для всех групп потребителей' });
  expect(r.body.completeness['2']).toBe(true);
  r = await call(cookie, 'PUT', `/api/plans/${id}/steps`, { steps: [{ name: 'Приёмка' }, { name: 'Варка' }, { name: 'Розлив' }], siteVerifiedDate: '2026-01-10', siteVerifiedBy: 'А. Петросян' });
  expect(r.body.completeness['3']).toBe(true);
  const fill = r.body.steps[2].id;
  r = await call(cookie, 'PUT', `/api/plans/${id}/hazards`, { stepId: fill, type: 'bio', description: 'Выживание микрофлоры', likelihood: 2, severity: 3, controlMeasure: 'Горячий розлив' });
  expect(r.body.completeness['4']).toBe(true);
  const hz = r.body.hazards[0];
  expect(hz).toMatchObject({ significant: 1, result: 'pending' });
  expect(r.body.completeness['5']).toBe(false);
  r = await call(cookie, 'PUT', `/api/plans/${id}/hazards/${hz.id}/decisions`, { answers: [{ node: 'Q1', answer: 'yes', ...why('Q1') }, { node: 'Q2', answer: 'yes', ...why('Q2') }] });
  expect(r.body.decision.result).toBe('CCP');
  expect(r.body.completeness['5']).toBe(true);
  expect(r.body.completeness['6']).toBe(false);
  r = await call(cookie, 'PUT', `/api/plans/${id}/control-points`, {
    code: 'CCP-1', hazardId: hz.id, name: 'Горячий розлив', responsibleRole: 'operator', correctiveAction: 'Карантин партии',
    parameters: [{ code: 'T', name: 'Температура', kind: 'numeric', limitMin: '85,0', unit: '°C', method: 'Термометр', frequency: 'Каждые 30 мин', equipmentId: eq.find((e) => e.code === 'T-01')!.id }],
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  expect(r.body.completeness['6']).toBe(true);
  r = await call(cookie, 'PUT', `/api/plans/${id}/verification`, { verification: 'Ежемесячный анализ записей' });
  expect(r.body.completeness).toEqual({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true });
  return { id, controlPointId: r.body.controlPoints[0].id as string };
}

describe('K13 мастер из 7 экранов и утверждение', () => {
  it('K13 7 экранов заполняются по порядку; утверждает только haccp.lead, другие роли получают отказ', async () => {
    const lead = await t.login('haccp.lead');
    const { id } = await passWizard(lead);
    expect((await call(lead, 'POST', `/api/fsm/haccp_plan/${id}/transition`, { to: 'under_approval' })).status).toBe(200);
    for (const login of ['admin', 'qa.lab', 'technologist', 'tech.director', 'qa.tech']) {
      const c = await t.login(login);
      const r = await call(c, 'POST', `/api/fsm/haccp_plan/${id}/transition`, { to: 'approved' });
      expect(r.status, login).toBe(403);
      expect(r.body.params.permission).toBe('haccp.plan.approve');
    }
    const ok = await call(lead, 'POST', `/api/fsm/haccp_plan/${id}/transition`, { to: 'approved' });
    expect(ok.body.status).toBe('approved');
    const plan = (await call(lead, 'GET', `/api/plans/${id}`)).body.plan;
    expect(plan).toMatchObject({ status: 'approved', approved_by: 'U-haccp.lead', approved_by_name: 'Анна Петросян' });
    expect(plan.effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('K13 неполный план нельзя отправить на утверждение (перечень незаполненных экранов)', async () => {
    const lead = await t.login('haccp.lead');
    const r = await call(lead, 'POST', '/api/plans', { title: 'Пустой' });
    const s = await call(lead, 'POST', `/api/fsm/haccp_plan/${r.body.plan.id}/transition`, { to: 'under_approval' });
    expect(s.status).toBe(422);
    expect(s.body.params).toMatchObject({ guard: 'planReadyForApproval', screens: [1, 2, 3, 4, 5, 6, 7] });
  });

  it('K14 через API: незначимая опасность → PRP; «В1а Да» блокирует отправку; кандидата в ККТ отклоняет только haccp.lead', async () => {
    const lead = await t.login('haccp.lead');
    const { id } = await passWizard(lead);
    const steps = (await call(lead, 'GET', `/api/plans/${id}`)).body.steps;
    let r = await call(lead, 'PUT', `/api/plans/${id}/hazards`, { stepId: steps[0].id, type: 'chem', description: 'Пестициды', likelihood: 1, severity: 2 });
    expect(r.body.hazards.find((h: Json) => h.type === 'chem').result).toBe('PRP');
    r = await call(lead, 'PUT', `/api/plans/${id}/hazards`, { stepId: steps[1].id, type: 'phys', description: 'Стекло', likelihood: 1, severity: 3 });
    const glass = r.body.hazards.find((h: Json) => h.type === 'phys');
    r = await call(lead, 'PUT', `/api/plans/${id}/hazards/${glass.id}/decisions`, { answers: [{ node: 'Q1', answer: 'no', ...why('Q1') }, { node: 'Q1a', answer: 'yes', ...why('Q1a') }] });
    expect(r.body.decision.result).toBe('needs_change');
    const blocked = await call(lead, 'POST', `/api/fsm/haccp_plan/${id}/transition`, { to: 'under_approval' });
    expect(blocked.body.params.screens).toContain(5);
    const tree = [{ node: 'Q1', answer: 'yes', ...why('Q1') }, { node: 'Q2', answer: 'no', ...why('Q2') }, { node: 'Q3', answer: 'no', ...why('Q3') }];
    const criteria = Object.fromEntries([1, 2, 3, 4, 5].map((c) => [c, { answer: c === 5 ? 'yes' : 'no', ...why(`k${c}`) }]));
    r = await call(lead, 'PUT', `/api/plans/${id}/hazards/${glass.id}/decisions`, { answers: tree, oprp: { criteria } });
    expect(r.body.decision).toMatchObject({ tree: 'NOT_CCP', oprp: 'CCP_CANDIDATE', result: 'pending' });
    const qa = await t.login('admin');
    const denied = await call(qa, 'PUT', `/api/plans/${id}/hazards/${glass.id}/decisions`, { answers: tree, oprp: { criteria, overrideCandidate: true, justification: 'x' } });
    expect(denied.status).toBe(403);
    r = await call(lead, 'PUT', `/api/plans/${id}/hazards/${glass.id}/decisions`, { answers: tree, oprp: { criteria, overrideCandidate: true, justification: 'Предел не измерим в потоке' } });
    expect(r.body.decision.result).toBe('PRP');
    const noJust = await call(lead, 'PUT', `/api/plans/${id}/hazards/${glass.id}/decisions`, { answers: [{ node: 'Q1', answer: 'yes', justification: '' }] });
    expect(noJust.status).toBe(400);
    expect(noJust.body).toMatchObject({ error: 'tree_invalid', params: { reason: 'justification_required' } });
  });
});

describe('K15 утверждённый план меняется только через пересмотр', () => {
  it('K15 правка утверждённого плана отклоняется с перечнем допустимых переходов; после «На пересмотре» — новая версия-черновик', async () => {
    const lead = await t.login('haccp.lead');
    const plan = (await call(lead, 'GET', '/api/plans')).body as unknown as Json[];
    const demo = plan.find((p) => p.lineage_id === 'PLAN-JAM')!;
    for (const [method, url, payload] of [
      ['PUT', `/api/plans/${demo.id}/team`, { members: [{ name: 'X', role: 'Y' }] }],
      ['PUT', `/api/plans/${demo.id}/verification`, { verification: 'X' }],
      ['PUT', `/api/plans/${demo.id}/steps`, { steps: [{ name: 'X' }, { name: 'Y' }] }],
    ] as const) {
      const r = await call(lead, method, url, payload);
      expect(r.status, url).toBe(409);
      expect(r.body).toMatchObject({ error: 'plan_locked', params: { planStatus: 'approved', available: [{ to: 'under_revision', permission: 'haccp.plan.revise' }] } });
    }
    const direct = await call(lead, 'POST', `/api/fsm/haccp_plan/${demo.id}/transition`, { to: 'draft' });
    expect(direct.status).toBe(409);
    expect(direct.body.params.available.map((x: Json) => x.to)).toEqual(['under_revision']);

    const rev = await call(lead, 'POST', `/api/plans/${demo.id}/revise`, { comment: 'Ежегодный пересмотр' });
    expect(rev.status).toBe(200);
    expect(rev.body.plan).toMatchObject({ version: 2, status: 'draft', lineage_id: 'PLAN-JAM' });
    const old = (await call(lead, 'GET', `/api/plans/${demo.id}`)).body.plan;
    expect(old.status).toBe('under_revision');
    // готовность: план на пересмотре остаётся действующим до утверждения новой версии
    const dash = (await call(lead, 'GET', '/api/dashboard')).body;
    expect(dash.readiness.clauses[0].covered).toBe(true);
    const v2 = rev.body.plan.id;
    expect((await call(lead, 'PUT', `/api/plans/${v2}/verification`, { verification: 'Обновлено' })).status).toBe(200);
    await call(lead, 'POST', `/api/fsm/haccp_plan/${v2}/transition`, { to: 'under_approval' });
    const appr = await call(lead, 'POST', `/api/fsm/haccp_plan/${v2}/transition`, { to: 'approved' });
    expect(appr.status, JSON.stringify(appr.body)).toBe(200);
    const archived = (await call(lead, 'GET', `/api/plans/${demo.id}`)).body.plan;
    expect(archived).toMatchObject({ status: 'archived' });
    expect(archived.effective_to).toBeTruthy();
  });
});

describe('K16 ККТ из A01 — та же сущность в реестре A03', () => {
  it('K16 ККТ, созданная на экране 6, есть в реестре A03 с тем же id; изменение предела в черновике видно в реестре', async () => {
    const lead = await t.login('haccp.lead');
    const { id, controlPointId } = await passWizard(lead);
    const registry = (await call(lead, 'GET', '/api/control-points')).body as unknown as Json[];
    const cp = registry.find((c) => c.id === controlPointId)!;
    expect(cp).toBeTruthy();
    expect(cp.parameters[0]).toMatchObject({ limit_min: 85 });
    const plan = (await call(lead, 'GET', `/api/plans/${id}`)).body;
    const p = plan.controlPoints[0];
    const upd = await call(lead, 'PUT', `/api/plans/${id}/control-points`, {
      id: p.id, code: p.code, hazardId: p.hazard_id, name: 'Горячий розлив', responsibleRole: 'operator', correctiveAction: 'Карантин партии',
      parameters: [{ id: p.parameters[0].id, code: 'T', name: 'Температура', kind: 'numeric', limitMin: '86.5', unit: '°C', method: 'Термометр', frequency: 'Каждые 30 мин' }],
    });
    expect(upd.status).toBe(200);
    const after = ((await call(lead, 'GET', '/api/control-points')).body as unknown as Json[]).find((c) => c.id === controlPointId)!;
    expect(after.parameters[0]).toMatchObject({ id: p.parameters[0].id, limit_min: 86.5 });
    // оператор не может изменить предел ни через реестр, ни через экран 6
    const op = await t.login('operator');
    expect((await call(op, 'PATCH', `/api/control-parameters/${p.parameters[0].id}`, { limitMin: 80 })).body.params.permission).toBe('ccp.limit.update');
  });

  it('K16 при пересмотре ККТ демо-плана остаются теми же сущностями', async () => {
    const lead = await t.login('haccp.lead');
    const before = ((await call(lead, 'GET', '/api/control-points')).body as unknown as Json[]).filter((c) => c.plan_lineage_id === 'PLAN-JAM').map((c) => c.id).sort();
    const plans = (await call(lead, 'GET', '/api/plans')).body as unknown as Json[];
    const current = plans.find((p) => p.lineage_id === 'PLAN-JAM' && p.status === 'approved')!;
    const rev = await call(lead, 'POST', `/api/plans/${current.id}/revise`, { comment: 'Проверка К16' });
    expect(rev.body.controlPoints.map((c: Json) => c.id).sort()).toEqual(before);
    const hazards = new Set(rev.body.hazards.map((h: Json) => h.id));
    for (const cp of rev.body.controlPoints) expect(hazards.has(cp.hazard_id)).toBe(true);
  });
});
