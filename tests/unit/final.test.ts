import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { pdfText } from './pdftext';
import { clock } from '../../server/core/clock';
import { MODULES } from '../../shared/modules';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

const one = (sql: string) => t.db().prepare(sql).pluck().get() as string;
const to = new Date(Date.parse(`${clock.today()}T00:00:00+04:00`) + 86_400_000).toISOString();
const from = new Date(Date.parse(to) - 90 * 86_400_000).toISOString();
const period = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
const ARMENIAN = /[Ա-Ֆա-և]/g;

describe('K26 финальная приёмка', () => {
  it('K26 все печатные формы на hy содержат армянский текст (извлечение текста из PDF)', async () => {
    const c = await t.login('admin');
    const urls: Record<string, string> = {
      plan: `/api/plans/${one("SELECT id FROM haccp_plan WHERE lineage_id = 'PLAN-JAM' ORDER BY version DESC")}/export.pdf`,
      monitoring: `/api/monitoring/export.pdf?${period}`,
      env: `/api/env-records/export.pdf?${period}`,
      nc: `/api/nonconformities/${one('SELECT id FROM nonconformity ORDER BY code')}/export.pdf`,
      prp: `/api/prp/checklists/${one('SELECT id FROM prp_checklist ORDER BY performed_date')}/export.pdf`,
      trace: `/api/trace/exercises/${one('SELECT id FROM trace_exercise ORDER BY started_at')}/export.pdf`,
      pack: `/api/audit-pack.pdf?${period}`,
      ...Object.fromEntries(MODULES.filter((m) => m.scope === 'scaffold').map((m) => [m.code, `/api/scaffold/${m.code}/export.pdf`])),
    };
    for (const [name, url] of Object.entries(urls)) {
      const r = await t.app.inject({ url: `${url}${url.includes('?') ? '&' : '?'}lang=hy`, headers: { cookie: c } });
      expect(r.statusCode, `${name}: ${r.body.slice(0, 200)}`).toBe(200);
      expect(r.headers['content-type'], name).toBe('application/pdf');
      const text = await pdfText(r.rawPayload);
      expect((text.match(ARMENIAN) ?? []).length, `${name}: армянские буквы`).toBeGreaterThan(20);
      expect(text, `${name}: нет символов-замен`).not.toContain('�');
      if (name === 'plan' || name === 'pack') writeFileSync(`docs/evidence/phase9-K26-${name}-hy.pdf`, r.rawPayload);
    }
  }, 120_000);

  it('K26 сброс возвращает демо-состояние: созданное исчезает, объёмы как у свежей базы', async () => {
    const admin = await t.login('admin');
    const stats = async () => (await t.app.inject({ url: '/api/stats', headers: { cookie: admin } })).json();
    const fresh = await stats();
    const lot = one("SELECT l.id FROM material_lot l WHERE l.status = 'released' AND (SELECT sum(qty) FROM stock s WHERE s.lot_kind = 'material' AND s.lot_id = l.id) > 5");
    const b = await t.app.inject({ method: 'POST', url: '/api/batches', headers: { cookie: admin },
      payload: { productId: one('SELECT id FROM product ORDER BY code'), shift: 'A', qty: 10, lines: [{ materialLotId: lot, qty: 1 }] } });
    expect(b.statusCode, b.body).toBe(200);
    expect(await stats()).not.toEqual(fresh);
    const reset = await t.app.inject({ method: 'POST', url: '/api/system/reset', headers: { cookie: admin } });
    expect(reset.statusCode, reset.body).toBe(200);
    const c2 = await t.login('admin');
    expect((await t.app.inject({ url: '/api/stats', headers: { cookie: c2 } })).json()).toEqual(fresh);
    expect(t.db().prepare('SELECT count(*) FROM fg_batch WHERE id = ?').pluck().get(b.json().id)).toBe(0);
  });
});
