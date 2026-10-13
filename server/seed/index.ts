import type { DB } from '../db/connection';
import { SYSTEM_ACTOR } from '../core/actor';
import { appendAudit } from '../core/audit';
import { clock } from '../core/clock';
import { seedBase } from './base';
import { seedDemo } from './demo';
import { countEntities } from '../queries/stats';

/** Заполняет пустую базу: справочники + демо-данные. Одна транзакция, одна запись в журнале. */
export function seedAll(db: DB, prevHash?: string, comment?: string) {
  db.transaction(() => {
    const roles = seedBase(db);
    seedDemo(db, clock.today(), roles);
    appendAudit(db, SYSTEM_ACTOR, { module: 'E02', objectType: 'system', action: 'seed', after: countEntities(db), comment: comment ?? null }, prevHash);
  })();
}

export const isEmpty = (db: DB) => (db.prepare('SELECT count(*) FROM user').pluck().get() as number) === 0;
