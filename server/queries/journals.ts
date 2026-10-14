import type { DB } from '../db/connection';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Журнал мониторинга ККТ/OPRP за период [from, to) с действующим значением (последняя корректировка). Общий запрос экрана и печати. */
export function monitoringJournal(db: DB, from?: string, to?: string): Row[] {
  const where: string[] = []; const args: unknown[] = [];
  if (from) { where.push('r.event_at >= ?'); args.push(from); }
  if (to) { where.push('r.event_at < ?'); args.push(to); }
  return db.prepare(`SELECT r.*, cp.code AS cp_code, cp.type AS cp_type, pr.code AS param_code, pr.name_i18n AS param_name, pr.unit, pr.kind,
      b.code AS batch_code, e.code AS equipment_code, n.code AS nc_code,
      c.value_num AS corr_value_num, c.value_pass AS corr_value_pass, c.in_limits AS corr_in_limits, c.reason AS corr_reason,
      c.author_name_snapshot AS corr_author, c.at AS corr_at, (SELECT count(*) FROM monitoring_correction x WHERE x.original_id = r.id) AS corrections
    FROM monitoring_record r JOIN control_point cp ON cp.id = r.control_point_id JOIN control_parameter pr ON pr.id = r.parameter_id
    JOIN fg_batch b ON b.id = r.fg_batch_id LEFT JOIN equipment e ON e.id = r.equipment_id
    LEFT JOIN monitoring_correction c ON c.id = (SELECT id FROM monitoring_correction WHERE original_id = r.id ORDER BY at DESC LIMIT 1)
    LEFT JOIN nonconformity n ON n.id = coalesce(c.nc_id, r.nc_id)
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.event_at DESC`).all(...args) as Row[];
}
