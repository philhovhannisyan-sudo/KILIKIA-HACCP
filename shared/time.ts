// Часовой пояс приложения (brief §3.4). Все моменты хранятся в UTC, показываются в Asia/Yerevan.
export const APP_TIME_ZONE = 'Asia/Yerevan';

export const LOCALES = { ru: 'ru-RU', en: 'en-GB', hy: 'hy-AM' } as const;
export type Lang = keyof typeof LOCALES;
export const LANGS = Object.keys(LOCALES) as Lang[];

// Армянский формат собран вручную: в части сборок браузеров (в т. ч. Chromium) нет данных ICU для hy-AM,
// и Intl молча возвращает английский формат. Месяцы — в родительном падеже, 24-часовое время.
const HY_MONTHS = ['հունվարի', 'փետրվարի', 'մարտի', 'ապրիլի', 'մայիսի', 'հունիսի', 'հուլիսի', 'օգոստոսի', 'սեպտեմբերի', 'հոկտեմբերի', 'նոյեմբերի', 'դեկտեմբերի'];

function partsIn(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: p.year, m: Number(p.month), day: Number(p.day), hh: p.hour, mm: p.minute };
}

export function formatDate(d: Date, lang: Lang): string {
  if (lang === 'hy') { const p = partsIn(d); return `${p.day} ${HY_MONTHS[p.m - 1]} ${p.y} թ.`; }
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: APP_TIME_ZONE, dateStyle: 'medium' }).format(d);
}

export function formatDateTime(d: Date, lang: Lang): string {
  if (lang === 'hy') { const p = partsIn(d); return `${formatDate(d, lang)}, ${p.hh}:${p.mm}`; }
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: APP_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatNumber(n: number, lang: Lang, maxFractionDigits = 3): string {
  // hy: десятичная запятая и пробел-разделитель тысяч, как в ru-RU
  return new Intl.NumberFormat(lang === 'hy' ? LOCALES.ru : LOCALES[lang], { maximumFractionDigits: maxFractionDigits }).format(n);
}

/** Деловая дата YYYY-MM-DD в Asia/Yerevan. */
export function businessDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Сдвиг деловой даты на n дней. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
