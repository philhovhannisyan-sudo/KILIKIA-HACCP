import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp } from './helpers';
import { pdfText, squash } from './pdftext';

let t: Awaited<ReturnType<typeof makeApp>>;
beforeAll(async () => { t = await makeApp(); });
afterAll(async () => { await t.close(); });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (cookie: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) => {
  const r = await t.app.inject({ method, url, headers: { cookie }, payload: payload as Json });
  return { status: r.statusCode, body: r.json() as Json };
};
const tr = (c: string, entity: string, id: string, to: string, comment?: string) => call(c, 'POST', `/api/fsm/${entity}/${id}/transition`, { to, comment });

describe('K21 жизненный цикл несоответствия и CAPA', () => {
  it('K21 НС нельзя закрыть без проверки результативности CAPA; с ней — можно; «нерезультативно» возвращает в анализ', async () => {
    const qa = await t.login('qa.lab');
    const nc = t.db().prepare("SELECT id FROM nonconformity WHERE code = 'NC-001'").pluck().get() as string;
    expect((await tr(qa, 'nonconformity', nc, 'root_cause_identified')).body).toMatchObject({ error: 'guard_failed', params: { guard: 'ncRootCauseFilled' } });
    let r = await call(qa, 'PUT', `/api/nonconformities/${nc}/analysis`, {
      fiveWhys: ['Температура ниже 85 °C', 'Подогрев отключился', 'Сработала защита', 'Датчик загрязнён', 'Нет графика очистки'],
      rootCause: 'Отсутствует график очистки датчика подогрева', ishikawa: [{ category: 'machine', text: 'Загрязнённый датчик' }, { category: 'method', text: 'Нет графика очистки' }],
    });
    expect(r.body).toMatchObject({ root_cause: 'Отсутствует график очистки датчика подогрева', fiveWhys: { length: 5 }, ishikawa: { length: 2 } });
    expect((await tr(qa, 'nonconformity', nc, 'root_cause_identified')).status).toBe(200);
    expect((await tr(qa, 'nonconformity', nc, 'capa_assigned')).body.params.guard).toBe('ncHasCapa');
    const owner = t.db().prepare("SELECT id FROM user WHERE login = 'technologist'").pluck().get();
    r = await call(qa, 'POST', `/api/nonconformities/${nc}/capa`, { action: 'Ввести еженедельную очистку датчика', type: 'corrective', ownerId: owner, dueDate: '2026-12-01' });
    const capa = r.body.capa.at(-1);
    expect(capa).toMatchObject({ status: 'planned', owner_name: 'Давид Акопян' });
    expect((await tr(qa, 'nonconformity', nc, 'capa_assigned')).status).toBe(200);
    expect((await tr(qa, 'nonconformity', nc, 'capa_done')).body).toMatchObject({ error: 'guard_failed', params: { guard: 'ncAllCapaDone' } });
    const tech = await t.login('technologist');
    expect((await tr(tech, 'capa', capa.id, 'in_progress')).status).toBe(200);
    expect((await tr(tech, 'capa', capa.id, 'done')).status).toBe(200);
    expect((await tr(qa, 'nonconformity', nc, 'capa_done')).status).toBe(200);
    expect((await tr(qa, 'nonconformity', nc, 'effectiveness_check')).status).toBe(200);
    // закрыть без проверки результативности нельзя
    const blocked = await tr(qa, 'nonconformity', nc, 'closed');
    expect(blocked.status).toBe(422);
    expect(blocked.body.params).toMatchObject({ guard: 'ncCapaEffectivenessFilled', capa: [capa.code] });
    // технолог не утверждает CAPA (brief §7)
    expect((await call(tech, 'PUT', `/api/capa/${capa.id}/effectiveness`, { result: 'x' })).body.params.permission).toBe('capa.effectiveness.verify');
    // «нерезультативно» → снова в анализ (с комментарием)
    expect((await tr(qa, 'nonconformity', nc, 'in_analysis')).body.error).toBe('comment_required');
    expect((await tr(qa, 'nonconformity', nc, 'in_analysis', 'Повтор отклонения после мер')).body.status).toBe('in_analysis');
    for (const s of ['root_cause_identified', 'capa_assigned', 'capa_done', 'effectiveness_check']) expect((await tr(qa, 'nonconformity', nc, s)).status, s).toBe(200);
    r = await call(qa, 'PUT', `/api/capa/${capa.id}/effectiveness`, { result: 'За 30 дней отклонений температуры розлива нет' });
    expect(r.body.capa.at(-1)).toMatchObject({ eff_result: 'За 30 дней отклонений температуры розлива нет', eff_checked_by_name: 'Лилит Аветисян' });
    const closed = await tr(qa, 'nonconformity', nc, 'closed');
    expect(closed.body.status).toBe('closed');
    const pdf = await t.app.inject({ url: `/api/nonconformities/${nc}/export.pdf?lang=ru`, headers: { cookie: qa } });
    const text = squash(await pdfText(pdf.rawPayload));
    for (const s of ['ПротоколнесоответствияNC-001', '«5почему»', 'ДиаграммаИсикавы', 'ОтчётCAPA', 'За30днейотклонений']) expect(text).toContain(s);
  });

  it('ручная регистрация НС и прямой запрос аудитора отклонён', async () => {
    const qa = await t.login('qa.lab');
    const r = await call(qa, 'POST', '/api/nonconformities', { sourceType: 'claim', severity: 'minor', description: 'Претензия клиента: вздутая крышка' });
    expect(r.body).toMatchObject({ source_type: 'claim', status: 'registered' });
    expect(r.body.code).toMatch(/^NC-\d{3}$/);
    const aud = await t.login('auditor');
    expect((await call(aud, 'POST', '/api/nonconformities', { sourceType: 'claim', severity: 'minor', description: 'x' })).status).toBe(403);
  });
});

