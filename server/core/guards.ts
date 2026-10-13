import type { DB } from '../db/connection';
import { completeness } from '../modules/plan/service';

// Проверки-условия переходов. Возвращают null, если условие выполнено, иначе — параметры для сообщения.
type Guard = (db: DB, entity: string, id: string) => Record<string, unknown> | null;

const one = (db: DB, sql: string, ...args: unknown[]) => db.prepare(sql).pluck().get(...args) as number;

export const GUARDS: Record<string, Guard> = {
  ncRootCauseFilled: (db, _e, id) =>
    one(db, "SELECT count(*) FROM nonconformity WHERE id = ? AND trim(coalesce(root_cause, '')) <> ''", id) ? null : {},
  ncHasCapa: (db, _e, id) => (one(db, 'SELECT count(*) FROM capa WHERE nc_id = ?', id) ? null : {}),
  ncAllCapaDone: (db, _e, id) => {
    const open = one(db, "SELECT count(*) FROM capa WHERE nc_id = ? AND status IN ('planned','in_progress')", id);
    return open ? { openCapa: open } : null;
  },
  // К21: несоответствие закрывается только при заполненной проверке результативности всех CAPA
  ncCapaEffectivenessFilled: (db, _e, id) => {
    const missing = db
      .prepare("SELECT code FROM capa WHERE nc_id = ? AND (eff_checked_date IS NULL OR trim(coalesce(eff_result, '')) = '')")
      .pluck().all(id) as string[];
    const total = one(db, 'SELECT count(*) FROM capa WHERE nc_id = ?', id);
    if (!total) return { capa: [] };
    return missing.length ? { capa: missing } : null;
  },
  capaEffectivenessFilled: (db, _e, id) =>
    one(db, "SELECT count(*) FROM capa WHERE id = ? AND eff_checked_date IS NOT NULL AND trim(coalesce(eff_result,'')) <> ''", id) ? null : {},
  batchNoOpenNc: (db, entity, id) => {
    const col = entity === 'fg_batch' ? 'fg_batch_id' : 'material_lot_id';
    const codes = db.prepare(`SELECT code FROM nonconformity WHERE ${col} = ? AND status <> 'closed'`).pluck().all(id) as string[];
    return codes.length ? { nc: codes } : null;
  },
  // brief §6: партия ГП без связей с сырьём не может быть выпущена
  batchHasConsumption: (db, entity, id) =>
    entity !== 'fg_batch' || one(db, 'SELECT count(*) FROM batch_consumption WHERE fg_batch_id = ?', id) ? null : {},
  // Полные условия появятся вместе с мастером A01 (фаза 3)
  // Все 7 экранов мастера заполнены, нет опасностей без результата или с «требуется изменение»
  planReadyForApproval: (db, _e, id) => {
    const c = completeness(db, id);
    const missing = Object.entries(c).filter(([, ok]) => !ok).map(([s]) => Number(s));
    return missing.length ? { screens: missing } : null;
  },
  planNewVersionApproved: (db, _e, id) =>
    one(db, `SELECT count(*) FROM haccp_plan p JOIN haccp_plan o ON o.lineage_id = p.lineage_id
             WHERE o.id = ? AND p.version > o.version AND p.status = 'approved'`, id) ? null : {},
};
