import { test, expect, ROUTES, useLang } from '../fixtures/test';

// Проверка на странице: (1) у кнопок, заголовков, ячеек с overflow:hidden нет скрытого текста;
// (2) ни один видимый элемент не выходит за правый край окна, если он не внутри горизонтально прокручиваемой полосы.
const CHECK = () => {
  const out: string[] = [];
  const vw = document.documentElement.clientWidth;
  const sel = 'button, a, h1, h2, h3, h4, th, td, label, dt, dd, .badge, .tab, select, output';
  const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} «${(el.textContent ?? '').trim().slice(0, 40)}»`;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetParent === null && cs.position !== 'fixed') continue;
    const hides = [cs.overflow, cs.overflowX, cs.overflowY].some((v) => v === 'hidden' || v === 'clip');
    if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) out.push(`обрезка: ${describe(el)}`);
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    let p: HTMLElement | null = el.parentElement;
    let inScroller = false;
    while (p) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') { inScroller = true; break; }
      p = p.parentElement;
    }
    if (!inScroller && r.right > vw + 1) out.push(`за краем (${Math.round(r.right)} > ${vw}): ${describe(el)}`);
  }
  return out;
};

for (const width of [390, 1280]) {
  for (const lang of ['ru', 'en', 'hy'] as const) {
    test(`K4 нет обрезки текста: ${width}px, ${lang}`, async ({ page }) => {
      await useLang(page, lang);
      await page.setViewportSize({ width, height: 900 });
      const bad: string[] = [];
      for (const route of ROUTES) {
        await page.goto(route);
        await page.locator('main h1').waitFor();
      await page.waitForLoadState('networkidle'); // каркасы дорисовывают панель и таблицу после загрузки данных
        for (const p of await page.evaluate(CHECK)) bad.push(`${route}: ${p}`);
      }
      if (lang === 'hy') await page.screenshot({ path: `docs/evidence/phase1-K04-${width}-hy.png` });
      expect(bad).toEqual([]);
    });
  }
}
