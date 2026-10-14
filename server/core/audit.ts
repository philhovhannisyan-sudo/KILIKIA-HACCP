import { createHash } from 'node:crypto';
import type { DB } from '../db/connection';
import type { Actor } from './actor';
import { canonical } from './canonical';
import { clock } from './clock';
import { ulid } from './ids';

// Журнал аудита: только добавление, хэш-цепочка, снимок имени и ролей на момент записи (brief §6, К8).
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  module: string;
  objectType: string;
  objectId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  comment?: string | null;
}

export interface AuditRow {
  seq: number; id: string; at: string; user_id: string | null; user_name_snapshot: string; roles_snapshot: string;
  module: string; object_type: string; object_id: string | null; action: string;
  before: string | null; after: string | null; comment: string | null; prev_hash: string; hash: string;
}

export function hashEntry(r: Omit<AuditRow, 'seq' | 'hash'>): string {
  const payload = canonical([
    r.id, r.at, r.user_id, r.user_name_snapshot, r.roles_snapshot, r.module, r.object_type, r.object_id,
    r.action, r.before, r.after, r.comment, r.prev_hash,
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

export function lastHash(db: DB): string {
  return (db.prepare('SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1').pluck().get() as string | undefined) ?? GENESIS_HASH;
}

/** Добавляет запись. Вызывать внутри той же транзакции, что и изменение данных. */
export function appendAudit(db: DB, actor: Actor, e: AuditInput, prevHashOverride?: string): AuditRow {
  const base = {
    id: ulid(),
    at: clock.nowIso(),
    user_id: actor.id,
    user_name_snapshot: actor.fullName,
    roles_snapshot: JSON.stringify(actor.roles),
    module: e.module,
    object_type: e.objectType,
    object_id: e.objectId ?? null,
    action: e.action,
    before: e.before === undefined ? null : canonical(e.before),
    after: e.after === undefined ? null : canonical(e.after),
    comment: e.comment ?? null,
    prev_hash: prevHashOverride ?? lastHash(db),
  };
  const hash = hashEntry(base);
  const info = db
    .prepare(`INSERT INTO audit_log (id, at, user_id, user_name_snapshot, roles_snapshot, module, object_type, object_id,
      action, before, after, comment, prev_hash, hash) VALUES (@id, @at, @user_id, @user_name_snapshot, @roles_snapshot,
      @module, @object_type, @object_id, @action, @before, @after, @comment, @prev_hash, @hash)`)
    .run({ ...base, hash });
  return { ...base, hash, seq: Number(info.lastInsertRowid) };
}

export interface ChainCheck { ok: boolean; count: number; brokenAtSeq?: number; reason?: string }

/** Проверка целостности: каждая запись ссылается на хэш предыдущей, собственный хэш пересчитывается. */
export function verifyChain(db: DB): ChainCheck {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY seq').all() as AuditRow[];
  let prev: string | null = null;
  for (const r of rows) {
    // Первая запись может продолжать цепочку прежней базы (после сброса), поэтому её prev_hash не сверяется с нулём
    if (prev !== null && r.prev_hash !== prev) return { ok: false, count: rows.length, brokenAtSeq: r.seq, reason: 'prev_hash' };
    const { seq: _seq, hash, ...rest } = r;
    void _seq;
    if (hashEntry(rest) !== hash) return { ok: false, count: rows.length, brokenAtSeq: r.seq, reason: 'hash' };
    prev = hash;
  }
  return { ok: true, count: rows.length };
}
