import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { isWritePermission } from '../../shared/permissions';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const paramId = () => t.db().prepare(`SELECT pr.id FROM control_parameter pr JOIN control_point cp ON cp.id = pr.control_point_id WHERE cp.code = 'CCP-1'`).pluck().get() as string;

describe('K6 права проверяются на сервере', () => {
  it('K6 operator: прямой API-запрос на изменение предела ККТ отклонён, названо недостающее право', async () => {
    const cookie = await t.login('operator');
    const r = await t.app.inject({ method: 'PATCH', url: `/api/control-parameters/${paramId()}`, headers: { cookie }, payload: { limitMin: 80 } });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: 'forbidden', params: { permission: 'ccp.limit.update' } });
    expect(r.json().message).toContain('ccp.limit.update');
    expect(t.db().prepare('SELECT limit_min FROM control_parameter WHERE id = ?').pluck().get(paramId())).toBe(85);
  });

  it('K6 без входа — 401; haccp.lead при утверждённом плане — 409 с перечнем переходов (Р-10)', async () => {
    const anon = await t.app.inject({ method: 'PATCH', url: `/api/control-parameters/${paramId()}`, payload: { limitMin: 80 } });
    expect(anon.statusCode).toBe(401);
    const cookie = await t.login('haccp.lead');
    const r = await t.app.inject({ method: 'PATCH', url: `/api/control-parameters/${paramId()}`, headers: { cookie }, payload: { limitMin: 80 } });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ error: 'plan_locked', params: { planStatus: 'approved', available: [{ to: 'under_revision' }] } });
  });

  it('каждый маршрут /api объявляет доступ; изменяющие маршруты не доступны без входа', () => {
    expect(t.app.routesInfo.length).toBeGreaterThan(10);
    for (const r of t.app.routesInfo) expect(r.auth, `${r.method} ${r.url}`).toBeTruthy();
    const mutatingPublic = t.app.routesInfo.filter((r) => r.method !== 'GET' && r.method !== 'HEAD' && r.auth === 'public')
      .map((r) => r.url);
    expect(mutatingPublic.sort()).toEqual(['/api/auth/login', '/api/test/clock']);
  });
});

describe('K7 внешний аудитор — только чтение', () => {
  it('K7 у роли auditor нет ни одного права на изменение', async () => {
    const cookie = await t.login('auditor');
    const me = (await t.app.inject({ url: '/api/auth/me', headers: { cookie } })).json();
    expect(me.permissions.filter(isWritePermission)).toEqual([]);
    expect(me.canWrite).toBe(false);
    expect(me.permissions).toContain('audit.pack.generate');
    expect(me.permissions.filter((p: string) => p.endsWith('.module.read'))).toHaveLength(26);
  });

  it('K7 все изменяющие API отклоняют auditor', async () => {
    const cookie = await t.login('auditor');
    const d = t.db();
    const nc = d.prepare("SELECT id FROM nonconformity WHERE code='NC-001'").pluck().get();
    const rec = d.prepare('SELECT id FROM monitoring_record LIMIT 1').pluck().get();
    const calls = [
      ['PATCH', `/api/control-parameters/${paramId()}`, { limitMin: 80 }],
      ['POST', `/api/monitoring/${rec}/corrections`, { value: 90, reason: 'x' }],
      ['POST', `/api/fsm/nonconformity/${nc}/transition`, { to: 'root_cause_identified' }],
      ['POST', '/api/system/reset', {}],
      ['POST', '/api/system/export', {}],
      ['PUT', '/api/users/U-operator/roles', { roles: ['admin'] }],
    ] as const;
    for (const [method, url, payload] of calls) {
      const r = await t.app.inject({ method, url, headers: { cookie }, payload });
      expect([403, 405], `${method} ${url}: ${r.body}`).toContain(r.statusCode);
    }
  });
});
