import type { Content } from 'pdfmake/interfaces';
import type { DB } from '../../db/connection';
import type { Translator } from '../../i18n';
import { heading, para, table } from '../../print/pdf';
import type { Sheet } from '../../print/tabular';
import { formatDate, formatDateTime } from '../../../shared/time';
import { exerciseReport, traceBatch } from '../../queries/trace';

/** Отчёт о тесте прослеживаемости / тестовом отзыве: сводка, дерево назад/вперёд, позиции отзыва. */
export function exerciseSheets(db: DB, id: string, tr: Translator) {
  const { t, l } = tr;
  const ex = exerciseReport(db, id);
  const tree = traceBatch(db, ex.fg_batch_id);
  const yes = (v: unknown) => t(v ? 'plan.yes' : 'plan.no');
  const nf = (n: number) => new Intl.NumberFormat(tr.lang === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: 1 }).format(n);
  const summary: Sheet = {
    name: t('trace.report'),
    headers: [t('trace.field'), t('mon.col.value')],
    rows: [
      [t('plan.col.code'), ex.code], [t('trace.type'), t(`trace.type.${ex.type}`)], [t('mon.col.batch'), ex.batch_code],
      [t('trace.started'), formatDateTime(new Date(ex.started_at), tr.lang)],
      [t('trace.finished'), ex.finished_at ? formatDateTime(new Date(ex.finished_at), tr.lang) : '—'],
      [t('trace.duration'), ex.duration_min === null ? '—' : t('trace.minutes', { n: nf(ex.duration_min) })],
      [t('trace.target'), t('trace.minutes', { n: ex.target_min_snapshot })],
      [t('trace.compliant'), ex.compliant === null ? '—' : yes(ex.compliant)],
      [t('trace.shipments'), ex.shipments],
      ...(ex.type === 'recall' ? [[t('trace.returnedPercent'), ex.returnedPercent === null ? '—' : `${nf(ex.returnedPercent)} %`] as (string | number)[]] : []),
      [t('mon.col.nc'), ex.nc_code ?? '—'], [t('trace.conductedBy'), ex.created_by_name],
    ],
  };
  const back: Sheet = {
    name: t('trace.backward'),
    headers: [t('trace.material'), t('trace.lot'), t('trace.received'), t('trace.qty'), t('trace.supplier')],
    rows: tree.backward.map((r) => [l(r.material_name), r.lot_code, formatDate(new Date(`${r.received_date}T12:00:00Z`), tr.lang), `${nf(r.qty)} ${t(`unit.${r.unit}`)}`, `${r.supplier_code} · ${r.supplier_name}`]),
  };
  const fwd: Sheet = {
    name: t('trace.forward'),
    headers: [t('trace.shipment'), t('trace.date'), t('trace.customer'), t('trace.qty'), ...(ex.type === 'recall' ? [t('trace.returned')] : [])],
    rows: ex.type === 'recall'
      ? ex.items.map((i: Record<string, any>) => [i.number, formatDate(new Date(`${i.shipped_date}T12:00:00Z`), tr.lang), i.customer_name, i.qty, i.returned ? `${t('plan.yes')} (${i.returned_qty})` : t('plan.no')]) // eslint-disable-line @typescript-eslint/no-explicit-any
      : tree.forward.map((r) => [r.number, formatDate(new Date(`${r.shipped_date}T12:00:00Z`), tr.lang), r.customer_name, r.qty]),
  };
  return { ex, sheets: [summary, back, fwd] };
}

export function exercisePdf(db: DB, id: string, tr: Translator): { title: string; content: Content[] } {
  const { ex, sheets } = exerciseSheets(db, id, tr);
  const title = `${tr.t(`trace.type.${ex.type}`)} ${ex.code}`;
  const flag: Content[] = ex.compliant === 0 ? [para(tr.t('trace.nonCompliantMark', { nc: ex.nc_code ?? '' }), { color: '#b3261e', bold: true })] : [];
  return {
    title,
    content: [heading(title), ...flag, para(tr.t('trace.targetNote')),
      table(sheets[0].headers, sheets[0].rows, [200, '*']),
      heading(sheets[1].name, 2), table(sheets[1].headers, sheets[1].rows, ['*', 'auto', 'auto', 'auto', '*']),
      heading(sheets[2].name, 2), table(sheets[2].headers, sheets[2].rows, sheets[2].headers.map(() => '*'))],
  };
}
