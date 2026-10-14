import { test, expect } from '../fixtures/test';

test.describe('K21 закрытие несоответствия', () => {
  test.use({ user: 'qa.lab' });
  test('K21 NC-002: закрыть без проверки результативности CAPA нельзя; после записи проверки — закрыто', async ({ page }) => {
    await page.goto('/m/d04');
    await page.getByTestId('nc-registry').locator('tr[data-nc-code="NC-002"]').getByTestId('nc-open').click();
    const card = page.getByTestId('nc-card');
    await expect(card).toContainText('NC-002');
    await expect(card.getByTestId('nc-card-source')).toHaveText('Входной контроль');
    const capa = card.locator('article[data-capa="CAPA-001"]');
    await capa.getByTestId('capa-to-done').click();
    await expect(capa.getByTestId('capa-status')).toHaveText('Выполнено');
    await card.getByTestId('nc-to-capa_done').click();
    await card.getByTestId('nc-to-effectiveness_check').click();
    await expect(card.getByTestId('nc-status')).toHaveText('Проверка результативности');
    await card.getByTestId('nc-to-closed').click();
    await expect(page.locator('.toast').filter({ hasText: 'не заполнена проверка результативности CAPA' })).toBeVisible();
    await expect(card.getByTestId('nc-status')).toHaveText('Проверка результативности');
    await page.screenshot({ path: 'docs/evidence/phase6-K21-close-blocked.png', fullPage: true });
    await capa.getByLabel('Результат проверки результативности').fill('За 30 дней все партии приняты с CoA');
    await capa.getByTestId('capa-eff-save').click();
    await expect(capa.getByTestId('capa-eff')).toContainText('За 30 дней все партии приняты с CoA');
    await card.getByTestId('nc-to-closed').click();
    await expect(card.getByTestId('nc-status')).toHaveText('Закрыто');
    const pdf = await page.request.get((await card.getByTestId('nc-pdf').getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
  });
});

test.describe('K22 чек-лист PRP с файлом-доказательством', () => {
  test.use({ user: 'qa.lab' });
  test('K22 загрузка файла в пункт чек-листа, ссылка на файл и печатная форма', async ({ page }) => {
    await page.goto('/m/a02');
    await page.getByTestId('prp-open-PRP-04').click();
    const form = page.getByTestId('checklist-form');
    await expect(form).toContainText('PRP-04');
    await form.getByLabel('Вопрос').fill('Санитарная одежда в наличии');
    await form.getByLabel('Результат').selectOption('ok');
    await form.getByLabel(/Файл-доказательство/).setInputFiles({ name: 'hygiene-check.txt', mimeType: 'text/plain', buffer: Buffer.from('Проверено 14.10, замечаний нет') });
    await form.getByTestId('checklist-save').click();
    await expect(page.locator('.toast').filter({ hasText: 'Чек-лист сохранён' })).toBeVisible();
    const history = page.getByTestId('checklist-history');
    const link = history.getByTestId('evidence-link').filter({ hasText: 'hygiene-check.txt' }).first();
    await expect(link).toBeVisible();
    const file = await page.request.get((await link.getAttribute('href'))!);
    expect(await file.text()).toBe('Проверено 14.10, замечаний нет');
    const pdf = await page.request.get((await history.locator('article').first().getByTestId('checklist-pdf').getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).length).toBeGreaterThan(1000);
    await page.screenshot({ path: 'docs/evidence/phase6-K22-prp-checklist.png', fullPage: true });
  });
});
