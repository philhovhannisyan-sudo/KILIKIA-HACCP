import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { pdfText, squash } from './pdftext';
import { MODULES } from '../../shared/modules';
import { SCAFFOLDS } from '../../server/modules/scaffold/config';
import ru from '../../shared/i18n/ru.json';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const D = ru as Record<string, string>;
const CODES = MODULES.filter((m) => m.scope === 'scaffold').map((m) => m.code);

describe('K25 каркасы 19 модулей', () => {
  it('K25 у каждого каркаса: панель на реальных данных, таблица ≥1 строки, поля формы, описание будущего наполнения', async () => {
    expect(CODES).toHaveLength(19);
    expect(Object.keys(SCAFFOLDS).sort()).toEqual([...CODES].sort());
    const c = await t.login('admin');
    for (const code of CODES) {
      const r = await t.app.inject({ url: `/api/scaffold/${code}`, headers: { cookie: c } });
      expect(r.statusCode, code).toBe(200);
      const d = r.json() as Json;
      expect(d.kpis.length, code).toBeGreaterThan(0);
      d.kpis.forEach((v: unknown, i: number) => { expect(typeof v, `${code} kpi ${i}`).toBe('number'); expect(D[`sc.kpi.${code}.${i}`], `${code} kpi ${i}`).toBeTruthy(); });
      expect(d.rows.length, code).toBeGreaterThan(0);
      expect(d.fields.length > 0 || !!d.form, `${code}: форма`).toBe(true);
      expect(D[`sc.future.${code}`], code).toBeTruthy();
      for (const col of d.cols) {
        expect(D[`sc.col.${col.key}`], `${code}.${col.key}`).toBeTruthy();
        if (col.kind === 'status') for (const row of d.rows) expect(D[`${col.status}.${row[col.key]}`], `${code} ${col.status}.${row[col.key]}`).toBeTruthy();
      }
    }
  });

  it('K25 цифры панели считаются по тем же данным, что и таблица', async () => {
    const c = await t.login('admin');
    const b03 = (await t.app.inject({ url: '/api/scaffold/B03', headers: { cookie: c } })).json() as Json;
    expect(b03.kpis[0]).toBe(b03.rows.length);
    const d06 = (await t.app.inject({ url: '/api/scaffold/D06', headers: { cookie: c } })).json() as Json;
    expect(d06.kpis[1]).toBe(d06.rows.filter((r: Json) => r.status !== 'closed').length);
  });

  it('K25 печатная заготовка каждого каркаса открывается как PDF с пометкой «в разработке»', async () => {
    const c = await t.login('admin');
    for (const code of CODES) {
      const r = await t.app.inject({ url: `/api/scaffold/${code}/export.pdf?lang=ru`, headers: { cookie: c } });
      expect(r.statusCode, code).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
      const text = squash(await pdfText(r.rawPayload));
      expect(text, code).toContain(squash(D['sc.printDraft']));
      expect(text.toLowerCase(), code).toContain('разработ');
    }
  });

  it('K25 доступ к каркасу проверяется на сервере: без входа — 401, неизвестный модуль — 403', async () => {
    expect((await t.app.inject({ url: '/api/scaffold/E02' })).statusCode).toBe(401);
    expect((await t.app.inject({ url: '/api/scaffold/E02/export.pdf' })).statusCode).toBe(401);
    const c = await t.login('operator');
    expect((await t.app.inject({ url: '/api/scaffold/Z99', headers: { cookie: c } })).statusCode).toBe(403);
  });

  it('K25 B03: партия регистрируется с расходом сырья, остаток списывается, связь видна в прослеживаемости', async () => {
    const c = await t.login('qa.tech');
    const product = (t.db().prepare("SELECT id FROM product ORDER BY code").get() as Json).id;
    const lot = t.db().prepare(`SELECT l.id, l.code, (SELECT sum(qty) FROM stock s WHERE s.lot_kind='material' AND s.lot_id=l.id) AS stock FROM material_lot l WHERE l.status='released' AND
      (SELECT sum(qty) FROM stock s WHERE s.lot_kind='material' AND s.lot_id=l.id) > 10 ORDER BY l.code`).get() as Json;
    const r = await t.app.inject({ method: 'POST', url: '/api/batches', headers: { cookie: c }, payload: { productId: product, shift: 'A', qty: '120,5', lines: [{ materialLotId: lot.id, qty: '2,5' }] } });
    expect(r.statusCode, r.body).toBe(200);
    const b = r.json() as Json;
    const row = t.db().prepare('SELECT status, qty FROM fg_batch WHERE id = ?').get(b.id) as Json;
    expect(row).toEqual({ status: 'quarantine', qty: 120.5 });
    const after = t.db().prepare("SELECT sum(qty) FROM stock WHERE lot_kind='material' AND lot_id = ?").pluck().get(lot.id) as number;
    expect(after).toBeCloseTo(lot.stock - 2.5);
    expect(t.db().prepare('SELECT count(*) FROM batch_consumption WHERE fg_batch_id = ? AND material_lot_id = ?').pluck().get(b.id, lot.id)).toBe(1);
    expect(t.db().prepare("SELECT count(*) FROM audit_log WHERE module='B03' AND object_id = ?").pluck().get(b.id)).toBe(1);
    // Превышение остатка и повтор партии сырья отклоняются
    const over = await t.app.inject({ method: 'POST', url: '/api/batches', headers: { cookie: c }, payload: { productId: product, shift: 'B', qty: 1, lines: [{ materialLotId: lot.id, qty: 1e9 }] } });
    expect([over.statusCode, over.json().error]).toEqual([422, 'insufficient_stock']);
    const dup = await t.app.inject({ method: 'POST', url: '/api/batches', headers: { cookie: c }, payload: { productId: product, shift: 'B', qty: 1, lines: [{ materialLotId: lot.id, qty: 1 }, { materialLotId: lot.id, qty: 1 }] } });
    expect([dup.statusCode, dup.json().error]).toEqual([400, 'duplicate_lot']);
    const op = await t.login('operator');
    const denied = await t.app.inject({ method: 'POST', url: '/api/batches', headers: { cookie: op }, payload: { productId: product, shift: 'A', qty: 1, lines: [{ materialLotId: lot.id, qty: 1 }] } });
    expect(denied.statusCode).toBe(403);
  });

  it('K25 D03: запись поверки продлевает срок, будущая дата отклоняется', async () => {
    const c = await t.login('qa.tech');
    const eq = t.db().prepare('SELECT id FROM equipment ORDER BY next_cal_date').get() as Json;
    const today = (await t.app.inject({ url: '/api/meta' })).json().today as string;
    const r = await t.app.inject({ method: 'POST', url: `/api/equipment/${eq.id}/calibrations`, headers: { cookie: c }, payload: { date: today, certificate: 'CERT-TEST-1' } });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().next_cal_date > today).toBe(true);
    expect(r.json().status).toBe('in_service');
    const bad = await t.app.inject({ method: 'POST', url: `/api/equipment/${eq.id}/calibrations`, headers: { cookie: c }, payload: { date: '2999-01-01', certificate: 'X' } });
    expect([bad.statusCode, bad.json().error]).toEqual([400, 'date_in_future']);
  });
});
