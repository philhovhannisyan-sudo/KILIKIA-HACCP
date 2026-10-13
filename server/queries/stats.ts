import type { DB } from '../db/connection';

// Объёмы данных (К5). Тот же код используют сид (запись в журнал), API /api/stats и тесты.
const ENTITIES = [
  'site', 'user', 'product', 'recipe', 'material', 'material_lot', 'fg_batch', 'batch_consumption', 'supplier', 'customer',
  'shipment', 'shipment_line', 'warehouse', 'stock', 'equipment', 'haccp_plan', 'process_step', 'hazard', 'control_point',
  'control_parameter', 'monitoring_record', 'monitoring_correction', 'env_point', 'env_record', 'nonconformity', 'capa',
  'prp', 'prp_checklist', 'trace_exercise', 'lab_sample', 'internal_audit', 'claim', 'document', 'scaffold_record',
] as const;

export type EntityCounts = Record<(typeof ENTITIES)[number], number> & {
  ccp: number; oprp: number; monitoring_out_of_limits: number; fg_quarantine: number; env_days: number;
};

export function countEntities(db: DB): EntityCounts {
  const c = Object.fromEntries(ENTITIES.map((t) => [t, db.prepare(`SELECT count(*) FROM ${t}`).pluck().get() as number])) as EntityCounts;
  const one = (sql: string) => db.prepare(sql).pluck().get() as number;
  c.ccp = one("SELECT count(*) FROM control_point WHERE type = 'CCP' AND active = 1");
  c.oprp = one("SELECT count(*) FROM control_point WHERE type = 'OPRP' AND active = 1");
  c.monitoring_out_of_limits = one('SELECT count(*) FROM monitoring_record WHERE in_limits = 0');
  c.fg_quarantine = one("SELECT count(*) FROM fg_batch WHERE status = 'quarantine'");
  c.env_days = one("SELECT count(DISTINCT substr(event_at, 1, 10)) FROM env_record");
  return c;
}
