import type { DB } from '../db/connection';
import type { Actor } from './actor';
import { afterPlanApproved } from '../modules/plan/service';

// Действия после перехода автомата: ключ «сущность:новое состояние». Выполняются в той же транзакции.
export const AFTER_TRANSITION: Record<string, (db: DB, actor: Actor, id: string) => void> = {
  'haccp_plan:approved': afterPlanApproved,
};
