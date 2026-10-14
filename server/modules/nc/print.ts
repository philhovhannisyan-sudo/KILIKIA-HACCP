import type { Content } from 'pdfmake/interfaces';
import type { DB } from '../../db/connection';
import type { Translator } from '../../i18n';
import { heading, para, table } from '../../print/pdf';
import type { Sheet } from '../../print/tabular';
import { formatDate, formatDateTime } from '../../../shared/time';
import { ncDetail } from './routes';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const date = (s: string | null, tr: Translator) => (s ? formatDate(new Date(`${s.slice(0, 10)}T12:00:00Z`), tr.lang) : '—');

/** Протокол несоответствия + отчёт CAPA (одни строки для PDF, CSV, XLSX). */
export function ncSheets(db: DB, id: string, tr: Translator) {
  const { t } = tr;
  const nc = ncDetail(db, id);
  const info: Sheet = {
    name: t('nc.protocol'),
    headers: [t('trace.field'), t('mon.col.value')],
    rows: [
      [t('plan.col.code'), nc.code], [t('nc.source'), t(`nc.sourceType.${nc.source_type}`)], [t('mon.col.batch'), nc.batch_code ?? nc.lot_code ?? '—'],
      [t('nc.description'), nc.description], [t('nc.severity'), t(`nc.sev.${nc.severity}`)], [t('mon.col.status'), t(`status.nc.${nc.status}`)],
      [t('nc.registered'), formatDateTime(new Date(nc.registered_at), tr.lang)], [t('nc.due'), date(nc.due_date, tr)],
      [t('term.root_cause'), nc.root_cause ?? '—'],
    ],
  };
  const whys: Sheet = { name: t('term.five_whys'), headers: [t('plan.col.no'), t('nc.why')], rows: nc.fiveWhys.map((w: string, i: number) => [i + 1, w]) };
  const fish: Sheet = { name: t('term.ishikawa'), headers: [t('nc.category'), t('nc.cause')], rows: nc.ishikawa.map((c: Row) => [t(`nc.6m.${c.category}`), c.text]) };
  const capa: Sheet = {
    name: t('nc.capaReport'),
    headers: [t('plan.col.code'), t('nc.action'), t('nc.capaType'), t('home.owner'), t('home.due'), t('mon.col.status'), t('nc.effDate'), t('nc.effResult'), t('nc.effBy')],
    rows: nc.capa.map((c: Row) => [c.code, c.action, t(`nc.capaType.${c.type}`), c.owner_name, date(c.due_date, tr), t(`status.capa.${c.status}`),
      date(c.eff_checked_date, tr), c.eff_result ?? '', c.eff_checked_by_name ?? '']),
  };
  return { nc, sheets: [info, whys, fish, capa] };
}

export function ncPdf(db: DB, id: string, tr: Translator): { title: string; content: Content[] } {
  const { nc, sheets: [info, whys, fish, capa] } = ncSheets(db, id, tr);
  const title = `${tr.t('nc.protocol')} ${nc.code}`;
  return {
    title,
    content: [heading(title), table(info.headers, info.rows, [180, '*']),
      heading(whys.name, 2), whys.rows.length ? table(whys.headers, whys.rows, [24, '*']) : para('—'),
      heading(fish.name, 2), fish.rows.length ? table(fish.headers, fish.rows, [120, '*']) : para('—'),
      heading(capa.name, 2), capa.rows.length ? table(capa.headers, capa.rows, [50, '*', 60, 70, 55, 55, 55, '*', 70]) : para('—')],
  };
}
