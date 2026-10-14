import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { verifyChain } from '../../server/core/audit';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('K8 журнал аудита', () => {
  it('K8 изменение и удаление записи журнала отклоняются (API и база данных)', async () => {
    const cookie = await t.login('admin');
    const id = t.db().prepare('SELECT id FROM audit_log LIMIT 1').pluck().get();
    for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
      const r = await t.app.inject({ method, url: `/api/audit/${id}`, headers: { cookie }, payload: { action: 'x' } });
      expect(r.statusCode).toBe(405);
      expect(r.json().error).toBe('audit_immutable');
    }
    expect(() => t.db().prepare("UPDATE audit_log SET action = 'x'").run()).toThrow(/immutable:audit_log/);
    expect(() => t.db().prepare('DELETE FROM audit_log').run()).toThrow(/immutable:audit_log/);
  });

  it('K8 запись хранит имя и роли на момент внесения; смена ролей её не меняет; цепочка проверяется', async () => {
    const admin = await t.login('admin');
    const qaTech = await t.login('qa.tech');
    const nc = t.db().prepare("SELECT id FROM nonconformity WHERE code='NC-001'").pluck().get() as string;
    t.db().prepare("UPDATE nonconformity SET root_cause = 'Сбой подогрева' WHERE id = ?").run(nc);
    const r = await t.app.inject({ method: 'POST', url: `/api/fsm/nonconformity/${nc}/transition`, headers: { cookie: qaTech }, payload: { to: 'root_cause_identified' } });
    expect(r.statusCode, r.body).toBe(200);
    const entry = t.db().prepare("SELECT * FROM audit_log WHERE object_id = ? AND action = 'transition' ORDER BY seq DESC LIMIT 1").get(nc) as Record<string, string>;
    expect(entry.user_name_snapshot).toBe('Нарек Григорян');
    expect(JSON.parse(entry.roles_snapshot)).toEqual(['qa_lab', 'technologist']);
    expect(JSON.parse(entry.before)).toEqual({ status: 'in_analysis' });
    expect(JSON.parse(entry.after)).toEqual({ status: 'root_cause_identified' });

    const change = await t.app.inject({ method: 'PUT', url: '/api/users/U-qa.tech/roles', headers: { cookie: admin }, payload: { roles: ['operator'] } });
    expect(change.statusCode).toBe(200);
    const after = t.db().prepare('SELECT * FROM audit_log WHERE id = ?').get(entry.id);
    expect(after).toEqual(entry);
    const audit = (await t.app.inject({ url: '/api/audit/verify', headers: { cookie: admin } })).json();
    expect(audit).toMatchObject({ ok: true });
    expect(audit.count).toBeGreaterThanOrEqual(3);
  });

  it('K8 проверка хэш-цепочки обнаруживает подмену записи', () => {
    const d = t.db();
    expect(verifyChain(d).ok).toBe(true);
    d.exec('DROP TRIGGER audit_log_no_update');
    const seq = d.prepare('SELECT seq FROM audit_log ORDER BY seq LIMIT 1 OFFSET 1').pluck().get() as number;
    d.prepare("UPDATE audit_log SET comment = 'подделка' WHERE seq = ?").run(seq);
    expect(verifyChain(d)).toMatchObject({ ok: false, brokenAtSeq: seq, reason: 'hash' });
  });
});
