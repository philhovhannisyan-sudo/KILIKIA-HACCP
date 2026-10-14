import type { DB } from '../db/connection';
import { exerciseReport } from './trace';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Выборки «за период» [from, to) в UTC ISO. Один и тот же код используют экраны модулей,
// конструктор отчётов и пакет для аудита (brief §5 фаза 7, К24).
const day = (iso: string) => iso.slice(0, 10);

/** Версии плана ХАССП, действовавшие в периоде (Р-16). */
export function plansInPeriod(db: DB, from: string, to: string): Row[] {
  return db.prepare(`SELECT id, version, status, lineage_id, effective_from, effective_to FROM haccp_plan
    WHERE effective_from IS NOT NULL AND effective_from < ? AND (effective_to IS NULL OR effective_to >= ?) ORDER BY lineage_id, version`)
    .all(day(to), day(from)) as Row[];
}

export function exercisesInPeriod(db: DB, from?: string, to?: string): Row[] {
  const ids = db.prepare(`SELECT id FROM trace_exercise WHERE (? IS NULL OR started_at >= ?) AND (? IS NULL OR started_at < ?) ORDER BY started_at DESC`)
    .pluck().all(from ?? null, from ?? null, to ?? null, to ?? null) as string[];
  return ids.map((id) => exerciseReport(db, id));
}

export function nonconformitiesInPeriod(db: DB, from?: string, to?: string): Row[] {
  return db.prepare(`SELECT n.*, b.code AS batch_code, m.code AS lot_code FROM nonconformity n LEFT JOIN fg_batch b ON b.id = n.fg_batch_id
    LEFT JOIN material_lot m ON m.id = n.material_lot_id WHERE (? IS NULL OR n.registered_at >= ?) AND (? IS NULL OR n.registered_at < ?)
    ORDER BY n.registered_at DESC`).all(from ?? null, from ?? null, to ?? null, to ?? null) as Row[];
}

/** CAPA за период: по несоответствиям, зарегистрированным в периоде, или с проверкой результативности в периоде. */
export function capaInPeriod(db: DB, from: string, to: string): Row[] {
  return db.prepare(`SELECT c.*, n.code AS nc_code, n.description AS nc_description, u.full_name AS owner_name, v.full_name AS eff_checked_by_name
    FROM capa c JOIN nonconformity n ON n.id = c.nc_id JOIN user u ON u.id = c.owner_id LEFT JOIN user v ON v.id = c.eff_checked_by
    WHERE (n.registered_at >= ? AND n.registered_at < ?) OR (c.eff_checked_date >= ? AND c.eff_checked_date < ?) ORDER BY c.code`)
    .all(from, to, day(from), day(to)) as Row[];
}

export function prpChecklistsInPeriod(db: DB, from: string, to: string): Row[] {
  return db.prepare(`SELECT c.*, p.code AS prp_code, p.description_i18n AS prp_description, u.full_name AS performed_by_name,
      (SELECT count(*) FROM prp_checklist_item i WHERE i.checklist_id = c.id) AS items,
      (SELECT count(*) FROM prp_checklist_item i WHERE i.checklist_id = c.id AND i.file_id IS NOT NULL) AS files
    FROM prp_checklist c JOIN prp p ON p.id = c.prp_id JOIN user u ON u.id = c.performed_by
    WHERE c.performed_date >= ? AND c.performed_date < ? ORDER BY c.performed_date DESC`).all(day(from), day(to)) as Row[];
}
