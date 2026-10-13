import { test, expect, ROUTES, useLang } from '../fixtures/test';

for (const lang of ['ru', 'en', 'hy'] as const) {
  test(`K3 нет горизонтальной прокрутки на 390px во всех разделах (${lang})`, async ({ page }) => {
    await useLang(page, lang);
    await page.setViewportSize({ width: 390, height: 844 });
    const bad: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.locator('main h1').waitFor();
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      if (sw > cw) bad.push(`${route}: scrollWidth ${sw} > clientWidth ${cw}`);
    }
    if (lang === 'hy') await page.screenshot({ path: 'docs/evidence/phase1-K03-390-hy.png', fullPage: true });
    expect(bad).toEqual([]);
  });
}
