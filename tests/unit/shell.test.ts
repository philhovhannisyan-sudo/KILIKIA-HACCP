import { describe, expect, it } from 'vitest';
import { GROUPS, MODULES, modulePath, modulesOfGroup } from '../../shared/modules';
import { parseDecimal } from '../../shared/number';
import { formatDateTime, formatNumber } from '../../shared/time';

describe('K1 реестр модулей', () => {
  it('K1 26 модулей в 5 группах (10/3/3/8/2), 7 полных, 19 каркасов, уникальные маршруты', () => {
    expect(MODULES).toHaveLength(26);
    expect(GROUPS.map((g) => modulesOfGroup(g).length)).toEqual([10, 3, 3, 8, 2]);
    expect(MODULES.filter((m) => m.scope === 'full').map((m) => m.code)).toEqual(['A01', 'A02', 'A03', 'A04', 'A10', 'D04', 'E01']);
    expect(MODULES.filter((m) => m.scope === 'scaffold')).toHaveLength(19);
    expect(new Set(MODULES.map((m) => modulePath(m.code))).size).toBe(26);
  });
});

describe('Разбор чисел и форматирование по локали (основа К17)', () => {
  it('запятая и точка дают одно и то же число', () => {
    expect(parseDecimal('85,5')).toBe(85.5);
    expect(parseDecimal('85.5')).toBe(85.5);
    expect(parseDecimal(' 1 234,5 ')).toBe(1234.5);
    expect(parseDecimal('-0,25')).toBe(-0.25);
    expect(parseDecimal(',5')).toBe(0.5);
  });
  it('мусор не является числом', () => {
    for (const s of ['', 'abc', '1,2,3', '1.2.3', '85,5°', '1e5']) expect(parseDecimal(s), s).toBeNull();
  });
  it('даты и числа по локали ru-RU / en-GB / hy-AM в поясе Asia/Yerevan', () => {
    const d = new Date('2026-10-13T08:30:00Z'); // 12:30 в Ереване (UTC+4)
    expect(formatDateTime(d, 'ru')).toContain('12:30');
    expect(formatDateTime(d, 'en')).toContain('12:30');
    expect(formatDateTime(d, 'hy')).toContain('12:30');
    expect(formatNumber(85.5, 'ru')).toBe('85,5');
    expect(formatNumber(85.5, 'en')).toBe('85.5');
    expect(formatNumber(85.5, 'hy')).toBe('85,5');
    expect(formatDateTime(d, 'hy')).toBe('13 հոկտեմբերի 2026 թ., 12:30');
  });
});
