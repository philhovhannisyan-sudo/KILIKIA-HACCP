// Реестр 26 модулей HACCP Suite (docs/00-brief.md §4). Единственный источник для меню, маршрутов и тестов.
export type GroupCode = 'A' | 'B' | 'C' | 'D' | 'E';
export type ModuleScope = 'full' | 'scaffold';

export interface ModuleDef {
  code: string; // A01 …
  group: GroupCode;
  scope: ModuleScope;
}

export const GROUPS: GroupCode[] = ['A', 'B', 'C', 'D', 'E'];

const FULL = new Set(['A01', 'A02', 'A03', 'A04', 'A10', 'D04', 'E01']);

const CODES: Record<GroupCode, string[]> = {
  A: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'],
  B: ['B01', 'B02', 'B03'],
  C: ['C01', 'C02', 'C03'],
  D: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08'],
  E: ['E01', 'E02'],
};

export const MODULES: ModuleDef[] = GROUPS.flatMap((group) =>
  CODES[group].map((code) => ({ code, group, scope: FULL.has(code) ? 'full' : 'scaffold' }) as ModuleDef),
);

export const modulePath = (code: string) => `/m/${code.toLowerCase()}`;
export const findModule = (code: string) => MODULES.find((m) => m.code.toLowerCase() === code.toLowerCase());
export const modulesOfGroup = (g: GroupCode) => MODULES.filter((m) => m.group === g);

// Ключи словаря, которые обязан иметь каждый модуль и каждая группа
export const moduleKeys = (code: string) => [`module.${code}.title`, `module.${code}.summary`];
export const groupKeys = (g: GroupCode) => [`group.${g}`];
