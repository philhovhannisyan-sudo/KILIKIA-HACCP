import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { MACHINES } from '../../shared/fsm';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('Конечные автоматы в данных (brief §9)', () => {
  it('5 автоматов перенесены в таблицы переходов полностью', () => {
    for (const [machine, def] of Object.entries(MACHINES)) {
      const n = t.db().prepare('SELECT count(*) FROM fsm_transition WHERE machine = ?').pluck().get(machine);
      expect(n, machine).toBe(def.transitions.length);
    }
  });

  it('недопустимый переход отклоняется с перечнем доступных', async () => {
    const qa = await t.login('qa.lab');
    const nc = t.db().prepare("SELECT id FROM nonconformity WHERE code='NC-001'").pluck().get();
    const r = await t.app.inject({ method: 'POST', url: `/api/fsm/nonconformity/${nc}/transition`, headers: { cookie: qa }, payload: { to: 'closed' } });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ error: 'invalid_transition', params: { from: 'in_analysis', available: [{ to: 'root_cause_identified' }] } });
  });

  it('guard: партию ГП без расхода сырья нельзя выпустить; переход с комментарием обязателен', async () => {
    const qa = await t.login('qa.lab');
    const d = t.db();
    const b = d.prepare("SELECT id FROM fg_batch WHERE code='B-APR-04'").pluck().get();
    const noComment = await t.app.inject({ method: 'POST', url: `/api/fsm/fg_batch/${b}/transition`, headers: { cookie: qa }, payload: { to: 'blocked' } });
    expect(noComment.json().error).toBe('comment_required');
    d.prepare("UPDATE fg_batch SET status = 'checks_done' WHERE id = ?").run(b);
    d.pragma('foreign_keys = OFF');
    d.prepare('DELETE FROM batch_consumption WHERE fg_batch_id = ?').run(b);
    const r = await t.app.inject({ method: 'POST', url: `/api/fsm/fg_batch/${b}/transition`, headers: { cookie: qa }, payload: { to: 'released' } });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ error: 'guard_failed', params: { guard: 'batchHasConsumption' } });
  });

  it('у кого нет права на переход — 403 с названием права', async () => {
    const op = await t.login('operator');
    const nc = t.db().prepare("SELECT id FROM nonconformity WHERE code='NC-002'").pluck().get();
    const r = await t.app.inject({ method: 'POST', url: `/api/fsm/nonconformity/${nc}/transition`, headers: { cookie: op }, payload: { to: 'capa_done' } });
    expect(r.statusCode).toBe(403);
    expect(r.json().params.permission).toBe('nc.record.transition');
  });
});
