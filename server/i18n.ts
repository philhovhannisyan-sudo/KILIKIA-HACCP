import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDictionaries, interpolate, parseGlossary } from '../shared/i18n/dict';
import { LANGS, type Lang } from '../shared/time';

// Словари на сервере — для печатных форм и экспорта (те же ключи, что в интерфейсе).
const GLOSSARY = fileURLToPath(new URL('../docs/glossary.csv', import.meta.url));
const DICTS = buildDictionaries(parseGlossary(readFileSync(GLOSSARY, 'utf8')));

export const langOf = (v: unknown): Lang => (LANGS as string[]).includes(String(v)) ? (v as Lang) : 'ru';

export function translator(lang: Lang) {
  const dict = DICTS[lang];
  const t = (key: string, params?: Record<string, string | number>) => {
    const v = dict[key];
    if (v === undefined) throw new Error(`i18n: missing key "${key}" for "${lang}"`);
    return interpolate(v, params);
  };
  /** Значение *_i18n: язык → исходный текст пользователя → ru */
  const l = (v: string | Record<string, string> | null | undefined) => {
    if (!v) return '';
    const o = typeof v === 'string' ? (JSON.parse(v) as Record<string, string>) : v;
    return o[lang] ?? o.src ?? o.ru ?? '';
  };
  return { t, l, lang };
}
export type Translator = ReturnType<typeof translator>;
