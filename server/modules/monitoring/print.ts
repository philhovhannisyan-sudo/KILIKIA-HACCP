import type { Content } from 'pdfmake/interfaces';
import type { DB } from '../../db/connection';
import type { Translator } from '../../i18n';
import { heading, para, table } from '../../print/pdf';
import type { Sheet } from '../../print/tabular';
import { formatDateTime } from '../../../shared/time';
import { monitoringJournal } from '../../queries/journals';
import { envRecords } from './routes';

const nf = (tr: Translator, n: number | null) => (n === null || n === undefined ? '' : new Intl.NumberFormat(tr.lang === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: 3 }).format(n));
const limits = (tr: Translator, min: number | null, max: number | null, unit: string | null) =>
  [min !== null ? `≥ ${nf(tr, min)}` : '', max !== null ? `≤ ${nf(tr, max)}` : ''].filter(Boolean).join('; ') + (unit ? ` ${unit}` : '');
const cpLabel = (tr: Translator, code: string, type: string) => `${tr.t(type === 'CCP' ? 'term.ccp' : 'term.oprp')}-${code.split('-').slice(1).join('-')}`;

export function monitoringSheet(db: DB, tr: Translator, from?: string, to?: string): Sheet {
  const { t, l } = tr;
  const pf = (v: number | null) => (v === null ? '' : t(v ? 'mon.pass' : 'mon.fail'));
  return {
    name: t('mon.journal'),
    headers: [t('mon.col.time'), t('plan.col.code'), t('plan.col.parameter'), t('mon.col.batch'), t('mon.col.value'), t('plan.col.limits'),
      t('mon.col.status'), t('plan.col.equipment'), t('mon.col.operator'), t('mon.col.correction'), t('mon.col.nc')],
    rows: monitoringJournal(db, from, to).map((r) => [
      formatDateTime(new Date(r.event_at), tr.lang), cpLabel(tr, r.cp_code, r.cp_type), l(r.param_name), r.batch_code,
      r.kind === 'numeric' ? `${nf(tr, r.value_num)} ${r.unit ?? ''}`.trim() : pf(r.value_pass),
      r.kind === 'numeric' ? limits(tr, r.limit_min_snapshot, r.limit_max_snapshot, r.unit) : t('plan.passFail'),
      t((r.corr_in_limits ?? r.in_limits) ? 'mon.inLimits' : 'mon.outOfLimits'), r.equipment_code ?? '', r.operator_name_snapshot,
      r.corrections ? `${r.kind === 'numeric' ? nf(tr, r.corr_value_num) : pf(r.corr_value_pass)} — ${r.corr_reason} (${r.corr_author})` : '',
      r.nc_code ?? '',
    ]),
  };
}

export function envSheet(db: DB, tr: Translator, from?: string, to?: string): Sheet {
  const { t, l } = tr;
  return {
    name: t('env.journal'),
    headers: [t('mon.col.time'), t('env.col.point'), t('env.col.zone'), t('env.col.kind'), t('mon.col.value'), t('plan.col.limits'), t('mon.col.status'), t('mon.col.operator'), t('mon.col.correction'), t('mon.col.nc')],
    rows: envRecords(db, from, to).map((r) => [
      formatDateTime(new Date(r.event_at), tr.lang), r.point_code, l(r.zone_i18n), t(`env.kind.${r.kind}`), `${nf(tr, r.effective_value)} ${r.unit}`,
      limits(tr, r.limit_min, r.limit_max, r.unit), t(r.effective_in_limits ? 'mon.inLimits' : 'mon.outOfLimits'), r.recorded_by_name_snapshot,
      r.correction_reason ? `${nf(tr, r.value)} → ${nf(tr, r.effective_value)} — ${r.correction_reason} (${r.correction_author})` : '', r.nc_code ?? '',
    ]),
  };
}

const period = (tr: Translator, from?: string, to?: string) =>
  `${tr.t('mon.period')}: ${from ? formatDateTime(new Date(from), tr.lang) : '—'} — ${to ? formatDateTime(new Date(to), tr.lang) : '—'}`;

export function journalPdf(sheet: Sheet, tr: Translator, from?: string, to?: string): { title: string; content: Content[] } {
  return {
    title: sheet.name,
    content: [heading(sheet.name), para(period(tr, from, to)), para(tr.t('mon.count', { n: sheet.rows.length })),
      table(sheet.headers, sheet.rows, sheet.headers.map(() => '*'))],
  };
}
