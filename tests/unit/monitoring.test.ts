import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { clock } from '../../server/core/clock';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); clock.set(null); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = (sql: string, ...a: unknown[]) => t.db().prepare(sql).get(...a) as Json;
const param = (cp: string, code: string) => q(`SELECT pr.* FROM control_parameter pr JOIN control_point c ON c.id = pr.control_point_id WHERE c.code = ? AND pr.code = ?`, cp, code);
const batch = (code: string) => q('SELECT * FROM fg_batch WHERE code = ?', code);
const post = async (cookie: string, url: string, payload: unknown) => {
  const r = await t.app.inject({ method: 'POST', url, headers: { cookie }, payload: payload as Json });
  return { status: r.statusCode, body: r.json() as Json };
};

describe('K11 выход за критический предел', () => {
  it('K11 значение вне предела: НС связано с записью и партией, партия в карантине, уведомление и журнал — в одной транзакции', async () => {
    const op = await t.login('operator');
    const b = batch('B-APR-04');
    expect(b.status).toBe('released');
    const r = await post(op, '/api/monitoring', { parameterId: param('CCP-1', 'T').id, fgBatchId: b.id, value: '83,1' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ inLimits: false, nc: { ncCode: 'NC-004' } });
    const rec = q('SELECT * FROM monitoring_record WHERE id = ?', r.body.id);
    const nc = q('SELECT * FROM nonconformity WHERE id = ?', rec.nc_id);
    expect(nc).toMatchObject({ code: 'NC-004', source_type: 'monitoring', source_id: rec.id, fg_batch_id: b.id, status: 'registered', severity: 'major' });
    expect(batch('B-APR-04').status).toBe('quarantine');
    expect(q("SELECT count(*) AS n FROM notification WHERE ref_id = ? AND type = 'ccp_deviation'", nc.id).n).toBe(2);
    const actions = t.db().prepare('SELECT action, object_type FROM audit_log WHERE object_id IN (?, ?, ?) ORDER BY seq').all(rec.id, nc.id, b.id);
    expect(actions).toEqual([
      { action: 'create', object_type: 'nonconformity' }, { action: 'transition', object_type: 'fg_batch' }, { action: 'create', object_type: 'monitoring_record' },
    ]);
    // НС видно в реестре D04 с источником
    const list = (await t.app.inject({ url: '/api/nonconformities', headers: { cookie: await t.login('qa.lab') } })).json() as Json[];
    expect(list.find((n) => n.code === 'NC-004')).toMatchObject({ source_type: 'monitoring', source_id: rec.id, batch_code: 'B-APR-04' });
  });

  it('K11 «да/нет»: эталон не сработал → НС; значение в пределах → без НС', async () => {
    const op = await t.login('operator');
    const ok = await post(op, '/api/monitoring', { parameterId: param('CCP-2', 'FE').id, fgBatchId: batch('B-CHR-04').id, pass: true });
    expect(ok.body).toMatchObject({ inLimits: true, nc: null });
    const fail = await post(op, '/api/monitoring', { parameterId: param('CCP-2', 'SS').id, fgBatchId: batch('B-CHR-04').id, pass: false });
    expect(fail.body.inLimits).toBe(false);
    expect(batch('B-CHR-04').status).toBe('quarantine');
  });

  it('K11 сбой внутри транзакции откатывает всё: ни записи, ни НС, ни карантина', async () => {
    const op = await t.login('operator');
    const b = batch('B-STR-03');
    const before = q('SELECT (SELECT count(*) FROM monitoring_record) AS m, (SELECT count(*) FROM nonconformity) AS n, (SELECT count(*) FROM audit_log) AS a');
    t.db().exec("CREATE TRIGGER fail_notification BEFORE INSERT ON notification BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const r = await post(op, '/api/monitoring', { parameterId: param('CCP-1', 'T').id, fgBatchId: b.id, value: 80 });
    t.db().exec('DROP TRIGGER fail_notification');
    expect(r.status).toBe(500);
    expect(q('SELECT (SELECT count(*) FROM monitoring_record) AS m, (SELECT count(*) FROM nonconformity) AS n, (SELECT count(*) FROM audit_log) AS a')).toEqual(before);
    expect(batch('B-STR-03').status).toBe('released');
  });
});

describe('K12 оборудование с истёкшей поверкой', () => {
  it('K12 запись с P-01 отклоняется; сообщение содержит дату окончания поверки', async () => {
    const op = await t.login('operator');
    const p01 = q("SELECT * FROM equipment WHERE code = 'P-01'");
    const r = await post(op, '/api/monitoring', { parameterId: param('OPRP-1', 'PH').id, fgBatchId: batch('B-CHR-04').id, value: '3,4', equipmentId: p01.id });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: 'equipment_calibration_expired', params: { equipment: 'P-01', nextCalDate: p01.next_cal_date } });
    expect(r.body.message).toContain(p01.next_cal_date);
    // по умолчанию оборудование берётся из параметра — тоже P-01
    const r2 = await post(op, '/api/monitoring', { parameterId: param('OPRP-1', 'PH').id, fgBatchId: batch('B-CHR-04').id, value: 3.4 });
    expect(r2.status).toBe(422);
  });

  it('K12 поверка действительна по дату окончания включительно (Р-19)', async () => {
    const r01 = q("SELECT * FROM equipment WHERE code = 'R-01'");
    const brix = { parameterId: param('OPRP-1', 'BRIX').id, fgBatchId: batch('B-APR-04').id, value: 62 };
    try {
      clock.set(`${r01.next_cal_date}T10:00:00+04:00`); // последний день действия поверки
      const sameDay = await post(await t.login('operator'), '/api/monitoring', brix);
      expect(sameDay.status, JSON.stringify(sameDay.body)).toBe(200);
      clock.set(new Date(Date.parse(`${r01.next_cal_date}T10:00:00+04:00`) + 86_400_000).toISOString()); // следующий день
      const after = await post(await t.login('operator'), '/api/monitoring', brix);
      expect(after.body).toMatchObject({ error: 'equipment_calibration_expired', params: { nextCalDate: r01.next_cal_date } });
    } finally {
      clock.set(null);
    }
  });
});

