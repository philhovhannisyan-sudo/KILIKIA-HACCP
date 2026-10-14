import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures/test';
import { MODULES, modulePath } from '../../shared/modules';

const ru = JSON.parse(readFileSync('shared/i18n/ru.json', 'utf8')) as Record<string, string>;
const SCAFFOLD = MODULES.filter((m) => m.scope === 'scaffold');

test.describe('K25 19 каркасов: панель, таблица, форма, печатная форма, пометка «в разработке»', () => {
  test('K25 каждый каркас наполнен и помечен', async ({ page }) => {
    test.setTimeout(300_000);
    expect(SCAFFOLD).toHaveLength(19);
    for (const m of SCAFFOLD) {
      await page.goto(modulePath(m.code));
      const root = page.getByTestId(`page-${m.code}`);
      await expect(root.getByTestId('stub-badge'), m.code).toBeVisible();
      await expect(root.getByTestId('sc-future'), m.code).toHaveText(ru[`sc.future.${m.code}`]);
      await expect(root.getByTestId('sc-kpi-0'), m.code).toBeVisible();
      await expect(root.locator('[data-testid="sc-table"] tbody tr').first(), m.code).toBeVisible();
      // Форма: рабочая (B03, C01, C03, D03) или заготовка с отключённым сохранением
      await expect(root.locator('[data-testid="sc-form"], [data-testid$="-form"], [data-testid="shipment-form"]').first(), m.code).toBeVisible();
      if (await root.getByTestId('sc-form').count()) await expect(root.getByTestId('sc-save')).toBeDisabled();
      const href = await root.getByTestId('sc-pdf').getAttribute('href');
      const pdf = await page.request.get(href!);
      expect(pdf.status(), m.code).toBe(200);
      expect(pdf.headers()['content-type'], m.code).toBe('application/pdf');
    }
    await page.goto(modulePath('A05'));
    await page.locator('[data-testid="sc-table"] tbody tr').first().waitFor();
    await page.screenshot({ path: 'docs/evidence/phase8-K25-A05.png', fullPage: true });
  });

  test('K25 B03: регистрация партии из формы попадает в таблицу на карантин', async ({ page }) => {
    await page.goto(modulePath('B03'));
    await page.locator('[data-testid="sc-table"] tbody tr').first().waitFor();
    const before = await page.locator('[data-testid="sc-table"] tbody tr').count();
    await expect.poll(() => page.locator('#b03-product option').count()).toBeGreaterThan(1);
    await expect.poll(() => page.locator('#b03-lot-0 option').count()).toBeGreaterThan(1);
    await page.locator('#b03-product').selectOption({ index: 1 });
    await page.getByLabel(ru['sc.col.qty'], { exact: true }).first().fill('50,5');
    const lot = page.locator('#b03-lot-0');
    const lots = (await (await page.request.get('/api/material-lots')).json()) as { id: string; status: string; stock: number }[];
    await lot.selectOption(lots.find((l) => l.status === 'released' && l.stock > 2)!.id);
    await page.getByLabel(ru['sc.col.qty'], { exact: true }).nth(1).fill('1,5');
    await page.getByTestId('b03-save').click();
    await expect(page.locator('[data-testid="sc-table"] tbody tr')).toHaveCount(before + 1);
    const code = (await page.locator('[data-testid="sc-table"] tbody tr').first().locator('td').first().innerText()).trim();
    const batches = (await (await page.request.get('/api/fg-batches')).json()) as { code: string; status: string }[];
    expect(batches.find((b) => b.code === code)?.status).toBe('quarantine');
    await page.screenshot({ path: 'docs/evidence/phase8-K25-B03.png', fullPage: true });
  });

  test('K25 E02: пользователи, журнал входов, проверка цепочки аудита, бэкап, площадка', async ({ page }) => {
    await page.goto(modulePath('E02'));
    await expect(page.getByTestId('stub-badge')).toBeVisible();
    await expect(page.locator('[data-testid="e02-users"] tr[data-user="operator"]')).toBeVisible();
    await expect(page.locator('[data-testid="e02-logins"] tbody tr').first()).toBeVisible();
    await page.getByTestId('e02-verify').click();
    await expect(page.getByTestId('e02-chain')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('e02-export')).toBeVisible();
    await expect(page.getByTestId('e02-sites')).toContainText('DEMO-01');
    await page.screenshot({ path: 'docs/evidence/phase8-K25-E02.png', fullPage: true });
  });
});
