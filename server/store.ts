import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openDb, tablesInInsertOrder, type DB } from './db/connection';
import type { Actor } from './core/actor';
import { appendAudit, lastHash } from './core/audit';
import { clock } from './core/clock';
import { badRequest } from './core/errors';
import { isEmpty, seedAll } from './seed';
import { BACKUP_FORMAT, BACKUP_VERSION, decode, exportState, type StateFile } from './backup/dump';

// Держатель базы: сброс и импорт заменяют файл БД целиком, обработчики всегда берут store.db.
export class Store {
  db!: DB;
  readonly dbPath: string;

  constructor(readonly dataDir: string, fresh = false) {
    mkdirSync(dataDir, { recursive: true });
    this.dbPath = join(dataDir, 'haccp.sqlite');
    if (fresh) this.removeDbFiles(this.dbPath);
    this.db = openDb(this.dbPath);
    if (isEmpty(this.db)) seedAll(this.db);
  }

  close() { this.db.close(); }

  private removeDbFiles(path: string) {
    for (const s of ['', '-wal', '-shm']) rmSync(path + s, { force: true });
  }

  /** Сохраняет состояние в data/backups (перед сбросом и импортом) и возвращает путь. */
  backup(reason: string): string {
    const dir = join(this.dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${clock.nowIso().replace(/[:.]/g, '-')}-${reason}.json.gz`);
    writeFileSync(file, gzipSync(JSON.stringify(exportState(this.db, clock.nowIso()))));
    return file;
  }

  private sessions() {
    return this.db.prepare('SELECT * FROM session').all() as Record<string, unknown>[];
  }

  private restoreSessions(rows: Record<string, unknown>[]) {
    const ins = this.db.prepare('INSERT OR IGNORE INTO session (token_hash, user_id, created_at, expires_at) VALUES (@token_hash, @user_id, @created_at, @expires_at)');
    for (const r of rows) {
      if (this.db.prepare('SELECT 1 FROM user WHERE id = ?').get(r.user_id)) ins.run(r);
    }
  }

  /** Сброс к демо-состоянию (Р-7): бэкап → новая база → сид; цепочка журнала продолжается. */
  reset(actor: Actor): { backupFile: string } {
    const backupFile = this.backup('before-reset');
    const prev = lastHash(this.db);
    const sessions = this.sessions();
    this.db.close();
    this.removeDbFiles(this.dbPath);
    this.db = openDb(this.dbPath);
    seedAll(this.db, prev, 'reset');
    this.db.transaction(() => {
      appendAudit(this.db, actor, { module: 'E02', objectType: 'system', action: 'system.reset', after: { backupFile: backupFile.split(/[\\/]/).pop() } });
    })();
    this.restoreSessions(sessions);
    return { backupFile };
  }

  /** Импорт состояния из файла: проверка формата → новая база во временном файле → подмена. */
  import(actor: Actor, state: StateFile): { backupFile: string } {
    if (state?.format !== BACKUP_FORMAT || state.version !== BACKUP_VERSION || typeof state.tables !== 'object') {
      throw badRequest('import_invalid_format', {}, 'Not a HACCP Suite state file');
    }
    const tmpPath = join(this.dataDir, 'import.tmp.sqlite');
    this.removeDbFiles(tmpPath);
    const tmp = openDb(tmpPath);
    try {
      const known = new Set(tablesInInsertOrder(tmp));
      const unknown = Object.keys(state.tables).filter((t) => !known.has(t));
      if (unknown.length) throw badRequest('import_invalid_format', { tables: unknown }, `Unknown tables: ${unknown.join(', ')}`);
      tmp.pragma('foreign_keys = OFF');
      tmp.transaction(() => {
        for (const t of tablesInInsertOrder(tmp)) {
          if (t === 'schema_migration') continue;
          for (const row of state.tables[t] ?? []) {
            const r = decode(row);
            const cols = Object.keys(r);
            tmp.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`).run(r);
          }
        }
      })();
      const fkErrors = tmp.pragma('foreign_key_check') as unknown[];
      if (fkErrors.length) throw badRequest('import_invalid_format', { foreignKeyErrors: fkErrors.length }, 'Broken references in file');
      tmp.pragma('foreign_keys = ON');
    } catch (e) {
      tmp.close();
      this.removeDbFiles(tmpPath);
      throw e;
    }
    tmp.close();
    const backupFile = this.backup('before-import');
    const sessions = this.sessions();
    this.db.close();
    this.removeDbFiles(this.dbPath);
    renameSync(tmpPath, this.dbPath);
    this.removeDbFiles(tmpPath);
    this.db = openDb(this.dbPath);
    this.db.transaction(() => {
      appendAudit(this.db, actor, { module: 'E02', objectType: 'system', action: 'system.import', after: { exportedAt: state.exportedAt } });
    })();
    this.restoreSessions(sessions);
    return { backupFile };
  }
}

export const dataDirExists = (dir: string) => existsSync(dir);
