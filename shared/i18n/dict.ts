// Словари ru/en/hy + глоссарий терминов (docs/glossary.csv).
// Значение словаря может ссылаться на термин: {term:ccp} или {term:audit_pack|lower}.
import ru from './ru.json';
import en from './en.json';
import hy from './hy.json';
import type { Lang } from '../time';

export type Dict = Record<string, string>;
export type DictKey = keyof typeof ru;

export const RAW_DICTS: Record<Lang, Dict> = { ru, en, hy };

export interface GlossaryRow { key: string; ru: string; en: string; hy: string; hy_status: string }

export function parseGlossary(csv: string): GlossaryRow[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row as unknown as GlossaryRow;
  });
}

const lowerFirst = (s: string) =>
  s.length > 1 && s[1] === s[1].toUpperCase() && s[1] !== s[1].toLowerCase() ? s : s.charAt(0).toLowerCase() + s.slice(1);

/** Строит итоговые словари: подставляет термины, добавляет ключи term.<key>. Бросает ошибку при неизвестном термине. */
export function buildDictionaries(glossary: GlossaryRow[]): Record<Lang, Dict> {
  const out = {} as Record<Lang, Dict>;
  for (const lang of Object.keys(RAW_DICTS) as Lang[]) {
    const terms = new Map(glossary.map((g) => [g.key, g[lang]]));
    const dict: Dict = {};
    for (const g of glossary) dict[`term.${g.key}`] = g[lang];
    for (const [key, value] of Object.entries(RAW_DICTS[lang])) {
      dict[key] = value.replace(/\{term:([a-z_]+)(\|lower)?\}/g, (_, t: string, lower?: string) => {
        const v = terms.get(t);
        if (!v) throw new Error(`Unknown glossary term "${t}" in ${lang}:${key}`);
        return lower ? lowerFirst(v) : v;
      });
    }
    out[lang] = dict;
  }
  return out;
}

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m));
}
