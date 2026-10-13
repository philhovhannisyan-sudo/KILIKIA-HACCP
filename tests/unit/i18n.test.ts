import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { RAW_DICTS, buildDictionaries, parseGlossary } from '../../shared/i18n/dict';
import { GROUPS, MODULES, groupKeys, moduleKeys } from '../../shared/modules';
import { LANGS } from '../../shared/time';

const glossary = parseGlossary(readFileSync('docs/glossary.csv', 'utf8'));
const dicts = buildDictionaries(glossary);

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(p) ? [p] : [];
  });
}

describe('K2 словарь ru/en/hy', () => {
  it('K2 одинаковые ключи во всех языках, пустых значений нет', () => {
    const ruKeys = Object.keys(RAW_DICTS.ru).sort();
    for (const lang of LANGS) {
      expect(Object.keys(RAW_DICTS[lang]).sort(), lang).toEqual(ruKeys);
      for (const [k, v] of Object.entries(dicts[lang])) expect(v.trim(), `${lang}:${k}`).not.toBe('');
    }
  });

  it('K2 у каждой группы и каждого из 26 модулей есть название и описание на всех языках', () => {
    const keys = [...GROUPS.flatMap(groupKeys), ...MODULES.flatMap((m) => moduleKeys(m.code))];
    for (const lang of LANGS) for (const k of keys) expect(dicts[lang][k], `${lang}:${k}`).toBeTruthy();
  });

  it('K2 каждый ключ, использованный в коде клиента, есть в словаре', () => {
    const used = new Set<string>();
    for (const f of files('client', /\.tsx?$/)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([\w.]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(20);
    for (const lang of LANGS) for (const k of used) expect(dicts[lang][k], `${lang}:${k}`).toBeDefined();
  });

  it('K2 глоссарий: 40–60 терминов, три языка, пометка о вычитке hy', () => {
    expect(glossary.length).toBeGreaterThanOrEqual(40);
    expect(glossary.length).toBeLessThanOrEqual(60);
    expect(new Set(glossary.map((g) => g.key)).size).toBe(glossary.length);
    for (const g of glossary) {
      expect(g.ru && g.en && g.hy, g.key).toBeTruthy();
      expect(g.hy_status, g.key).toMatch(/вычитки/);
    }
  });

  it('K2 ссылка на неизвестный термин — ошибка, а не пустая строка', () => {
    expect(() => buildDictionaries(glossary.filter((g) => g.key !== 'haccp'))).toThrow(/Unknown glossary term "haccp"/);
  });
});

describe('UI без зашитых строк и без alert/confirm/prompt (CLAUDE.md)', () => {
  const sources = files('client', /\.tsx$/).map((f) => ({ f, src: readFileSync(f, 'utf8') }));
  const LETTER = /[A-Za-zА-Яа-яЁёԱ-֏]/;

  it('в JSX нет текстовых литералов (проверка по AST)', () => {
    const bad: string[] = [];
    const ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label']);
    for (const { f, src } of sources) {
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node) => {
        if (ts.isJsxText(n) && LETTER.test(n.text)) bad.push(`${f}: «${n.text.trim()}»`);
        if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)
          && ATTRS.has(n.name.getText()) && LETTER.test(n.initializer.text)) bad.push(`${f}: ${n.name.getText()}="${n.initializer.text}"`);
        if (ts.isJsxExpression(n) && n.expression && ts.isStringLiteral(n.expression) && LETTER.test(n.expression.text)
          && !ts.isJsxAttribute(n.parent)) bad.push(`${f}: {'${n.expression.text}'}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });

  it('нет вызовов alert/confirm/prompt', () => {
    for (const { f, src } of sources) expect(src, f).not.toMatch(/\b(window\.)?(alert|confirm|prompt)\s*\(/);
  });
});
