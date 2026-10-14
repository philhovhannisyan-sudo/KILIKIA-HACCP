import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { countEntities } from '../../server/queries/stats';
import { dashboard } from '../../server/queries/dashboard';
import { clock } from '../../server/core/clock';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

describe('K5 демо-данные и панель готовности', () => {
  it('K5 чистый запуск содержит объёмы из brief §12', () => {
    const c = countEntities(t.db());
    expect(c.site).toBe(1);
    expect(c.product).toBe(3);
    expect(c.material_lot).toBeGreaterThanOrEqual(8);
    expect(c.fg_batch).toBeGreaterThanOrEqual(12);
    expect(c.ccp).toBe(2);
    expect(c.oprp).toBe(1);
    expect(c.monitoring_record).toBeGreaterThanOrEqual(6);
    expect(c.monitoring_out_of_limits).toBe(1);
    expect(c.nonconformity).toBe(3);
    expect(c.capa).toBe(2);
    expect(c.supplier).toBe(4);
    expect(c.customer).toBe(5);
    expect(c.shipment).toBeGreaterThanOrEqual(8);
    expect(c.warehouse).toBe(2);
    expect(c.fg_quarantine).toBe(1);
    expect(c.lab_sample).toBe(3);
    expect(c.env_point).toBe(4);
    expect(c.env_days).toBe(14);
    expect(c.user).toBe(9);
    const d = t.db();
    const materials = d.prepare('SELECT m.code FROM material_lot l JOIN material m ON m.id = l.material_id').pluck().all();
    for (const m of ['RM-APR', 'RM-CHR', 'RM-STR', 'RM-SUG', 'RM-PEC', 'RM-CIT', 'PK-JAR', 'PK-LID']) expect(materials).toContain(m);
    expect(d.prepare("SELECT next_cal_date < ? FROM equipment WHERE code = 'P-01'").pluck().get(clock.today())).toBe(1);
    // одна запись вне предела → несоответствие, связанное с записью и партией на карантине
    const nc = d.prepare(`SELECT n.code, b.status FROM monitoring_record r JOIN nonconformity n ON n.id = r.nc_id
      JOIN fg_batch b ON b.id = n.fg_batch_id WHERE r.in_limits = 0 AND n.source_id = r.id`).get();
    expect(nc).toEqual({ code: 'NC-001', status: 'quarantine' });
  });

  it('K5 цифры панели готовности совпадают с данными (API = общие запросы = прямой подсчёт)', async () => {
    const cookie = await t.login('tech.director');
    const api = (await t.app.inject({ url: '/api/dashboard', headers: { cookie } })).json();
    expect(api).toEqual(JSON.parse(JSON.stringify(dashboard(t.db(), clock.today()))));
    const d = t.db();
    const today = clock.today();
    expect(api.openCapa.count).toBe(d.prepare("SELECT count(*) FROM capa WHERE status NOT IN ('verified','closed')").pluck().get());
    expect(api.openCapa.overdue).toBe(1);
    expect(api.overdueCalibration.items.map((e: { code: string }) => e.code)).toEqual(['P-01']);
    expect(api.quarantine.count).toBe(d.prepare("SELECT count(*) FROM fg_batch WHERE status='quarantine'").pluck().get());
    expect(api.readiness).toMatchObject({ covered: 9, total: 11, percent: 82 });
    const uncovered = api.readiness.clauses.filter((c: { covered: boolean }) => !c.covered).map((c: { number: string }) => c.number);
    expect(uncovered).toEqual(['8.7', '10.1']);
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
