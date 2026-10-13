import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { pdfText, squash } from './pdftext';

let t: Awaited<ReturnType<typeof makeApp>>;
let planId: string;
beforeAll(async () => {
  t = await makeApp();
  planId = t.db().prepare("SELECT id FROM haccp_plan WHERE lineage_id = 'PLAN-JAM'").pluck().get() as string;
});
afterAll(async () => { await t.close(); });

const get = async (cookie: string, url: string) => t.app.inject({ url, headers: { cookie } });

describe('K2 печатная форма плана ХАССП на языке интерфейса', () => {
  const expected = {
    ru: ['ПланХАССП', 'Анализопасностей', 'Корректирующеедействие', 'Горячийрозлив', 'ККТ-1', 'Утвердил', 'АннаПетросян'],
    en: ['HACCPplan', 'Hazardanalysis', 'Correctiveaction', 'Hotfill', 'CCP-1', 'Approvedby'],
    hy: ['HACCPպլան', 'Վտանգներիվերլուծություն', 'Ուղղիչգործողություն', 'Տաքլցում', 'ՀԿԿ-1', 'Հաստատելէ'],
  } as const;
  for (const lang of ['ru', 'en', 'hy'] as const) {
    it(`K2 PDF плана на ${lang}: подписи граф и справочники на этом языке, колонтитул со страницей и автором`, async () => {
      const cookie = await t.login('auditor');
      const r = await get(cookie, `/api/plans/${planId}/export.pdf?lang=${lang}`);
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
      const text = squash(await pdfText(r.rawPayload));
      for (const s of expected[lang]) expect(text, `${lang}: ${s}`).toContain(s);
      expect(text).toContain('ИринаВолкова');
      expect(text).toMatch(lang === 'en' ? /Page1of\d/ : lang === 'ru' ? /Стр\.1из\d/ : /Էջ1\/\d/);
      // знаки «≥» и «≤» есть в тексте (шрифт-замена для символов)
      expect(text).toContain('≥85');
    });
  }

  it('K2 CSV и XLSX плана: разделитель по языку, BOM, листы с подписями на языке', async () => {
    const cookie = await t.login('haccp.lead');
    const csvRu = (await get(cookie, `/api/plans/${planId}/export.csv?lang=ru`)).rawPayload.toString('utf8');
    expect(csvRu.charCodeAt(0)).toBe(0xfeff);
    expect(csvRu).toContain('Стадия;Тип;Опасность');
    const csvEn = (await get(cookie, `/api/plans/${planId}/export.csv?lang=en`)).rawPayload.toString('utf8');
    expect(csvEn).toContain('Step,Type,Hazard');
    const x = await get(cookie, `/api/plans/${planId}/export.xlsx?lang=hy`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.rawPayload as never);
    expect(wb.worksheets.map((w) => w.name)).toContain('Վտանգների վերլուծություն');
  });

  it('склад (нет доступа к плану ХАССП) не получает печатную форму', async () => {
    const cookie = await t.login('warehouse');
    const r = await get(cookie, `/api/plans/${planId}/export.pdf?lang=ru`);
    expect(r.statusCode).toBe(403);
    expect(r.json().params.permission).toBe('a01.module.read');
  });
});
