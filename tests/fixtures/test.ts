// Общая фикстура e2e (часть К26 с фазы 1):
// - любая ошибка консоли или необработанное исключение страницы валит тест;
// - любой запрос не на localhost блокируется и валит тест (приложение работает без интернета).
import { test as base, expect, type Page } from '@playwright/test';
import { MODULES, modulePath } from '../../shared/modules';
import type { Lang } from '../../shared/time';

export const ROUTES = ['/', ...MODULES.map((m) => modulePath(m.code))];

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (msg) => msg.type() === 'error' && problems.push(`console: ${msg.text()}`));
      page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
      await page.route('**/*', (route) => {
        const host = new URL(route.request().url()).hostname;
        if (host === 'localhost' || host === '127.0.0.1') return route.continue();
        problems.push(`external request: ${route.request().url()}`);
        return route.abort();
      });
      await use();
      expect(problems, 'ошибки консоли / внешние запросы').toEqual([]);
    },
    { auto: true },
  ],
});

export async function useLang(page: Page, lang: Lang) {
  await page.addInitScript((l) => localStorage.setItem('haccp.lang', l), lang);
}

export { expect };
