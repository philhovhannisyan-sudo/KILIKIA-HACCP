import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

const LABEL = {
  ru: { param: 'Параметр', batch: 'Партия', value: 'Значение, °C', eq: 'Оборудование' },
  en: { param: 'Parameter', batch: 'Batch', value: 'Value, °C', eq: 'Equipment' },
  hy: { param: 'Պարամետր', batch: 'Խմբաքանակ', value: 'Արժեք, °C', eq: 'Սարքավորում' },
} as const;

async function selectByText(page: Page, label: string, text: string) {
  const sel = page.getByLabel(label, { exact: true });
  const value = await sel.locator('option', { hasText: text }).first().getAttribute('value');
  await sel.selectOption(value!);
}

async function record(page: Page, lang: keyof typeof LABEL, paramText: string, batch: string, value: string) {
  const L = LABEL[lang];
  await selectByText(page, L.param, paramText);
  await selectByText(page, L.batch, batch);
  await page.getByLabel(L.value, { exact: true }).fill(value);
  await page.getByTestId('mon-save').click();
}

test.describe('K11 выход за предел из формы мониторинга', () => {
  test.use({ user: 'operator' });
  test('K11 оператор вводит значение ниже предела → НС с источником в D04, партия на карантине, уведомление', async ({ page }) => {
    await page.goto('/m/a03');
    await record(page, 'ru', 'ККТ-1', 'B-APR-03', '82,0');
    await expect(page.locator('.toast').filter({ hasText: 'Выход за предел' })).toBeVisible();
    const toast = await page.locator('.toast').filter({ hasText: 'Выход за предел' }).innerText();
    const nc = /NC-\d{3}/.exec(toast)![0];
    const row = page.getByTestId('mon-table').locator('tr', { hasText: 'B-APR-03' }).filter({ hasText: nc });
    await expect(row).toContainText('Вне предела');
    const batches = await (await page.request.get('/api/fg-batches')).json();
    expect(batches.find((b: { code: string }) => b.code === 'B-APR-03').status).toBe('quarantine');
    await page.screenshot({ path: 'docs/evidence/phase4-K11-monitoring.png', fullPage: true });
    await page.goto('/m/d04');
    const ncRow = page.getByTestId('nc-registry').locator(`tr[data-nc-code="${nc}"]`);
    await expect(ncRow.getByTestId('nc-source')).toHaveText('Мониторинг ККТ / OPRP');
    await expect(ncRow).toContainText('B-APR-03');
    await expect(page.getByTestId('notifications')).toHaveCount(1);
  });
});

test.describe('K12 оборудование с истёкшей поверкой', () => {
  test.use({ user: 'operator' });
  test('K12 P-01 недоступен для выбора, причина и дата видны; прямой запрос отклонён', async ({ page }) => {
    const eq = await (await page.request.get('/api/equipment')).json();
    const p01 = eq.find((e: { code: string }) => e.code === 'P-01');
    const [y, m, d] = p01.next_cal_date.split('-');
    await page.goto('/m/a03');
    await selectByText(page, 'Параметр', 'Кислотность');
    await expect(page.getByTestId('eq-P-01')).toBeDisabled();
    await expect(page.getByTestId('eq-P-01')).toContainText('поверка истекла');
    await expect(page.getByTestId('eq-blocked')).toContainText('P-01');
    await expect(page.getByTestId('eq-blocked')).toContainText(String(Number(d)));
    await expect(page.getByTestId('eq-blocked')).toContainText(y);
    expect(await page.getByTestId('mon-equipment').inputValue()).toBe('');
    await expect(page.getByTestId('mon-save')).toBeDisabled();
    await page.screenshot({ path: 'docs/evidence/phase4-K12-p01-blocked.png' });
    const cps = await (await page.request.get('/api/control-points')).json();
    const ph = cps.flatMap((c: { parameters: { code: string; id: string }[] }) => c.parameters).find((x: { code: string }) => x.code === 'PH');
    const batches = await (await page.request.get('/api/fg-batches')).json();
    const r = await page.request.post('/api/monitoring', { data: { parameterId: ph.id, fgBatchId: batches[0].id, value: '3,4', equipmentId: p01.id } });
    expect(r.status()).toBe(422);
    expect(await r.json()).toMatchObject({ error: 'equipment_calibration_expired', params: { nextCalDate: `${y}-${m}-${d}` } });
  });
});

