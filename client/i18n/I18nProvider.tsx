import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import glossaryCsv from '../../docs/glossary.csv?raw';
import { buildDictionaries, interpolate, parseGlossary, type DictKey } from '../../shared/i18n/dict';
import { LANGS, LOCALES, formatDate, formatDateTime, formatNumber, type Lang } from '../../shared/time';

const DICTS = buildDictionaries(parseGlossary(glossaryCsv));
const STORAGE_KEY = 'haccp.lang';

export type TKey = DictKey | `term.${string}` | `module.${string}` | `group.${string}` | `lang.${string}` | `role.${string}` | `error.${string}` | `status.${string}` | `deadline.${string}`;

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
  has: (key: string) => boolean;
  /** Значение из поля *_i18n справочника на текущем языке */
  l: (value: Record<string, string> | string | null | undefined) => string;
  fmtDateTime: (d: Date) => string;
  fmtDate: (d: Date) => string;
  fmtNumber: (n: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  } catch {
    /* хранилище недоступно — язык по умолчанию */
  }
  return 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* не критично */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      locale: LOCALES[lang],
      setLang,
      t: (key, params) => {
        const v = dict[key];
        if (v === undefined) {
          console.error(`i18n: missing key "${key}" for "${lang}"`);
          return key;
        }
        return interpolate(v, params);
      },
      has: (key) => key in dict,
      l: (value) => {
        if (!value) return '';
        const obj = typeof value === 'string' ? (JSON.parse(value) as Record<string, string>) : value;
        return obj[lang] ?? obj.ru ?? '';
      },
      fmtDateTime: (d) => formatDateTime(d, lang),
      fmtDate: (d) => formatDate(d, lang),
      fmtNumber: (n) => formatNumber(n, lang),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
