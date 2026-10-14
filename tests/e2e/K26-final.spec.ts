import { test, expect, ROUTES, useLang } from '../fixtures/test';

// Ловушка консоли и внешних запросов (фикстура) действует на каждом e2e-тесте; здесь — сквозной обход на hy.
test.describe('K26 финальный обход', () => {
  test('K26 все разделы на hy: консоль без ошибок, ни одного внешнего запроса', async ({ page }) => {
    test.setTimeout(300_000);
    await useLang(page, 'hy');
    for (const route of ROUTES) {
      await page.goto(route);
      await page.locator('main h1').waitFor();
      await page.waitForLoadState('networkidle');
    }
    await page.goto('/');
    await page.locator('main h1').waitFor();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hy');
    await page.screenshot({ path: 'docs/evidence/phase9-K26-home-hy.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/m/a03');
    await page.locator('main h1').waitFor();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'docs/evidence/phase9-K26-monitoring-390-hy.png' });
  });
});
