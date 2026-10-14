import { test, expect } from '../fixtures/test';

test.describe('K7 + K23 внешний аудитор формирует пакет', () => {
  test.use({ user: 'auditor' });
  test('K7 K23 аудитор: на E01 нет элементов изменения и конструктора; пакет формируется одним PDF', async ({ page }) => {
    await page.goto('/m/e01');
    await expect(page.getByTestId('audit-pack')).toBeVisible();
    await expect(page.getByTestId('report-builder')).toHaveCount(0);
    await expect(page.locator('[data-action]')).toHaveCount(0);
    const href = await page.getByTestId('audit-pack-generate').getAttribute('href');
    const pdf = await page.request.get(href!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    const counts = JSON.parse(pdf.headers()['x-pack-counts']);
    expect(counts.plans).toBeGreaterThanOrEqual(1);
    expect(counts.monitoring).toBeGreaterThanOrEqual(6);
    await page.screenshot({ path: 'docs/evidence/phase7-K07-auditor-pack.png' });
  });
});

test.describe('K24 цифры пакета = экран модуля', () => {
  test.use({ user: 'haccp.lead' });
  test('K24 за один период пакет и экран A03 показывают одинаковое число записей ККТ', async ({ page }) => {
    await page.goto('/m/a03');
    const fromDate = await page.getByLabel('С', { exact: true }).inputValue();
    const toDate = await page.getByLabel('По', { exact: true }).inputValue();
    await expect(page.getByTestId('mon-table').locator('tbody tr').first()).toBeVisible(); // дождаться данных
    const screenCount = Number(/\d+/.exec(await page.getByTestId('mon-count').innerText())![0]);
    await page.goto('/m/e01');
    const pack = page.getByTestId('audit-pack');
    await pack.getByLabel('С', { exact: true }).fill(fromDate);
    await pack.getByLabel('По', { exact: true }).fill(toDate);
    const counts = JSON.parse((await page.request.get((await pack.getByTestId('audit-pack-generate').getAttribute('href'))!)).headers()['x-pack-counts']);
    expect(screenCount).toBeGreaterThan(0);
    expect(counts.monitoring).toBe(screenCount);
  });

  test('K24 конструктор: тот же источник даёт то же число записей, группировка по статусу', async ({ page }) => {
    await page.goto('/m/e01');
    const b = page.getByTestId('report-builder');
    await b.getByLabel('Модуль / источник данных').selectOption('environment');
    await b.getByLabel('Группировка').selectOption('status');
    await b.getByTestId('report-run').click();
    await expect(b.getByTestId('report-groups')).toContainText('Вне предела');
    const total = Number(/\d+/.exec(await b.getByTestId('report-total').innerText())![0]);
    const from = await b.getByLabel('С', { exact: true }).inputValue();
    const to = await b.getByLabel('По', { exact: true }).inputValue();
    const iso = (d: string, add = 0) => new Date(Date.parse(`${d}T00:00:00+04:00`) + add * 86_400_000).toISOString();
    const api = await (await page.request.get(`/api/env-records?from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to, 1))}`)).json();
    expect(total).toBe(api.length);
    await page.screenshot({ path: 'docs/evidence/phase7-K24-report-builder.png', fullPage: true });
  });
});
