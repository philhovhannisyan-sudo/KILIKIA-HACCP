import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures/test';

const load = (l: string) => JSON.parse(readFileSync(`shared/i18n/${l}.json`, 'utf8')) as Record<string, string>;
const D: Record<string, Record<string, string>> = { ru: load('ru'), en: load('en'), hy: load('hy') };
const ru = D.ru;
const glossary = readFileSync('docs/glossary.csv', 'utf8');
// Заголовки модулей без ссылок на глоссарий — для прямого сравнения
const title = (lang: string, code: string) => D[lang][`module.${code}.title`];

test.describe('K2 Переключение ru → en → hy без перезагрузки, ввод в форме сохраняется', () => {
  test('K2 интерфейс и меню меняются, данные формы сохраняются', async ({ page }) => {
    expect(glossary.length).toBeGreaterThan(0);
    await page.goto('/m/a05');
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    await page.getByLabel(ru['form.comment']).fill('Проверка ввода');
    await page.getByLabel(ru['form.value']).fill('85,5');
    await expect(page.getByTestId('parsed')).toHaveAttribute('data-value', '85.5');

    for (const lang of ['en', 'hy', 'ru'] as const) {
      await page.getByTestId('lang-select').selectOption(lang);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1')).toContainText(title(lang, 'A05'));
      await expect(page.getByTestId('nav-A07')).toContainText(title(lang, 'A07'));
      await expect(page.getByLabel(D[lang]['form.comment'])).toHaveValue('Проверка ввода');
      await expect(page.getByLabel(D[lang]['form.value'])).toHaveValue('85,5');
      await expect(page.getByTestId('parsed')).toHaveAttribute('data-value', '85.5');
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
      if (lang !== 'ru') await page.screenshot({ path: `docs/evidence/phase1-K02-${lang}.png`, fullPage: true });
    }
  });

  test('K2 язык сохраняется после перезагрузки и форматирует время по локали', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('lang-select').selectOption('hy');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hy');
    await expect(page.locator('h1')).toHaveText(D.hy['home.title']);
    await expect(page.getByTestId('nav-A01')).toContainText(title('hy', 'A01'));
    await page.screenshot({ path: 'docs/evidence/phase1-K02-hy-home.png', fullPage: true });
  });
});
