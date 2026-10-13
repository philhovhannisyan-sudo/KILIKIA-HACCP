import type { PlanData } from './types';

export interface ScreenProps {
  data: PlanData;
  editable: boolean;
  save: (url: string, method: 'PUT' | 'POST' | 'DELETE', json?: unknown, okText?: string) => Promise<PlanData | null>;
}

/** Текст из поля *_i18n для редактирования: исходный текст пользователя или значение языка. */
export const editText = (v: string | null | undefined, lang: string): string => {
  if (!v) return '';
  const o = JSON.parse(v) as Record<string, string>;
  return o.src ?? o[lang] ?? o.ru ?? '';
};