describe('K22 чек-лист PRP с доказательством', () => {
  // 1×1 PNG
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  it('K22 файл-доказательство сохраняется в чек-листе и выводится в печатную форму', async () => {
    const qa = await t.login('qa.lab');
    const prp = (await call(qa, 'GET', '/api/prp')).body as unknown as Json[];
    const p02 = prp.find((p) => p.code === 'PRP-02')!;
    const r = await call(qa, 'POST', `/api/prp/${p02.id}/checklists`, { items: [
      { question: 'ATP-смыв линии ниже порога', result: 'ok', file: { name: 'atp-swab-photo.png', mime: 'image/png', base64: png } },
      { question: 'Журнал мойки заполнен', result: 'nok', note: 'Нет подписи', file: { name: 'wash-log.txt', mime: 'text/plain', base64: Buffer.from('журнал').toString('base64') } },
    ] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ status: 'completed_with_findings', items: [{ file_name: 'atp-swab-photo.png' }, { file_name: 'wash-log.txt' }] });
    const file = await t.app.inject({ url: `/api/files/${r.body.items[0].file_id}`, headers: { cookie: qa } });
    expect(file.rawPayload.toString('base64')).toBe(png);
    const pdf = await t.app.inject({ url: `/api/prp/checklists/${r.body.id}/export.pdf?lang=ru`, headers: { cookie: qa } });
    expect(pdf.statusCode).toBe(200);
    const text = squash(await pdfText(pdf.rawPayload));
    for (const s of ['atp-swab-photo.png', 'wash-log.txt', 'Приложения:доказательства', 'Несоответствует']) expect(text).toContain(s);
    // встроенное изображение
    expect(pdf.rawPayload.toString('latin1')).toContain('/Subtype /Image');
    const last = (await call(qa, 'GET', '/api/prp')).body as unknown as Json[];
    expect(last.find((p) => p.code === 'PRP-02')!.last_checked_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('K22 недопустимый тип файла отклоняется; оператор не создаёт чек-листы', async () => {
    const qa = await t.login('qa.lab');
    const p = ((await call(qa, 'GET', '/api/prp')).body as unknown as Json[])[0];
    const bad = await call(qa, 'POST', `/api/prp/${p.id}/checklists`, { items: [{ question: 'Q', result: 'ok', file: { name: 'x.exe', mime: 'application/x-msdownload', base64: 'AA==' } }] });
    expect(bad.body.error).toBe('file_type_not_allowed');
    const op = await t.login('operator');
    expect((await call(op, 'POST', `/api/prp/${p.id}/checklists`, { items: [{ question: 'Q', result: 'ok' }] })).status).toBe(403);
  });
});
