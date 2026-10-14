import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export type DB = Database.Database;
const MIGRATIONS = fileURLToPath(new URL('./migrations', import.meta.url));

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migration (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migration').pluck().all() as string[]);
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.transaction(() => {
      db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
      db.prepare('INSERT INTO schema_migration (name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
    })();
  }
}

/** Бизнес-таблицы в порядке, допустимом для вставки (родители раньше детей). */
export function tablesInInsertOrder(db: DB): string[] {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migration'")
    .pluck()
    .all() as string[];
  const deps = new Map(tables.map((t) => [t, (db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string }[]).map((r) => r.table).filter((x) => x !== t)]));
  const out: string[] = [];
  const visit = (t: string, stack: Set<string>) => {
    if (out.includes(t) || stack.has(t)) return;
    stack.add(t);
    for (const d of deps.get(t) ?? []) visit(d, stack);
    out.push(t);
  };
  for (const t of tables.sort()) visit(t, new Set());
  return out;
}
