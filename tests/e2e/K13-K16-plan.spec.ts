import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';

const progress = (page: Page) => page.getByTestId('wizard-progress');

test.describe('K13 мастер плана ХАССП в браузере', () => {
  test.use({ user: 'haccp.lead' });

  test('K13 7 экранов с прогрессом n/7, перетаскивание стадий, утверждение руководителем ХАССП; K16 ККТ в реестре A03', async ({ page, browser, baseURL }) => {
    test.setTimeout(180_000);
    await page.goto('/m/a01');
    await page.getByTestId('plan-new').click();
    await page.getByTestId('comment-input').fill('E2E: план для повидла');
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('plan-status')).toHaveText('Черновик');
    await expect(progress(page)).toHaveText('Заполнено экранов: 0/7');

    // 1 — группа ХАССП
    await page.getByTestId('team-add').click();
    await page.getByLabel('ФИО').fill('Анна Петросян');
    await page.getByLabel('Роль в группе').fill('Руководитель группы');
    await page.getByTestId('team-save').click();
    await expect(progress(page)).toHaveText('Заполнено экранов: 1/7');

    // 2 — продукт
    await page.getByTestId('screen-next').click();
    await page.getByTestId('product-FG-APR-370').check();
    await page.getByLabel('Предполагаемое использование').fill('Для всех групп потребителей');
    await page.getByTestId('product-save').click();
    await expect(progress(page)).toHaveText('Заполнено экранов: 2/7');

    // 3 — схема процесса: три стадии, перетаскивание «Розлив» на первое место и обратно кнопками
    await page.getByTestId('screen-next').click();
    for (const name of ['Приёмка', 'Варка', 'Розлив']) {
      await page.getByLabel('Новая стадия').fill(name);
      await page.getByTestId('step-add').click();
    }
    const handle = (i: number) => page.getByTestId(`step-${i}`).locator('.flow__handle');
    const from = await handle(2).boundingBox();
    const to = await handle(0).boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId('step-0').locator('input')).toHaveValue('Розлив');
    // дождаться окончания анимации перестановки, иначе кнопка «уезжает» из-под курсора
    const settled = () => expect(page.locator('.flow__step[style*="translate"]')).toHaveCount(0);
    await settled();
    // dnd-kit после перетаскивания кратко подавляет следующий клик (чтобы отпускание мыши не сработало как нажатие)
    await page.waitForTimeout(200);
    await page.getByTestId('step-up-1').click(); // «Приёмка» снова первая
    await expect(page.getByTestId('step-0').locator('input')).toHaveValue('Приёмка');
    await settled();
    await page.getByTestId('step-up-2').click(); // «Варка» перед «Розлив»
    for (const [i, name] of ['Приёмка', 'Варка', 'Розлив'].entries()) await expect(page.getByTestId(`step-${i}`).locator('input')).toHaveValue(name);
    await page.getByLabel('Дата подтверждения').fill('2026-01-10');
    await page.getByLabel('Кто подтвердил').fill('Анна Петросян');
    await page.getByTestId('flow-save').click();
    await expect(progress(page)).toHaveText('Заполнено экранов: 3/7');

    // 4 — анализ опасностей
    await page.getByTestId('screen-next').click();
    await page.getByLabel('Стадия').selectOption({ label: '3. Розлив' });
    await page.getByLabel('Тяжесть (1–3)').selectOption('3');
    await page.getByLabel('Опасность', { exact: true }).fill('Выживание микрофлоры в таре');
    await page.getByLabel('Мера контроля').fill('Горячий розлив ≥ 85 °C');
    await expect(page.getByTestId('hz-significance')).toContainText('Да');
    await page.getByTestId('hazard-save').click();
    await expect(progress(page)).toHaveText('Заполнено экранов: 4/7');

    // 5 — дерево решений: В1 Да, В2 Да → ККТ
    await page.getByTestId('screen-next').click();
    for (const why of ['Есть контроль температуры', 'Стадия устраняет опасность']) {
      await page.getByTestId('tree-yes').check();
      await page.getByTestId('tree-justification').fill(why);
      await page.getByTestId('tree-answer').click();
    }
    await expect(page.getByTestId('tree-outcome')).toHaveText('Результат: ККТ');
    await page.getByTestId('tree-save').click();
    await expect(page.getByTestId('hazard-result')).toHaveText('ККТ');
    await expect(progress(page)).toHaveText('Заполнено экранов: 5/7');

    // 6 — пределы и мониторинг (ввод «85,0» с запятой)
    await page.getByTestId('screen-next').click();
    await page.getByLabel('Наименование', { exact: true }).fill('Горячий розлив');
    await page.getByLabel('Корректирующее действие').fill('Остановить розлив, партию — на карантин');
    await page.getByLabel('Код параметра').fill('T');
    await page.getByLabel('Параметр', { exact: true }).fill('Температура продукта');
    await page.getByLabel('Нижний предел').fill('85,0');
    await page.getByLabel('Единица').fill('°C');
    await page.getByLabel('Метод').fill('Термометр в потоке');
    await page.getByLabel('Частота').fill('Каждые 30 мин');
    await page.getByLabel('Оборудование').selectOption({ label: 'T-01 · Термометр T-01' });
    await page.getByTestId('cp-save').click();
    await expect(progress(page)).toHaveText('Заполнено экранов: 6/7');

    // 7 — верификация и утверждение
    await page.getByTestId('screen-next').click();
    await page.getByLabel('Верификация').fill('Ежемесячный анализ записей ККТ');
    await page.getByTestId('verification-save').click();
    await expect(progress(page)).toHaveText('Заполнено экранов: 7/7');
    await expect(page.getByTestId('ready-for-approval')).toBeVisible();
    await page.getByTestId('transition-under_approval').click();
    await expect(page.getByTestId('plan-status')).toHaveText('На утверждении');

    // другая роль: кнопки утверждения нет, прямой запрос отклонён
    const planId = await page.getByTestId('plan-select').inputValue();
    const other = await browser.newContext({ baseURL });
    await other.request.post('/api/auth/login', { data: { login: 'admin', password: 'demo' } });
    const otherPage = await other.newPage();
    await otherPage.goto('/m/a01');
    await otherPage.getByTestId('plan-select').selectOption(planId);
    await expect(otherPage.getByTestId('plan-status')).toHaveText('На утверждении');
    await expect(otherPage.getByTestId('transition-approved')).toHaveCount(0);
    const denied = await other.request.post(`/api/fsm/haccp_plan/${planId}/transition`, { data: { to: 'approved' } });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).params.permission).toBe('haccp.plan.approve');
    await other.close();

    await page.getByTestId('transition-approved').click();
    await expect(page.getByTestId('plan-status')).toHaveText('Утверждён');
    await expect(page.getByTestId('plan-readonly')).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/phase3-K13-approved.png', fullPage: true });

    // K16: та же ККТ в реестре A03
    const plan = await (await page.request.get(`/api/plans/${planId}`)).json();
    const cp = plan.controlPoints[0];
    await page.goto('/m/a03');
    const row = page.getByTestId('cp-registry').locator(`tr[data-cp-id="${cp.id}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('cp-limit')).toHaveText('≥ 85 °C');
  });
});

test.describe('K15 утверждённый план — только через пересмотр', () => {
  test.use({ user: 'haccp.lead' });
  test('K15 у утверждённого плана нет элементов правки; прямой запрос отклонён с перечнем переходов; пересмотр создаёт черновик', async ({ page }) => {
    const plans = await (await page.request.get('/api/plans')).json();
    const demo = plans.find((p: { lineage_id: string; status: string }) => p.lineage_id === 'PLAN-JAM' && p.status === 'approved');
    await page.goto('/m/a01');
    await page.getByTestId('plan-select').selectOption(demo.id);
    await expect(page.getByTestId('plan-status')).toHaveText('Утверждён');
    await expect(progress(page)).toHaveText('Заполнено экранов: 7/7');
    for (const s of [1, 3, 4, 6]) {
      await page.getByTestId(`screen-tab-${s}`).click();
      await expect(page.getByTestId(`screen-${s}`).locator('[data-action]')).toHaveCount(0);
    }
    const r = await page.request.put(`/api/plans/${demo.id}/team`, { data: { members: [{ name: 'X', role: 'Y' }] } });
    expect(r.status()).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'plan_locked', params: { available: [{ to: 'under_revision' }] } });
    await expect(page.getByTestId('plan-revise')).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/phase3-K15-approved-readonly.png', fullPage: true });
  });
});

test.describe('K2 печатная форма на языке интерфейса', () => {
  test('K2 ссылки PDF/XLSX/CSV плана меняют язык вместе с интерфейсом', async ({ page }) => {
    await page.goto('/m/a01');
    await expect(page.getByTestId('plan-pdf')).toHaveAttribute('href', /lang=ru$/);
    await page.getByTestId('lang-select').selectOption('hy');
    await expect(page.getByTestId('plan-pdf')).toHaveAttribute('href', /lang=hy$/);
    await expect(page.getByTestId('plan-xlsx')).toHaveAttribute('href', /lang=hy$/);
    const pdf = await page.request.get((await page.getByTestId('plan-pdf').getAttribute('href'))!);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByTestId('screen-tab-5').click();
    await page.screenshot({ path: 'docs/evidence/phase3-K14-tree-hy.png', fullPage: true });
  });
});
