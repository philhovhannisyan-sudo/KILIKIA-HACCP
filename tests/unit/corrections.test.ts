import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const recordOf = (batch: string, cp = 'CCP-1') => t.db().prepare(`SELECT r.* FROM monitoring_record r JOIN fg_batch b ON b.id = r.fg_batch_id
  JOIN control_point c ON c.id = r.control_point_id WHERE b.code = ? AND c.code = ?`).get(batch, cp) as Record<string, unknown>;

describe('K10 исправление записи мониторинга', () => {
  it('K10 создаёт запись-корректировку с причиной; исходная запись видна и не изменена', async () => {
    const qa = await t.login('qa.lab');
    const original = recordOf('B-APR-04');
    const r = await t.app.inject({ method: 'POST', url: `/api/monitoring/${original.id}/corrections`, headers: { cookie: qa }, payload: { value: '87,6', reason: 'Ошибка переноса из бумажного журнала' } });
    expect(r.statusCode, r.body).toBe(200);
    const body = r.json();
    expect(body.value_num).toBe(original.value_num);
    expect(body.corrections).toHaveLength(1);
    expect(body.corrections[0]).toMatchObject({ value_num: 87.6, reason: 'Ошибка переноса из бумажного журнала', author_name_snapshot: 'Лилит Аветисян', in_limits: 1 });
    expect(body.effective.value_num).toBe(87.6);
    expect(recordOf('B-APR-04')).toEqual(original);
    expect(() => t.db().prepare('UPDATE monitoring_record SET value_num = 1 WHERE id = ?').run(original.id)).toThrow(/immutable/);
    expect(() => t.db().prepare('DELETE FROM monitoring_correction').run()).toThrow(/immutable/);
    const audit = t.db().prepare("SELECT comment FROM audit_log WHERE object_id = ? AND action = 'correct'").pluck().get(original.id);
    expect(audit).toBe('Ошибка переноса из бумажного журнала');
  });

  it('K10 без причины — отказ; оператор не может исправить чужую или старую запись', async () => {
    const qa = await t.login('qa.lab');
    const rec = recordOf('B-CHR-04');
    const noReason = await t.app.inject({ method: 'POST', url: `/api/monitoring/${rec.id}/corrections`, headers: { cookie: qa }, payload: { value: 86 } });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().error).toBe('reason_required');
    const op = await t.login('operator');
    const old = await t.app.inject({ method: 'POST', url: `/api/monitoring/${rec.id}/corrections`, headers: { cookie: op }, payload: { value: 86, reason: 'x' } });
    expect(old.statusCode).toBe(403);
    expect(old.json().error).toBe('correction_window_expired');
  });

  it('K10 корректировка «за предел» создаёт несоответствие и переводит партию в карантин (Р-11)', async () => {
    const qa = await t.login('qa.lab');
    const rec = recordOf('B-CHR-04');
    const r = await t.app.inject({ method: 'POST', url: `/api/monitoring/${rec.id}/corrections`, headers: { cookie: qa }, payload: { value: '84.0', reason: 'Перепроверка по самописцу' } });
    expect(r.statusCode, r.body).toBe(200);
    const corr = r.json().corrections[0];
    expect(corr.in_limits).toBe(0);
    const nc = t.db().prepare('SELECT n.*, b.status AS batch_status FROM nonconformity n JOIN fg_batch b ON b.id = n.fg_batch_id WHERE n.id = ?').get(corr.nc_id) as Record<string, unknown>;
    expect(nc).toMatchObject({ source_type: 'monitoring', source_id: rec.id, batch_status: 'quarantine', status: 'registered' });
  });
});
