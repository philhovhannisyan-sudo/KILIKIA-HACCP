import type { DB } from '../db/connection';
import { addDays } from '../../shared/time';

// Показатели панели готовности (brief §10). Эти же функции используют модули и отчёты: расхождение цифр — дефект.
const setting = (db: DB, key: string) => JSON.parse(db.prepare('SELECT value FROM setting WHERE key = ?').pluck().get(key) as string);
const one = (db: DB, sql: string, ...a: unknown[]) => db.prepare(sql).pluck().get(...a) as number;

/** Правила зачёта пунктов (regulatory-refs.md §5, DEMO). Возвращает true, если пункт покрыт на дату `today`. */
export const READINESS_RULES: Record<string, (db: DB, today: string) => boolean> = {
  approved_haccp_plan: (db) => one(db, "SELECT count(*) FROM haccp_plan WHERE status = 'approved'") > 0,
  current_document: (db) => one(db, "SELECT count(*) FROM document WHERE status = 'current'") > 0,
  prp_checked_on_time: (db, today) =>
    one(db, "SELECT count(*) FROM prp WHERE status = 'active' AND (last_checked_date IS NULL OR date(last_checked_date, '+' || frequency_days || ' days') < ?)", today) === 0
    && one(db, "SELECT count(*) FROM prp WHERE status = 'active'") > 0,
  trace_test_12m: (db, today) =>
    one(db, 'SELECT count(*) FROM trace_exercise WHERE finished_at IS NOT NULL AND substr(started_at, 1, 10) >= ?', addDays(today, -365)) > 0,
  approved_plan_with_hazards: (db) =>
    one(db, "SELECT count(*) FROM haccp_plan p WHERE p.status = 'approved' AND EXISTS (SELECT 1 FROM hazard h WHERE h.plan_id = p.id)") > 0,
  no_overdue_calibration: (db, today) => overdueCalibration(db, today).length === 0,
  verification_30d: (db, today) => {
    const from = addDays(today, -Number(setting(db, 'verification_window_days')));
    return one(db, 'SELECT count(*) FROM capa WHERE eff_checked_date >= ?', from)
      + one(db, "SELECT count(*) FROM prp_checklist WHERE performed_date >= ? AND status = 'completed'", from)
      + one(db, 'SELECT count(*) FROM trace_exercise WHERE finished_at IS NOT NULL AND substr(started_at, 1, 10) >= ?', from) > 0;
  },
  no_overdue_nc: (db, today) => one(db, "SELECT count(*) FROM nonconformity WHERE status <> 'closed' AND due_date < ?", today) === 0,
  internal_audit_12m: (db, today) =>
    one(db, "SELECT count(*) FROM internal_audit WHERE status = 'completed' AND audit_date >= ? AND audit_date <= ?", addDays(today, -365), today) > 0,
  management_review_12m: (db, today) =>
    one(db, "SELECT count(*) FROM scaffold_record WHERE module = 'D08' AND json_extract(data, '$.status') = 'completed' AND record_date >= ?", addDays(today, -365)) > 0,
  no_overdue_capa: (db, today) => openCapa(db, today).filter((c) => c.overdue).length === 0,
};

export interface ClauseStatus { id: string; standard: string; number: string; shortName: Record<string, string>; rule: string; covered: boolean; verifyStatus: string }

export function readiness(db: DB, today: string) {
  const rows = db.prepare('SELECT * FROM standard_clause ORDER BY ord').all() as
    { id: string; standard: string; number: string; short_name_i18n: string; rule_code: string; verify_status: string }[];
  const clauses: ClauseStatus[] = rows.map((r) => {
    const rule = READINESS_RULES[r.rule_code];
    if (!rule) throw new Error(`Unknown readiness rule ${r.rule_code}`);
    return { id: r.id, standard: r.standard, number: r.number, shortName: JSON.parse(r.short_name_i18n), rule: r.rule_code, covered: rule(db, today), verifyStatus: r.verify_status };
  });
  const covered = clauses.filter((c) => c.covered).length;
  return { percent: clauses.length ? Math.round((covered / clauses.length) * 100) : 0, covered, total: clauses.length, clauses };
}

