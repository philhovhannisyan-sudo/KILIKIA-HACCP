import type { DB } from '../../db/connection';
import type { Actor } from '../../core/actor';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { transition } from '../../core/fsm';
import { ulid } from '../../core/ids';
import { addDays } from '../../../shared/time';

/** Следующий код вида NC-001. */
export function nextCode(db: DB, table: string, prefix: string): string {
  const codes = db.prepare(`SELECT code FROM ${table} WHERE code LIKE ?`).pluck().all(`${prefix}-%`) as string[];
  const max = codes.reduce((m, c) => Math.max(m, Number(c.slice(prefix.length + 1)) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export interface DeviationInput {
  sourceType: 'monitoring' | 'environment';
  sourceId: string;
  fgBatchId: string | null;
  cpType: 'CCP' | 'OPRP' | null;
  description: string;
}

/**
 * Выход за предел (brief §5 фаза 4): несоответствие, связанное с записью и партией, карантин партии,
 * уведомление ответственным, записи журнала. Вызывать внутри транзакции записи.
 */
export function registerDeviation(db: DB, actor: Actor, d: DeviationInput): { ncId: string; ncCode: string } {
  const ncId = ulid();
  const ncCode = nextCode(db, 'nonconformity', 'NC');
  const now = clock.nowIso();
  db.prepare(`INSERT INTO nonconformity (id, code, source_type, source_id, fg_batch_id, description, severity, status, registered_at, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'registered', ?, ?)`)
    .run(ncId, ncCode, d.sourceType, d.sourceId, d.fgBatchId, d.description, d.cpType === 'CCP' ? 'major' : 'minor', now, addDays(clock.today(), 14));
  appendAudit(db, actor, { module: 'D04', objectType: 'nonconformity', objectId: ncId, action: 'create', after: { code: ncCode, source: d.sourceType, sourceId: d.sourceId } });

  if (d.fgBatchId) {
    const status = db.prepare('SELECT status FROM fg_batch WHERE id = ?').pluck().get(d.fgBatchId) as string;
    if (status === 'released' || status === 'checks_done') {
      transition(db, actor, 'fg_batch', d.fgBatchId, 'quarantine', { system: true, comment: ncCode });
    }
  }
  const batchCode = d.fgBatchId ? (db.prepare('SELECT code FROM fg_batch WHERE id = ?').pluck().get(d.fgBatchId) as string) : null;
  for (const role of ['haccp_lead', 'qa_lab']) {
    db.prepare(`INSERT INTO notification (id, recipient_role, type, ref_type, ref_id, params, created_at) VALUES (?, ?, ?, 'nonconformity', ?, ?, ?)`)
      .run(ulid(), role, d.sourceType === 'monitoring' ? 'ccp_deviation' : 'env_deviation', ncId, JSON.stringify({ code: ncCode, batch: batchCode }), now);
  }
  return { ncId, ncCode };
}
