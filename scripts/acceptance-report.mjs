// Сводит результаты Vitest и Playwright по кодам критериев К1–К26 в docs/03-acceptance.md.
// Тест относится к критерию, если его имя начинается с «K<номер> ».
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const CRITERIA = {
  1: ['Все 26 маршрутов открываются без ошибок и пустых экранов', 1],
  2: ['Переключение ru → en → hy без перезагрузки, ввод сохраняется', 1],
  3: ['Нет горизонтальной прокрутки на 390px во всех 26 разделах', 1],
  4: ['Нет обрезки текста на 390px и 1280px во всех языках', 1],
  5: ['Объёмы демо-данных совпадают с панелью готовности', 2],
  6: ['operator получает отказ сервера на изменение предела ККТ', 2],
  7: ['auditor не видит элементов изменения и формирует пакет', 2],
  8: ['Журнал аудита неизменяем, хэш-цепочка, снимок ролей', 2],
  9: ['Экспорт → сброс → импорт: хэш дампа совпадает', 2],
  10: ['Исправление мониторинга — запись-корректировка', 2],
  11: ['Выход за предел → несоответствие, партия в карантин', 4],
  12: ['P-01 с истёкшей поверкой нельзя выбрать', 4],
  13: ['Мастер 7 экранов, утверждение haccp.lead', 3],
  14: ['Дерево решений детерминировано, тест на каждую ветку', 3],
  15: ['Изменение утверждённого плана без пересмотра отклоняется', 3],
  16: ['ККТ из A01 — та же сущность в A03', 3],
  17: ['«85,5» и «85.5» сохраняются одинаково во всех локалях', 4],
  18: ['Дерево прослеживаемости назад и вперёд', 5],
  19: ['Тестовый отзыв: отчёт, превышение времени → несоответствие', 5],
  20: ['Отгрузка партии на карантине отклоняется', 5],
  21: ['Несоответствие не закрыть без проверки результативности', 6],
  22: ['Чек-лист PRP сохраняет файл-доказательство и печатает его', 6],
  23: ['Пакет для аудита: титул, оглавление, 4 раздела, автор', 7],
  24: ['Цифры пакета совпадают с экранами модулей', 7],
  25: ['19 каркасов: панель, таблица, форма, печать, пометка', 8],
  26: ['Чистая копия, без интернета, сброс, консоль, PDF на hy', 9],
};

// Что критерий пока проверяет не полностью (docs/01-plan.md §4)
const PARTIAL = {
  2: 'печатная форма плана ХАССП проверена; формы остальных модулей — по мере их реализации (фазы 4–8)',
  4: 'проверено в режиме оболочки; повтор на наполненных модулях — фазы 3–8',
  7: 'пакет для аудита проверен; повтор на 19 наполненных каркасах — фаза 8',
};

const results = {}; // code -> [{title, status, duration, error, kind}]
const add = (title, status, duration, error, kind) => {
  const m = /^K(\d+)\b/.exec(title);
  if (!m) return;
  (results[m[1]] ??= []).push({ title, status, duration, error, kind });
};

if (existsSync('reports/vitest.json')) {
  const v = JSON.parse(readFileSync('reports/vitest.json', 'utf8'));
  for (const file of v.testResults ?? [])
    for (const a of file.assertionResults ?? [])
      add(a.title, a.status, a.duration ?? 0, (a.failureMessages ?? []).join('\n'), 'unit');
}
if (existsSync('reports/playwright.json')) {
  const p = JSON.parse(readFileSync('reports/playwright.json', 'utf8'));
  const walk = (suite) => {
    for (const s of suite.suites ?? []) walk(s);
    for (const spec of suite.specs ?? [])
      for (const t of spec.tests ?? []) {
        const r = t.results?.[t.results.length - 1] ?? {};
        add(spec.title, r.status === 'passed' ? 'passed' : r.status ?? 'unknown', r.duration ?? 0, r.error?.message ?? '', 'e2e');
      }
  };
  for (const s of p.suites ?? []) walk(s);
}

const evidence = existsSync('docs/evidence') ? readdirSync('docs/evidence') : [];
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
const rows = [];
let detail = '';
for (const [code, [name, phase]] of Object.entries(CRITERIA)) {
  const rs = results[code] ?? [];
  let status;
  if (rs.length === 0) status = `⏳ не реализован (фаза ${phase})`;
  else if (rs.every((r) => r.status === 'passed')) status = PARTIAL[code] ? '🟡 пройден частично' : '✅ пройден';
  else status = '❌ не пройден';
  const shots = evidence.filter((f) => new RegExp(`-K0?${code}-`).test(f)).map((f) => `[${f}](evidence/${f})`).join(', ');
  const fact = rs.length ? `${rs.filter((r) => r.status === 'passed').length}/${rs.length} тестов зелёные${PARTIAL[code] ? `; не покрыто: ${PARTIAL[code]}` : ''}` : '—';
  rows.push(`| К${code} | ${name} | ${phase} | ${status} | ${fact} | ${shots || '—'} |`);
  if (rs.length) {
    detail += `\n### К${code}\n\n| Тест | Тип | Статус | Время, мс |\n|---|---|---|---|\n`;
    for (const r of rs) detail += `| ${r.title} | ${r.kind} | ${r.status} | ${Math.round(r.duration)} |\n`;
    for (const r of rs.filter((x) => x.status !== 'passed'))
      detail += `\n\`\`\`\n${stripAnsi(r.error).slice(0, 1500)}\n\`\`\`\n`;
  }
}

const out = `# Статус приёмки (docs/03-acceptance.md)

Сформировано автоматически: \`npm test\` → \`scripts/acceptance-report.mjs\`, ${new Date().toISOString()}.
Критерий отмечается пройденным только при зелёных тестах; «частично» — тесты зелёные, но часть критерия относится к следующим фазам.

| Код | Критерий | Фаза | Статус | Фактический результат | Скриншоты |
|---|---|---|---|---|---|
${rows.join('\n')}

## Подробности по тестам
${detail}`;
writeFileSync('docs/03-acceptance.md', out);
console.log('docs/03-acceptance.md обновлён');
