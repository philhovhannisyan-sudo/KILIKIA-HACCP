import type { DB } from '../db/connection';
import { ulid } from '../core/ids';

export const L = (ru: string, en: string, hy: string) => JSON.stringify({ ru, en, hy });

export function insert(db: DB, table: string, row: Record<string, unknown>): string {
  const r = { id: ulid(), ...row };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`).run(
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'boolean' ? Number(v) : v])),
  );
  return r.id as string;
}

/** Момент в Ереване (UTC+4, без перехода на летнее время) → UTC ISO. */
export const yerevan = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+04:00`).toISOString();

/** Детерминированный генератор псевдослучайных чисел (mulberry32), чтобы демо-данные были воспроизводимы. */
export function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
