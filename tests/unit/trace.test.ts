import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { clock } from '../../server/core/clock';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { clock.set(null); await t.close(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = (sql: string, ...a: unknown[]) => t.db().prepare(sql).get(...a) as Json;
const all = (sql: string, ...a: unknown[]) => t.db().prepare(sql).pluck().all(...a) as string[];
const call = async (cookie: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
  const r = await t.app.inject({ method, url, headers: { cookie }, payload: payload as Json });
  return { status: r.statusCode, body: r.json() as Json };
};
const batchId = (code: string) => q('SELECT id FROM fg_batch WHERE code = ?', code).id as string;

describe('K18 дерево прослеживаемости', () => {
  it('K18 назад — все партии сырья/упаковки и поставщики, вперёд — все отгрузки и клиенты (сверка с прямым запросом)', async () => {
    const c = await t.login('qa.lab');
    const id = batchId('B-APR-01');
    const r = (await call(c, 'GET', `/api/trace/batches/${id}`)).body;
    const lots = all('SELECT l.code FROM batch_consumption bc JOIN material_lot l ON l.id = bc.material_lot_id WHERE bc.fg_batch_id = ? ORDER BY l.code', id);
    expect(r.backward.map((x: Json) => x.lot_code).sort()).toEqual(lots);
    expect(lots).toEqual(['RL-APR-01', 'RL-CIT-01', 'RL-JAR-01', 'RL-LID-01', 'RL-PEC-01', 'RL-SUG-01']);
    expect(r.suppliers.map((s: Json) => s.code).sort()).toEqual(['SUP-01', 'SUP-02', 'SUP-03', 'SUP-04']);
    const shipments = all('SELECT DISTINCT sh.number FROM shipment_line sl JOIN shipment sh ON sh.id = sl.shipment_id WHERE sl.fg_batch_id = ? ORDER BY sh.number', id);
    expect([...new Set(r.forward.map((x: Json) => x.number))]).toEqual(shipments);
    expect(shipments).toEqual(['SH-001', 'SH-002', 'SH-004']);
    expect(r.customers.map((x: Json) => x.code).sort()).toEqual(['CUS-01', 'CUS-02', 'CUS-04']);
    expect(r.shippedQty + r.stock).toBe(r.batch.qty);
  });

  it('K18 склад не видит прослеживаемость без права; партия без отгрузок — пустое «вперёд»', async () => {
    const qa = await t.login('qa.lab');
    const r = (await call(qa, 'GET', `/api/trace/batches/${batchId('B-STR-04')}`)).body;
    expect(r.forward).toEqual([]);
    expect(r.backward.length).toBe(6);
  });
});

describe('K19 тестовый отзыв и тест прослеживаемости', () => {
  it('K19 отзыв в пределах целевого времени: длительность, число отгрузок, % возврата; без несоответствия', async () => {
    const c = await t.login('qa.lab');
    let r = await call(c, 'POST', '/api/trace/exercises', { type: 'recall', fgBatchId: batchId('B-APR-01') });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ type: 'recall', target_min_snapshot: 240, shipments: 3, shippedQty: 1800, returnedQty: 0 });
    const id = r.body.id;
    const [i1, i2] = r.body.items;
    await call(c, 'PUT', `/api/trace/exercises/${id}/items/${i1.id}`, { returned: true });
    r = await call(c, 'PUT', `/api/trace/exercises/${id}/items/${i2.id}`, { returned: true, returnedQty: '200' });
    expect(r.body.returnedQty).toBe(i1.qty + 200);
    clock.set(new Date(Date.now() + 95 * 60_000).toISOString());
    r = await call(c, 'POST', `/api/trace/exercises/${id}/finish`, {});
    clock.set(null);
    expect(r.body).toMatchObject({ compliant: 1, nc_id: null, shipments: 3 });
    expect(r.body.duration_min).toBeGreaterThanOrEqual(94.9);
    expect(r.body.returnedPercent).toBe(Math.round(((i1.qty + 200) / 1800) * 1000) / 10);
    expect((await call(c, 'POST', `/api/trace/exercises/${id}/finish`, {})).body.error).toBe('exercise_finished');
  });

  it('K19 превышение целевого времени: отчёт помечен как несоответствие и создаёт запись в D04', async () => {
    const c = await t.login('haccp.lead');
    const start = await call(c, 'POST', '/api/trace/exercises', { type: 'trace', fgBatchId: batchId('B-CHR-02') });
    try {
      clock.set(new Date(Date.now() + 5 * 3600_000).toISOString());
      const r = await call(await t.login('haccp.lead'), 'POST', `/api/trace/exercises/${start.body.id}/finish`, {});
      expect(r.body).toMatchObject({ compliant: 0 });
      expect(r.body.duration_min).toBeGreaterThan(240);
      expect(r.body.nc_code).toMatch(/^NC-\d{3}$/);
      expect(q('SELECT source_type, source_id, fg_batch_id FROM nonconformity WHERE id = ?', r.body.nc_id))
        .toEqual({ source_type: 'recall', source_id: start.body.id, fg_batch_id: null });
      expect(q("SELECT status FROM fg_batch WHERE code = 'B-CHR-02'").status).toBe('released'); // процедура, а не продукт: без карантина
    } finally {
      clock.set(null);
    }
  });

  it('K19 запустить упражнение может только роль с правом trace.exercise.run', async () => {
    const op = await t.login('operator');
    const r = await call(op, 'POST', '/api/trace/exercises', { type: 'trace', fgBatchId: batchId('B-APR-01') });
    expect(r.status).toBe(403);
    expect(r.body.params.permission).toBe('trace.exercise.run');
  });
});

