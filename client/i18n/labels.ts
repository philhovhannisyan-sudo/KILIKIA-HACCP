import type { TKey } from './I18nProvider';

/** Код ККТ/OPRP на языке интерфейса: в данных «CCP-1», в ru — «ККТ-1», в hy — «ՀԿԿ-1» (термин из глоссария). */
export function cpLabel(t: (k: TKey) => string, code: string, type: string): string {
  const n = code.split('-').slice(1).join('-');
  return `${t(type === 'CCP' ? 'term.ccp' : 'term.oprp')}-${n}`;
}
