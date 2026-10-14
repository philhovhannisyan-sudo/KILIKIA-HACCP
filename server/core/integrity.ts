import type { DB } from '../db/connection';
import { conflict } from './errors';

// Удаление объекта, на который есть ссылки, отклоняется с перечнем блокирующих ссылок (brief §6).
export interface BlockingRef { type: string; count: number; codes: string[] }

const POLYMORPHIC: { table: string; typeCol: string; idCol: string; map: Record<string, string> }[] = [
  { table: 'nonconformity', typeCol: 'source_type', idCol: 'source_id', map: { monitoring: 'monitoring_record', environment: 'env_record', recall: 'trace_exercise', audit: 'internal_audit', claim: 'claim' } },
];

export function blockingRefs(db: DB, table: string, id: string): BlockingRef[] {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
  const out: BlockingRef[] = [];
  for (const t of tables) {
    const fks = (db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string; from: string }[]).filter((f) => f.table === table);
    for (const fk of fks) {
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      const label = cols.includes('code') ? 'code' : cols.includes('number') ? 'number' : 'id';
      const codes = db.prepare(`SELECT ${label} FROM ${t} WHERE ${fk.from} = ? LIMIT 50`).pluck().all(id) as string[];
      if (codes.length) out.push({ type: t, count: db.prepare(`SELECT count(*) FROM ${t} WHERE ${fk.from} = ?`).pluck().get(id) as number, codes: codes.slice(0, 10) });
    }
  }
  for (const p of POLYMORPHIC) {
    const type = Object.entries(p.map).find(([, tbl]) => tbl === table)?.[0];
    if (!type) continue;
    const codes = db.prepare(`SELECT code FROM ${p.table} WHERE ${p.typeCol} = ? AND ${p.idCol} = ?`).pluck().all(type, id) as string[];
    if (codes.length) out.push({ type: p.table, count: codes.length, codes });
  }
  return out;
}

export function assertDeletable(db: DB, table: string, id: string) {
  const refs = blockingRefs(db, table, id);
  if (refs.length) {
    throw conflict('delete_blocked', { refs }, `Cannot delete: referenced by ${refs.map((r) => `${r.type} ×${r.count} (${r.codes.join(', ')})`).join('; ')}`);
  }
}
