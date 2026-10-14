import { test, expect } from '../fixtures/test';

test.describe('K18 дерево прослеживаемости', () => {
  test.use({ user: 'qa.lab' });
  test('K18 для B-APR-01: все партии сырья и поставщики назад, все отгрузки и клиенты вперёд', async ({ page }) => {
    await page.goto('/m/a04');
    const opt = await page.getByTestId('trace-batch').locator('option', { hasText: 'B-APR-01' }).getAttribute('value');
    await page.getByTestId('trace-batch').selectOption(opt!);
    const back = page.getByTestId('trace-backward');
    for (const lot of ['RL-APR-01', 'RL-SUG-01', 'RL-PEC-01', 'RL-CIT-01', 'RL-JAR-01', 'RL-LID-01']) await expect(back.locator(`li[data-lot="${lot}"]`)).toHaveCount(1);
    for (const s of ['SUP-01', 'SUP-02', 'SUP-03', 'SUP-04']) await expect(back.locator(`li[data-supplier="${s}"]`).first()).toBeVisible();
    const fwd = page.getByTestId('trace-forward');
    for (const sh of ['SH-001', 'SH-002', 'SH-004']) await expect(fwd.locator(`li[data-shipment="${sh}"]`)).toHaveCount(1);
    for (const c of ['CUS-01', 'CUS-02', 'CUS-04']) await expect(fwd.locator(`li[data-customer="${c}"]`).first()).toBeVisible();
    await expect(fwd).toContainText('Отгрузок: 3; клиентов: 3');
    await page.screenshot({ path: 'docs/evidence/phase5-K18-trace-tree.png', fullPage: true });
  });
});

test.describe('K19 тестовый отзыв', () => {
  test.use({ user: 'qa.lab' });
  test('K19 таймер, отметки возврата, отчёт с длительностью, числом отгрузок и % возврата', async ({ page }) => {
    await page.goto('/m/a04');
    const opt = await page.getByTestId('trace-batch').locator('option', { hasText: 'B-CHR-01' }).getAttribute('value');
    await page.getByTestId('trace-batch').selectOption(opt!);
    await page.getByTestId('start-recall').click();
    const panel = page.getByTestId('exercise-panel');
    await expect(panel).toContainText('Тестовый отзыв');
    await expect(panel.getByTestId('exercise-shipments')).toHaveText('2');
    const t1 = await panel.getByTestId('exercise-timer').innerText();
    await expect(panel.getByTestId('exercise-timer')).not.toHaveText(t1, { timeout: 3000 }); // таймер идёт
    const rows = panel.getByTestId('recall-items').locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await rows.nth(0).getByTestId('returned').click(); // состояние приходит с сервера
    await expect(rows.nth(0).getByTestId('returned')).toBeChecked();
    await expect(panel.getByTestId('exercise-percent')).not.toHaveText('0 %');
    await panel.getByTestId('exercise-finish').click();
    await expect(panel.getByTestId('exercise-result')).toHaveText('В норме');
    const pct = await panel.getByTestId('exercise-percent').innerText();
    expect(pct).toMatch(/^\d+(,\d)? %$/); // число по локали ru
    await page.screenshot({ path: 'docs/evidence/phase5-K19-mock-recall.png', fullPage: true });
    const pdf = await page.request.get((await panel.getByTestId('exercise-pdf').getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
  });
});

test.describe('K20 отгрузка партии на карантине', () => {
  test.use({ user: 'warehouse' });
  test('K20 отгрузка B-STR-04 (карантин) отклоняется; сообщение называет партию и статус', async ({ page }) => {
    await page.goto('/m/c03');
    const form = page.getByTestId('shipment-form');
    await form.getByLabel('Клиент').selectOption({ index: 1 });
    const opt = await form.getByLabel('Партия').locator('option', { hasText: 'B-STR-04' }).getAttribute('value');
    await form.getByLabel('Партия').selectOption(opt!);
    await form.getByLabel('Количество').fill('10');
    await form.getByTestId('shipment-save').click();
    await expect(form.getByTestId('shipment-error')).toHaveText('Партию B-STR-04 нельзя отгрузить: статус «Карантин»');
    await page.screenshot({ path: 'docs/evidence/phase5-K20-quarantine-shipment.png' });
  });
});