describe('K17 ввод чисел с запятой и точкой', () => {
  it('K17 «85,5» и «85.5» сохраняются одинаково (как значение мониторинга и как запись среды)', async () => {
    const op = await t.login('operator');
    const a = await post(op, '/api/monitoring', { parameterId: param('CCP-1', 'T').id, fgBatchId: batch('B-CHR-03').id, value: '85,5' });
    const b = await post(op, '/api/monitoring', { parameterId: param('CCP-1', 'T').id, fgBatchId: batch('B-CHR-03').id, value: '85.5' });
    const v = (id: string) => q('SELECT value_num FROM monitoring_record WHERE id = ?', id).value_num;
    expect(v(a.body.id)).toBe(85.5);
    expect(v(b.body.id)).toBe(85.5);
    const pt = q("SELECT id FROM env_point WHERE code = 'ENV-02'");
    const e1 = await post(op, '/api/env-records', { pointId: pt.id, value: '18,25' });
    const e2 = await post(op, '/api/env-records', { pointId: pt.id, value: '18.25' });
    const ev = (id: string) => q('SELECT value FROM env_record WHERE id = ?', id).value;
    expect([ev(e1.body.id), ev(e2.body.id)]).toEqual([18.25, 18.25]);
    const bad = await post(op, '/api/monitoring', { parameterId: param('CCP-1', 'T').id, fgBatchId: batch('B-CHR-03').id, value: '85,5,1' });
    expect(bad.body.error).toBe('invalid_number');
  });
});

describe('Время события и A10', () => {
  it('время события: не ранее 24 ч назад и не в будущем; оба времени хранятся', async () => {
    const op = await t.login('operator');
    const p = param('CCP-1', 'T').id; const b = batch('B-CHR-03').id;
    const old = await post(op, '/api/monitoring', { parameterId: p, fgBatchId: b, value: 86, eventAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
    expect(old.body).toMatchObject({ error: 'event_time_out_of_window', params: { hours: 24 } });
    const future = await post(op, '/api/monitoring', { parameterId: p, fgBatchId: b, value: 86, eventAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    expect(future.body.error).toBe('event_time_out_of_window');
    const at = new Date(Date.now() - 3 * 3600_000).toISOString();
    const ok = await post(op, '/api/monitoring', { parameterId: p, fgBatchId: b, value: 86, eventAt: at });
    const rec = q('SELECT event_at, recorded_at FROM monitoring_record WHERE id = ?', ok.body.id);
    expect(rec.event_at).toBe(at);
    expect(Date.parse(rec.recorded_at) - Date.parse(at)).toBeGreaterThan(2.9 * 3600_000);
  });

  it('A10: отклонение среды — уведомление без НС; НС регистрируется вручную (Р-12); склад записывает, аудитор — нет', async () => {
    const wh = await t.login('warehouse');
    const pt = q("SELECT id FROM env_point WHERE code = 'ENV-01'");
    const r = await post(wh, '/api/env-records', { pointId: pt.id, value: '7,5' });
    expect(r.body).toEqual({ id: r.body.id, inLimits: false });
    expect(q("SELECT count(*) AS n FROM nonconformity WHERE source_type = 'environment'").n).toBe(0);
    expect(q("SELECT count(*) AS n FROM notification WHERE ref_id = ? AND type = 'env_deviation'", r.body.id).n).toBe(2);
    const qa = await t.login('qa.lab');
    const nc = await post(qa, `/api/env-records/${r.body.id}/nonconformity`, {});
    expect(nc.status, JSON.stringify(nc.body)).toBe(200);
    expect(q('SELECT source_type, fg_batch_id FROM nonconformity WHERE id = ?', nc.body.ncId)).toEqual({ source_type: 'environment', fg_batch_id: null });
    expect((await post(qa, `/api/env-records/${r.body.id}/nonconformity`, {})).body.error).toBe('nc_exists');
    expect((await post(await t.login('auditor'), '/api/env-records', { pointId: pt.id, value: 3 })).status).toBe(403);
  });
});
