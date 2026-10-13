import { test, expect } from '../fixtures/test';

test.describe('K5 панель готовности на демо-данных', () => {
  test('K5 цифры на главной совпадают с API и объёмами демо-данных', async ({ page }) => {
    const stats = await (await page.request.get('/api/stats')).json();
    expect(stats.fg_batch).toBeGreaterThanOrEqual(12);
    expect(stats.material_lot).toBeGreaterThanOrEqual(8);
    expect(stats.monitoring_record).toBeGreaterThanOrEqual(6);
    expect([stats.ccp, stats.oprp, stats.nonconformity, stats.capa]).toEqual([2, 1, 3, 2]);
    // Другие тесты параллельно меняют данные (карантин, НС) — сверка повторяется до совпадения
    await page.goto('/');
    let api: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    await expect(async () => {
      await page.reload();
      api = await (await page.request.get('/api/dashboard')).json();
      await expect(page.getByTestId('kpi-readiness-value')).toHaveText(`${api.readiness.percent} %`, { timeout: 2000 });
      await expect(page.getByTestId('kpi-capa-value')).toHaveText(String(api.openCapa.count), { timeout: 2000 });
      await expect(page.getByTestId('kpi-calibration-value')).toHaveText(String(api.overdueCalibration.count), { timeout: 2000 });
      await expect(page.getByTestId('kpi-quarantine-value')).toHaveText(String(api.quarantine.count), { timeout: 2000 });
      await expect(page.getByTestId('clauses').locator('tr[data-covered="true"]')).toHaveCount(api.readiness.covered, { timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId('list-calibration')).toContainText('P-01');
    await expect(page.getByTestId('list-quarantine')).toContainText('B-STR-04');
    await expect(page.getByTestId('list-capa').locator('.item--overdue')).toHaveCount(api.openCapa.overdue);
    await expect(page.getByTestId('list-deviations')).toContainText('NC-001');
    await expect(page.getByTestId('list-deviations')).toContainText('ККТ-1');
    await expect(page.getByTestId('clauses').locator('tbody tr')).toHaveCount(api.readiness.total);
    await page.screenshot({ path: 'docs/evidence/phase2-K05-dashboard.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('lang-select').selectOption('hy');
    await expect(page.getByTestId('list-deviations')).toContainText('ՀԿԿ-1');
    await page.screenshot({ path: 'docs/evidence/phase2-K05-dashboard-390-hy.png', fullPage: true });
  });
});

test.describe('Вход в систему', () => {
  test.use({ user: '' });
  test('K5 экран входа показывает демо-учётки; вход и выход работают; роли видны в панели', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('page-login')).toBeVisible();
    await expect(page.getByTestId('demo-users').locator('li')).toHaveCount(9);
    await page.screenshot({ path: 'docs/evidence/phase2-K05-login.png', fullPage: true });
    await page.getByLabel('Логин', { exact: true }).fill('operator');
    await page.getByLabel('Пароль').fill('wrong');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Неверный логин или пароль');
    await page.getByTestId('demo-qa.tech').click();
    await expect(page.getByTestId('user-name')).toHaveText('Нарек Григорян');
    await expect(page.getByTestId('user-roles')).toHaveText('Качество / лаборатория, Технолог / производство');
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('page-login')).toBeVisible();
  });
});
