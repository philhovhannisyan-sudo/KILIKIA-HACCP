// Общая фикстура e2e (часть К26 с фазы 1):
// - любая ошибка консоли или необработанное исключение страницы валит тест;
// - любой запрос не на localhost блокируется и валит тест (приложение работает без интернета).
import { test as base, expect, type Page } from '@playwright/test';
import { MODULES, modulePath } from '../../shared/modules';
import type { Lang } from '../../shared/time';

export const ROUTES = ['/', ...MODULES.map((m) => modulePath(m.code))];

export const test = base.extend<{ guard: void; user: string; loggedIn: void }>({
  // Пользователь, под которым тест входит в систему (переопределяется test.use({ user: 'auditor' })); '' — без входа
  user: ['admin', { option: true }],
  loggedIn: [
    async ({ page, user }, use) => {
      if (user) {
        const r = await page.request.post('/api/auth/login', { data: { login: user, password: 'demo' } });
        expect(r.status(), `login ${user}`).toBe(200);
      }
      await use();
    },
    { auto: true },
  ],
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      // Сетевое сообщение браузера об ответе 4xx — штатный отказ сервера (нет сессии, нет права, правило целостности),
      // который приложение показывает пользователю; оно не считается ошибкой. Любой ответ 5xx валит тест.
      const expected4xx = /^Failed to load resource: the server responded with a status of 4\d\d/;
      page.on('console', (msg) => msg.type() === 'error' && !expected4xx.test(msg.text()) && problems.push(`console: ${msg.text()}`));
      page.on('response', (r) => r.status() >= 500 && problems.push(`server ${r.status()}: ${r.url()}`));
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
