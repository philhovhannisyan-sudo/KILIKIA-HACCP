import { test, expect } from '../fixtures/test';
import { MODULES, modulePath } from '../../shared/modules';

// Модули, уже реализованные полностью: у них нет пометки «заглушка», у остальных она обязательна
const IMPLEMENTED = new Set(['A01']);

test.describe('K1 Все 26 маршрутов открываются без ошибок и пустых экранов', () => {
  test('K1 главная и 26 модулей', async ({ page }) => {
    expect(MODULES).toHaveLength(26);
    await page.goto('/');
    await expect(page.getByTestId('page-home')).toBeVisible();
    for (const m of MODULES) {
      const resp = await page.goto(modulePath(m.code));
      expect(resp?.status(), m.code).toBe(200);
      const root = page.getByTestId(`page-${m.code}`);
      await expect(root, m.code).toBeVisible();
      await expect(root.locator('h1')).toContainText(m.code);
      if (IMPLEMENTED.has(m.code)) await expect(root.getByTestId('stub-badge')).toHaveCount(0);
      else await expect(root.getByTestId('stub-badge')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const text = (await root.innerText()).trim();
      expect(text.length, `${m.code}: содержимое страницы`).toBeGreaterThan(150);
      await expect(page.getByTestId(`nav-${m.code}`)).toHaveClass(/active/);
    }
    await page.screenshot({ path: 'docs/evidence/phase1-K01-module-1280.png', fullPage: true });
  });
});
