import type { DB } from '../../db/connection';
import type { Translator } from '../../i18n';
import { formatDate, formatDateTime } from '../../../shared/time';
import { monitoringJournal } from '../../queries/journals';
import { capaInPeriod, exercisesInPeriod, nonconformitiesInPeriod, prpChecklistsInPeriod } from '../../queries/period';
import { envRecords } from '../monitoring/routes';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Cell = string | number | null;

export interface Field { key: string; label: string; value: (r: Row, tr: Translator) => Cell }
export interface Source { key: string; module: string; label: string; fields: Field[]; rows: (db: DB, from: string, to: string) => Row[] }

const nf = (tr: Translator, n: number | null) => (n === null || n === undefined ? null : new Intl.NumberFormat(tr.lang === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: 3 }).format(n));
const dt = (tr: Translator, iso: string | null) => (iso ? formatDateTime(new Date(iso), tr.lang) : null);
const d = (tr: Translator, s: string | null) => (s ? formatDate(new Date(`${s.slice(0, 10)}T12:00:00Z`), tr.lang) : null);
const cp = (tr: Translator, code: string, type: string) => `${tr.t(type === 'CCP' ? 'term.ccp' : 'term.oprp')}-${code.split('-').slice(1).join('-')}`;

/** Источники конструктора отчётов (E01). Строки — те же общие запросы, что на экранах модулей. */
export const SOURCES: Source[] = [
  {
    key: 'monitoring', module: 'A03', label: 'mon.journal', rows: (db, f, t) => monitoringJournal(db, f, t),
    fields: [
      { key: 'time', label: 'mon.col.time', value: (r, tr) => dt(tr, r.event_at) },
      { key: 'cp', label: 'plan.col.code', value: (r, tr) => cp(tr, r.cp_code, r.cp_type) },
      { key: 'parameter', label: 'plan.col.parameter', value: (r, tr) => tr.l(r.param_name) },
      { key: 'batch', label: 'mon.col.batch', value: (r) => r.batch_code },
      { key: 'value', label: 'mon.col.value', value: (r, tr) => (r.kind === 'numeric' ? nf(tr, r.corr_value_num ?? r.value_num) : tr.t((r.corr_value_pass ?? r.value_pass) ? 'mon.pass' : 'mon.fail')) },
      { key: 'status', label: 'mon.col.status', value: (r, tr) => tr.t((r.corr_in_limits ?? r.in_limits) ? 'mon.inLimits' : 'mon.outOfLimits') },
      { key: 'operator', label: 'mon.col.operator', value: (r) => r.operator_name_snapshot },
      { key: 'nc', label: 'mon.col.nc', value: (r) => r.nc_code },
    ],
  },
  {
    key: 'environment', module: 'A10', label: 'env.journal', rows: (db, f, t) => envRecords(db, f, t),
    fields: [
      { key: 'time', label: 'mon.col.time', value: (r, tr) => dt(tr, r.event_at) },
      { key: 'point', label: 'env.col.point', value: (r) => r.point_code },
      { key: 'zone', label: 'env.col.zone', value: (r, tr) => tr.l(r.zone_i18n) },
      { key: 'kind', label: 'env.col.kind', value: (r, tr) => tr.t(`env.kind.${r.kind}`) },
      { key: 'value', label: 'mon.col.value', value: (r, tr) => nf(tr, r.effective_value) },
      { key: 'status', label: 'mon.col.status', value: (r, tr) => tr.t(r.effective_in_limits ? 'mon.inLimits' : 'mon.outOfLimits') },
      { key: 'operator', label: 'mon.col.operator', value: (r) => r.recorded_by_name_snapshot },
    ],
  },
  {
    key: 'nonconformity', module: 'D04', label: 'nc.registry', rows: (db, f, t) => nonconformitiesInPeriod(db, f, t),
    fields: [
      { key: 'code', label: 'plan.col.code', value: (r) => r.code },
      { key: 'registered', label: 'nc.registered', value: (r, tr) => dt(tr, r.registered_at) },
      { key: 'source', label: 'nc.source', value: (r, tr) => tr.t(`nc.sourceType.${r.source_type}`) },
      { key: 'batch', label: 'mon.col.batch', value: (r) => r.batch_code ?? r.lot_code },
      { key: 'description', label: 'nc.description', value: (r) => r.description },
      { key: 'severity', label: 'nc.severity', value: (r, tr) => tr.t(`nc.sev.${r.severity}`) },
      { key: 'status', label: 'mon.col.status', value: (r, tr) => tr.t(`status.nc.${r.status}`) },
    ],
  },
  {
    key: 'capa', module: 'D04', label: 'nc.capaReport', rows: (db, f, t) => capaInPeriod(db, f, t),
    fields: [
      { key: 'code', label: 'plan.col.code', value: (r) => r.code },
      { key: 'nc', label: 'mon.col.nc', value: (r) => r.nc_code },
      { key: 'action', label: 'nc.action', value: (r) => r.action },
      { key: 'type', label: 'nc.capaType', value: (r, tr) => tr.t(`nc.capaType.${r.type}`) },
      { key: 'owner', label: 'home.owner', value: (r) => r.owner_name },
      { key: 'due', label: 'home.due', value: (r, tr) => d(tr, r.due_date) },
      { key: 'status', label: 'mon.col.status', value: (r, tr) => tr.t(`status.capa.${r.status}`) },
      { key: 'effDate', label: 'nc.effDate', value: (r, tr) => d(tr, r.eff_checked_date) },
      { key: 'effResult', label: 'nc.effResult', value: (r) => r.eff_result },
    ],
  },
  {
    key: 'trace', module: 'A04', label: 'trace.history', rows: (db, f, t) => exercisesInPeriod(db, f, t),
    fields: [
      { key: 'code', label: 'plan.col.code', value: (r) => r.code },
      { key: 'type', label: 'trace.type', value: (r, tr) => tr.t(`trace.type.${r.type}`) },
      { key: 'batch', label: 'mon.col.batch', value: (r) => r.batch_code },
      { key: 'started', label: 'trace.started', value: (r, tr) => dt(tr, r.started_at) },
      { key: 'duration', label: 'trace.duration', value: (r, tr) => (r.duration_min === null ? null : tr.t('trace.minutes', { n: nf(tr, r.duration_min)! })) },
      { key: 'shipments', label: 'trace.shipments', value: (r) => r.shipments },
      { key: 'returned', label: 'trace.returnedPercent', value: (r, tr) => (r.type === 'recall' && r.returnedPercent !== null ? `${nf(tr, r.returnedPercent)} %` : null) },
      { key: 'compliant', label: 'trace.compliant', value: (r, tr) => (r.compliant === null ? null : tr.t(r.compliant ? 'trace.ok' : 'trace.exceeded')) },
    ],
  },
  {
    key: 'prp', module: 'A02', label: 'prp.history', rows: (db, f, t) => prpChecklistsInPeriod(db, f, t),
    fields: [
      { key: 'date', label: 'prp.performed', value: (r, tr) => d(tr, r.performed_date) },
      { key: 'prp', label: 'plan.col.code', value: (r) => r.prp_code },
      { key: 'description', label: 'nc.description', value: (r, tr) => tr.l(r.prp_description) },
      { key: 'status', label: 'mon.col.status', value: (r, tr) => tr.t(`prp.status.${r.status}`) },
      { key: 'items', label: 'report.items', value: (r) => r.items },
      { key: 'files', label: 'prp.evidence', value: (r) => r.files },
      { key: 'by', label: 'mon.col.operator', value: (r) => r.performed_by_name },
    ],
  },
];

export interface ReportResult { title: string; headers: string[]; rows: Cell[][]; total: number; groups: { value: Cell; count: number }[] | null }

/** Строит отчёт: выбранные поля в заданном порядке, необязательная группировка с количеством строк. */
export function runReport(db: DB, tr: Translator, source: Source, from: string, to: string, fieldKeys: string[], groupBy?: string): ReportResult {
  const fields = fieldKeys.length ? fieldKeys.map((k) => source.fields.find((f) => f.key === k)).filter((f): f is Field => !!f) : source.fields;
  const data = source.rows(db, from, to);
  const rows = data.map((r) => fields.map((f) => f.value(r, tr)));
  const g = groupBy ? source.fields.find((f) => f.key === groupBy) : undefined;
  let groups: ReportResult['groups'] = null;
  if (g) {
    const m = new Map<Cell, number>();
    for (const r of data) { const v = g.value(r, tr); m.set(v, (m.get(v) ?? 0) + 1); }
    groups = [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  }
  return { title: tr.t(source.label), headers: fields.map((f) => tr.t(f.label)), rows, total: rows.length, groups };
}
