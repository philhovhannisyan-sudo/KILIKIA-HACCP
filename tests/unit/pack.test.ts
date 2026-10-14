import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { pdfText, squash } from './pdftext';
import { clock } from '../../server/core/clock';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
// Период: последние 90 дней до конца сегодняшнего дня
const to = new Date(Date.parse(`${clock.today()}T00:00:00+04:00`) + 86_400_000).toISOString();
const from = new Date(Date.parse(to) - 90 * 86_400_000).toISOString();
const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
const get = async (cookie: string, url: string) => t.app.inject({ url, headers: { cookie } });

describe('K23 пакет для аудита', () => {
  it('K23 один PDF: титул, оглавление, 4 раздела, дата формирования, имя и роли сформировавшего', async () => {
    const c = await t.login('qa.tech');
    const r = await get(c, `/api/audit-pack.pdf?${qs}&lang=ru`);
    expect(r.statusCode, r.body.slice(0, 200)).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    const text = squash(await pdfText(r.rawPayload));
    for (const s of ['Пакетдляаудита', 'Оглавление', '1.ПланХАССП', '2.ЗаписимониторингаККТ/OPRP', '3.Прослеживаемость', '4.ДоказательстваCAPA',
      'Датаформирования', 'НарекГригорян(Качество/лаборатория,Технолог/производство)', 'DEMO-заводфруктовыхконсервов']) expect(text, s).toContain(s);
    // оглавление ссылается на разделы (заголовки встречаются дважды: в оглавлении и в тексте)
    expect(text.split('4.ДоказательстваCAPA').length - 1).toBeGreaterThanOrEqual(2);
    expect(t.db().prepare("SELECT count(*) FROM audit_log WHERE action = 'generate' AND object_type = 'audit_pack'").pluck().get()).toBe(1);
  });

  it('K23 армянский пакет: заголовки на hy, армянский текст извлекается', async () => {
    const r = await get(await t.login('admin'), `/api/audit-pack.pdf?${qs}&lang=hy`);
    const text = squash(await pdfText(r.rawPayload));
    for (const s of ['Աուդիտիփաթեթ', 'Բովանդակություն', 'CAPAապացույցներ']) expect(text).toContain(s);
  });
});

describe('K24 цифры пакета = цифры экранов модулей', () => {
  it('K24 количество записей ККТ, тестов прослеживаемости, CAPA и версий плана совпадает с экранами за тот же период', async () => {
    const c = await t.login('haccp.lead');
    const r = await get(c, `/api/audit-pack.pdf?${qs}&lang=ru`);
    const counts = JSON.parse(String(r.headers['x-pack-counts']));
    const text = squash(await pdfText(r.rawPayload));
    const monitoring = (await get(c, `/api/monitoring?${qs}`)).json() as Json[];          // экран A03
    const exercises = (await get(c, `/api/trace/exercises?${qs}`)).json() as Json[];      // экран A04
    const capa = (await get(c, `/api/reports/run?source=capa&${qs}`)).json() as Json;     // E01
    expect(counts.monitoring).toBe(monitoring.length);
    expect(counts.trace).toBe(exercises.length);
    expect(counts.capa).toBe(capa.total);
    expect(counts.plans).toBe(1);
    expect(monitoring.length).toBe(12);
    for (const n of [monitoring.length, exercises.length, capa.total]) expect(text).toContain(`Записейзапериод:${n}`);
    // ключевые значения: отклонение 82,4 °C с NC-001, тест TR-001, CAPA-002 с проверкой результативности
    for (const s of ['82,4', 'NC-001', 'TR-001', 'CAPA-002', 'Записиза30днейзаполненыполностью']) expect(text, s).toContain(s);
  });

  it('K24 новая запись мониторинга сразу видна и на экране, и в пакете', async () => {
    const op = await t.login('operator');
    const p = t.db().prepare("SELECT pr.id FROM control_parameter pr JOIN control_point c ON c.id = pr.control_point_id WHERE c.code = 'CCP-1'").pluck().get();
    const b = t.db().prepare("SELECT id FROM fg_batch WHERE code = 'B-CHR-03'").pluck().get();
    await t.app.inject({ method: 'POST', url: '/api/monitoring', headers: { cookie: op }, payload: { parameterId: p, fgBatchId: b, value: '87,3' } });
    const c = await t.login('haccp.lead');
    const counts = JSON.parse(String((await get(c, `/api/audit-pack.pdf?${qs}`)).headers['x-pack-counts']));
    expect(counts.monitoring).toBe(((await get(c, `/api/monitoring?${qs}`)).json() as Json[]).length);
    expect(counts.monitoring).toBe(13);
  });
});

describe('K7 аудитор формирует пакет; конструктор отчётов', () => {
  it('K7 auditor формирует пакет для аудита, но не имеет конструктора отчётов', async () => {
    const a = await t.login('auditor');
    expect((await get(a, `/api/audit-pack.pdf?${qs}`)).statusCode).toBe(200);
    expect((await get(a, `/api/reports/run?source=monitoring&${qs}`)).json().params.permission).toBe('report.custom.generate');
  });

  it('конструктор: поля, группировка, экспорт CSV/XLSX/PDF; некорректный период отклонён', async () => {
    const c = await t.login('tech.director');
    const sources = (await get(c, '/api/reports/sources?lang=ru')).json() as Json[];
    expect(sources.map((s) => s.key)).toEqual(['monitoring', 'environment', 'nonconformity', 'capa', 'trace', 'prp']);
    const r = (await get(c, `/api/reports/run?source=environment&fields=point,value,status&groupBy=status&${qs}`)).json();
    expect(r.headers).toEqual(['Точка', 'Значение', 'Статус']);
    expect(r.total).toBe(112);
    expect(r.groups).toEqual([{ value: 'В пределах', count: 111 }, { value: 'Вне предела', count: 1 }]);
    const csv = (await get(c, `/api/reports/export.csv?source=environment&fields=point,value&${qs}&lang=en`)).rawPayload.toString();
    expect(csv).toContain('Point,Value');
    for (const f of ['xlsx', 'pdf']) expect((await get(c, `/api/reports/export.${f}?source=nonconformity&${qs}`)).statusCode).toBe(200);
    expect((await get(c, `/api/reports/run?source=monitoring&from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`)).json().error).toBe('period_invalid');
    // склад не видит план ХАССП, но для прочих источников модульное право сохраняется
    const w = await t.login('warehouse');
    expect((await get(w, '/api/reports/sources')).json().map((s: Json) => s.key)).toContain('trace');
  });
});
