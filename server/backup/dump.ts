import { createHash } from 'node:crypto';
import type { DB } from '../db/connection';
import { tablesInInsertOrder } from '../db/connection';
import { canonical } from '../core/canonical';

// Формат файла состояния (экспорт/импорт, бэкап). BLOB кодируется как {"$b64": "..."}.
export const BACKUP_FORMAT = 'haccp-suite-state';
export const BACKUP_VERSION = 1;

export interface StateFile {
  format: string; version: number; exportedAt: string; tables: Record<string, Record<string, unknown>[]>;
}

const NOT_EXPORTED = new Set(['session']);

function primaryOrder(db: DB, table: string): string {
  const pk = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[])
    .filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  return pk.length ? pk.join(', ') : 'rowid';
}

const encode = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Buffer.isBuffer(v) ? { $b64: v.toString('base64') } : v]));

export const decode = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) =>
    [k, v && typeof v === 'object' && '$b64' in (v as object) ? Buffer.from((v as { $b64: string }).$b64, 'base64') : v]));

export function exportState(db: DB, exportedAt: string): StateFile {
  const tables: StateFile['tables'] = {};
  for (const t of tablesInInsertOrder(db)) {
    if (NOT_EXPORTED.has(t)) continue;
    tables[t] = (db.prepare(`SELECT * FROM ${t} ORDER BY ${primaryOrder(db, t)}`).all() as Record<string, unknown>[]).map(encode);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, tables };
}

// Нормализация дампа для К9 (docs/01-plan.md Р-8): без сессий, журнала входов и системных записей
// журнала аудита об экспорте/сбросе/импорте; строки по первичному ключу; канонический JSON.
const SYSTEM_AUDIT_ACTIONS = new Set(['system.export', 'system.import', 'system.reset']);

export function normalizedDumpHash(db: DB): string {
  const state = exportState(db, '');
  delete state.tables.login_event;
  state.tables.audit_log = state.tables.audit_log.filter((r) => !SYSTEM_AUDIT_ACTIONS.has(r.action as string));
  return createHash('sha256').update(canonical(state.tables)).digest('hex');
}
