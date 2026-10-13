import { useCallback } from 'react';
import { ApiError } from '../api';
import { useI18n, type TKey } from './I18nProvider';

/** Локализованный текст ошибки сервера: ключ `error.<code>` с параметрами, иначе общий текст. */
export function useErrorText() {
  const { t, has } = useI18n();
  return useCallback((e: unknown): string => {
    if (e instanceof ApiError) {
      const key = `error.${e.code}` as TKey;
      const fmt = (v: unknown): string => {
        if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? String((x as { to?: string; code?: string }).to ?? (x as { code?: string }).code ?? JSON.stringify(x)) : String(x))).join(', ') || '—';
        return v && typeof v === 'object' ? JSON.stringify(v) : String(v);
      };
      const params = Object.fromEntries(Object.entries(e.params).map(([k, v]) => [k, fmt(v)]));
      if (has(key)) return t(key, params);
      return t('error.generic', { message: e.message });
    }
    return t('error.network');
  }, [t, has]);
}