test.describe('K17 запятая и точка во всех локалях', () => {
  test.use({ user: 'qa.lab' });
  for (const lang of ['ru', 'en', 'hy'] as const) {
    test(`K17 «85,5» и «85.5» сохраняются как 85.5 (${lang})`, async ({ page }) => {
      await page.goto('/m/a03');
      await page.getByTestId('lang-select').selectOption(lang);
      const cpText = { ru: 'ККТ-1', en: 'CCP-1', hy: 'ՀԿԿ-1' }[lang];
      const ids: string[] = [];
      for (const v of ['85,5', '85.5']) {
        const resp = page.waitForResponse((r) => r.url().endsWith('/api/monitoring') && r.request().method() === 'POST');
        await record(page, lang, cpText, 'B-CHR-03', v);
        ids.push((await (await resp).json()).id);
      }
      for (const id of ids) {
        const rec = await (await page.request.get(`/api/monitoring/${id}`)).json();
        expect(rec.value_num).toBe(85.5);
      }
    });
  }
});

test.describe('K10 исправление записи мониторинга в интерфейсе', () => {
  test.use({ user: 'qa.lab' });
  test('K10 корректировка с причиной: исходное значение видно зачёркнутым и не изменено', async ({ page }) => {
    await page.goto('/m/a03');
    const resp = page.waitForResponse((r) => r.url().endsWith('/api/monitoring') && r.request().method() === 'POST');
    await record(page, 'ru', 'ККТ-1', 'B-CHR-03', '86,2');
    const id = (await (await resp).json()).id;
    const row = page.locator(`tr[data-record-id="${id}"]`);
    await row.getByTestId('correct').click();
    await page.getByLabel('Правильное значение').fill('87,1');
    await page.getByLabel('Причина исправления').fill('Ошибка ввода, сверено с самописцем');
    await page.getByTestId('correction-submit').click();
    await expect(row.getByTestId('original-value')).toHaveText('86,2 °C');
    await expect(row.getByTestId('corrected-value')).toHaveText('87,1 °C');
    await expect(row.getByTestId('correction-reason')).toContainText('Ошибка ввода, сверено с самописцем');
    const rec = await (await page.request.get(`/api/monitoring/${id}`)).json();
    expect(rec.value_num).toBe(86.2);
    expect(rec.corrections).toHaveLength(1);
    await page.screenshot({ path: 'docs/evidence/phase4-K10-correction.png' });
  });
});

test.describe('A10 среда и холодовая цепь', () => {
  test.use({ user: 'qa.lab' });
  test('A10 точки и графики за 14 дней; отклонение → регистрация НС вручную', async ({ page }) => {
    await page.goto('/m/a10');
    for (const code of ['ENV-01', 'ENV-02', 'ENV-03', 'ENV-04']) {
      await expect(page.getByTestId(`point-${code}`)).toBeVisible();
      await expect(page.getByTestId(`chart-${code}`).locator('svg circle')).not.toHaveCount(0);
    }
    const dev = page.getByTestId('env-deviations').locator('li', { hasText: 'ENV-01' }).first();
    await expect(dev).toContainText('6,2');
    await dev.getByTestId('env-register-nc').click();
    await expect(page.locator('.toast').filter({ hasText: 'Зарегистрировано несоответствие' })).toBeVisible();
    await expect(dev).toContainText(/NC-\d{3}/);
    await page.screenshot({ path: 'docs/evidence/phase4-A10-environment.png', fullPage: true });
    const pdf = await page.request.get((await page.getByTestId('env-pdf').getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
  });
});
