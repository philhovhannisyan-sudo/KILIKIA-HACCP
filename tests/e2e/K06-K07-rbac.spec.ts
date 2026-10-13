import { test, expect, ROUTES } from '../fixtures/test';

test.describe('K6 отказ сервера при прямом API-запросе', () => {
  test.use({ user: 'operator' });
  test('K6 operator не может изменить предел ККТ через API; сообщение называет право', async ({ page }) => {
    const cps = await (await page.request.get('/api/control-points')).json();
    const param = cps.find((c: { code: string }) => c.code === 'CCP-1').parameters[0];
    const r = await page.request.patch(`/api/control-parameters/${param.id}`, { data: { limitMin: 80 } });
    expect(r.status()).toBe(403);
    const body = await r.json();
    expect(body).toMatchObject({ error: 'forbidden', params: { permission: 'ccp.limit.update' } });
    const after = await (await page.request.get('/api/control-points')).json();
    expect(after.find((c: { code: string }) => c.code === 'CCP-1').parameters[0].limit_min).toBe(85);
  });
});

test.describe('K7 внешний аудитор', () => {
  test.use({ user: 'auditor' });
  test('K7 ни одного элемента изменения во всех 26 разделах и на главной', async ({ page }) => {
    const found: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.locator('main h1').waitFor();
      const n = await page.locator('[data-action]').count();
      if (n) found.push(`${route}: ${n}`);
    }
    await page.getByTestId('user-menu').click();
    expect(await page.locator('[data-action]').count()).toBe(0);
    expect(found).toEqual([]);
    await expect(page.getByTestId('reset')).toHaveCount(0);
    await page.screenshot({ path: 'docs/evidence/phase2-K07-auditor.png' });
  });
});

test.describe('K7 контроль: у администратора элементы изменения есть', () => {
  test('K7 admin видит сброс и экспорт (признак data-action работает)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('reset')).toHaveAttribute('data-action', 'system.demo.reset');
    await page.getByTestId('user-menu').click();
    await expect(page.getByTestId('export')).toBeVisible();
    await expect(page.getByTestId('import')).toBeVisible();
  });
});
