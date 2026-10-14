// Разбор десятичных чисел: запятая и точка допустимы во всех локалях (brief §8).
// Возвращает нормализованное число или null, если строка не является числом.
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/[\s  ]/g, '');
  if (s === '') return null;
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
