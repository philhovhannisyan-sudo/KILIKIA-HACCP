// Часовой пояс приложения (brief §3.4). Все моменты хранятся в UTC, показываются в Asia/Yerevan.
export const APP_TIME_ZONE = 'Asia/Yerevan';

export const LOCALES = { ru: 'ru-RU', en: 'en-GB', hy: 'hy-AM' } as const;
export type Lang = keyof typeof LOCALES;
export const LANGS = Object.keys(LOCALES) as Lang[];

export function formatDateTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: APP_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short',
  }).format(d);
}

export function formatDate(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: APP_TIME_ZONE, dateStyle: 'medium' }).format(d);
}

export function formatNumber(n: number, lang: Lang, maxFractionDigits = 3): string {
  return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: maxFractionDigits }).format(n);
}