export function openCapa(db: DB, today: string) {
  return (db.prepare(`SELECT c.id, c.code, c.action, c.due_date AS dueDate, c.status, n.code AS ncCode, u.full_name AS owner
      FROM capa c JOIN nonconformity n ON n.id = c.nc_id JOIN user u ON u.id = c.owner_id
      WHERE c.status NOT IN ('verified', 'closed') ORDER BY c.due_date`).all() as
    { id: string; code: string; action: string; dueDate: string; status: string; ncCode: string; owner: string }[])
    .map((c) => ({ ...c, overdue: c.dueDate < today }));
}

/** Поверка действительна по next_cal_date включительно (Р-19). */
export function overdueCalibration(db: DB, today: string) {
  return db.prepare('SELECT id, code, name_i18n AS name, next_cal_date AS nextCalDate FROM equipment WHERE next_cal_date < ? ORDER BY code')
    .all(today).map((r) => ({ ...(r as object), name: JSON.parse((r as { name: string }).name) })) as
    { id: string; code: string; name: Record<string, string>; nextCalDate: string }[];
}

export function quarantineBatches(db: DB) {
  return db.prepare(`SELECT * FROM (
    SELECT b.id, b.code, 'fg' AS kind, p.name_i18n AS name, b.produced_date AS date FROM fg_batch b JOIN product p ON p.id = b.product_id WHERE b.status = 'quarantine'
    UNION ALL
    SELECT l.id, l.code, 'material' AS kind, m.name_i18n AS name, l.received_date AS date FROM material_lot l JOIN material m ON m.id = l.material_id WHERE l.status = 'quarantine'
    ) ORDER BY code`).all().map((r) => ({ ...(r as object), name: JSON.parse((r as { name: string }).name) })) as
    { id: string; code: string; kind: 'fg' | 'material'; name: Record<string, string>; date: string }[];
}

/** Последние отклонения ККТ/OPRP с учётом корректировок: действующее значение — последняя корректировка. */
export function recentDeviations(db: DB, limit = 5) {
  return db.prepare(`
    SELECT r.id, r.event_at AS eventAt, cp.code AS cpCode, cp.type AS cpType, pr.name_i18n AS parameter, pr.unit,
           coalesce(c.value_num, r.value_num) AS value, b.code AS batchCode, n.code AS ncCode
    FROM monitoring_record r
    JOIN control_point cp ON cp.id = r.control_point_id JOIN control_parameter pr ON pr.id = r.parameter_id
    JOIN fg_batch b ON b.id = r.fg_batch_id
    LEFT JOIN monitoring_correction c ON c.id = (SELECT id FROM monitoring_correction WHERE original_id = r.id ORDER BY at DESC LIMIT 1)
    LEFT JOIN nonconformity n ON n.id = coalesce(c.nc_id, r.nc_id)
    WHERE coalesce(c.in_limits, r.in_limits) = 0
    ORDER BY r.event_at DESC LIMIT ?`).all(limit).map((r) => ({ ...(r as object), parameter: JSON.parse((r as { parameter: string }).parameter) }));
}

/** Ближайшие сроки на 30 дней: пересмотр документов, поверки, проверки PRP, сроки CAPA. */
export function upcomingDeadlines(db: DB, today: string, days = 30) {
  const to = addDays(today, days);
  return db.prepare(`SELECT * FROM (
    SELECT 'document_review' AS kind, code, review_due_date AS date FROM document WHERE status = 'current' AND review_due_date BETWEEN ? AND ?
    UNION ALL SELECT 'calibration', code, next_cal_date FROM equipment WHERE next_cal_date BETWEEN ? AND ?
    UNION ALL SELECT 'prp_check', code, date(last_checked_date, '+' || frequency_days || ' days') FROM prp
      WHERE status = 'active' AND date(last_checked_date, '+' || frequency_days || ' days') BETWEEN ? AND ?
    UNION ALL SELECT 'capa_due', code, due_date FROM capa WHERE status NOT IN ('verified','closed') AND due_date BETWEEN ? AND ?
    ) ORDER BY date, code`).all(today, to, today, to, today, to, today, to) as { kind: string; code: string; date: string }[];
}

export function dashboard(db: DB, today: string) {
  const capa = openCapa(db, today);
  return {
    today,
    readiness: readiness(db, today),
    openCapa: { count: capa.length, overdue: capa.filter((c) => c.overdue).length, items: capa },
    overdueCalibration: (() => { const items = overdueCalibration(db, today); return { count: items.length, items }; })(),
    quarantine: (() => { const items = quarantineBatches(db); return { count: items.length, items }; })(),
    recentDeviations: recentDeviations(db),
    upcoming: upcomingDeadlines(db, today),
  };
}
