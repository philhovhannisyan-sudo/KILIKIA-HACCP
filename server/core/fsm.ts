import type { DB } from '../db/connection';
import { FSM_ENTITIES, type FsmEntity } from '../../shared/fsm';
import type { Actor } from './actor';
import { appendAudit } from './audit';
import { AppError, badRequest, conflict, notFound, unprocessable } from './errors';
import { GUARDS } from './guards';

// Движок конечных автоматов (brief §9): переходы читаются из таблицы fsm_transition.
export interface TransitionRow {
  from_state: string; to_state: string; permission: string; comment_required: number; guards: string;
}

export function availableTransitions(db: DB, machine: string, from: string): TransitionRow[] {
  return db
    .prepare('SELECT from_state, to_state, permission, comment_required, guards FROM fsm_transition WHERE machine = ? AND from_state = ? ORDER BY to_state')
    .all(machine, from) as TransitionRow[];
}

export interface TransitionOptions {
  comment?: string | null;
  /** Системный переход (например, карантин при выходе за предел): право не проверяется, в журнале — фактический инициатор. */
  system?: boolean;
}

/** Выполняет переход. Вызывать внутри транзакции. Возвращает новое состояние. */
export function transition(db: DB, actor: Actor, entity: FsmEntity, id: string, to: string, opts: TransitionOptions = {}): string {
  const def = FSM_ENTITIES[entity];
  if (!def) throw badRequest('unknown_entity', { entity });
  const row = db.prepare(`SELECT status FROM ${def.table} WHERE id = ?`).get(id) as { status: string } | undefined;
  if (!row) throw notFound(entity, id);
  const options = availableTransitions(db, def.machine, row.status);
  const t = options.find((o) => o.to_state === to);
  if (!t) {
    throw conflict('invalid_transition', {
      entity, from: row.status, to,
      available: options.map((o) => ({ to: o.to_state, permission: o.permission, commentRequired: !!o.comment_required })),
    }, `Transition ${row.status} → ${to} is not allowed; available: ${options.map((o) => o.to_state).join(', ') || 'none'}`);
  }
  if (!opts.system && !actor.permissions.has(t.permission)) {
    throw new AppError(403, 'forbidden', { permission: t.permission }, `Missing permission: ${t.permission}`);
  }
  const comment = opts.comment?.trim() || null;
  if (t.comment_required && !comment) throw badRequest('comment_required', { from: row.status, to });
  for (const g of JSON.parse(t.guards) as string[]) {
    const guard = GUARDS[g];
    if (!guard) throw new Error(`Unknown guard ${g}`);
    const failure = guard(db, entity, id);
    if (failure) throw unprocessable('guard_failed', { guard: g, ...failure }, `Condition not met: ${g}`);
  }
  db.prepare(`UPDATE ${def.table} SET status = ? WHERE id = ?`).run(to, id);
  appendAudit(db, actor, {
    module: def.module, objectType: entity, objectId: id, action: 'transition',
    before: { status: row.status }, after: { status: to }, comment,
  });
  return to;
}