describe('K20 отгрузка партии на карантине', () => {
  it('K20 отгрузка партии в «Карантине» отклоняется с указанием партии и статуса; остаток не меняется', async () => {
    const c = await t.login('warehouse');
    const cust = q("SELECT id FROM customer WHERE code = 'CUS-01'").id;
    const stock = () => q("SELECT qty FROM stock WHERE lot_id = ?", batchId('B-STR-04')).qty;
    const before = stock();
    const r = await call(c, 'POST', '/api/shipments', { customerId: cust, lines: [{ fgBatchId: batchId('B-STR-04'), qty: 10 }] });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: 'batch_not_shippable', params: { batch: 'B-STR-04', status: 'quarantine' } });
    expect(r.body.message).toContain('B-STR-04');
    expect(stock()).toBe(before);
  });

  it('FEFO: при наличии более старой партии нужна причина; отгрузка уменьшает остаток и попадает в прослеживаемость', async () => {
    const c = await t.login('warehouse');
    const cust = q("SELECT id FROM customer WHERE code = 'CUS-05'").id;
    const newer = await call(c, 'POST', '/api/shipments', { customerId: cust, lines: [{ fgBatchId: batchId('B-APR-04'), qty: 100 }] });
    expect(newer.status).toBe(409);
    expect(newer.body).toMatchObject({ error: 'fefo_violation', params: { batch: 'B-APR-04', olderBatch: 'B-APR-01' } }); // самая старая партия продукта с остатком
    const ok = await call(c, 'POST', '/api/shipments', { customerId: cust, lines: [{ fgBatchId: batchId('B-APR-04'), qty: 100, fefoReason: 'Требование клиента к сроку' }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const tr = (await call(await t.login('qa.lab'), 'GET', `/api/trace/batches/${batchId('B-APR-04')}`)).body;
    expect(tr.forward.map((x: Json) => x.number)).toContain(ok.body.number);
    const big = await call(c, 'POST', '/api/shipments', { customerId: cust, lines: [{ fgBatchId: batchId('B-APR-02'), qty: 999999 }] });
    expect(big.body.error).toBe('insufficient_stock');
  });
});
