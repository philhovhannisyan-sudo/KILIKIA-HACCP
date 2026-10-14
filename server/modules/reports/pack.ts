import type { Content } from 'pdfmake/interfaces';
import type { DB } from '../../db/connection';
import type { Actor } from '../../core/actor';
import type { Translator } from '../../i18n';
import { para, runs, table } from '../../print/pdf';
import { formatDateTime } from '../../../shared/time';
import { plansInPeriod } from '../../queries/period';
import { planPdfContent } from '../plan/print';
import { SOURCES, runReport } from './sources';

/** Заголовок раздела, попадающий в оглавление. */
const section = (text: string, first = false): Content => ({ ...(runs(text, { fontSize: 16, bold: true, margin: [0, 0, 0, 8] }) as object), tocItem: true, pageBreak: first ? undefined : 'before' } as Content);
const sub = (text: string): Content => ({ ...(runs(text, { fontSize: 12, bold: true, margin: [0, 10, 0, 6] }) as object), tocItem: true, tocMargin: [16, 0, 0, 0] } as Content);

const reportTable = (db: DB, tr: Translator, key: string, from: string, to: string): { count: number; content: Content[] } => {
  const r = runReport(db, tr, SOURCES.find((s) => s.key === key)!, from, to, []);
  return { count: r.total, content: [para(tr.t('pack.count', { n: r.total }), { bold: true }), r.rows.length ? table(r.headers, r.rows, r.headers.map(() => '*')) : para('—')] };
};

/**
 * Пакет для аудита за период — один PDF (brief §5 фаза 7): титул, оглавление, 4 раздела
 * (план ХАССП, записи ККТ/OPRP, прослеживаемость, доказательства CAPA), дата формирования, имя и роли.
 * Количества считаются теми же запросами, что экраны модулей (К24).
 */
export function auditPack(db: DB, tr: Translator, actor: Actor, from: string, to: string, generatedAt: Date) {
  const { t, l } = tr;
  const site = l(db.prepare('SELECT name_i18n FROM site WHERE active = 1').pluck().get() as string);
  const roles = actor.roles.map((r) => t(`role.${r}`)).join(', ');
  const period = `${formatDateTime(new Date(from), tr.lang)} — ${formatDateTime(new Date(to), tr.lang)}`;
  const plans = plansInPeriod(db, from, to);
  const mon = reportTable(db, tr, 'monitoring', from, to);
  const trace = reportTable(db, tr, 'trace', from, to);
  const capa = reportTable(db, tr, 'capa', from, to);
  const planContent: Content[] = plans.length ? plans.flatMap((p) => {
    const { title, content } = planPdfContent(db, p.id, tr);
    return [sub(title), ...content.filter((c) => !(c && typeof c === 'object' && 'pageBreak' in (c as object)))];
  }) : [para(t('pack.noPlan'))];
  const content: Content[] = [
    runs(t('pack.title'), { fontSize: 24, bold: true, margin: [0, 80, 0, 12] }),
    runs(site, { fontSize: 14, margin: [0, 0, 0, 24] }),
    table([t('trace.field'), t('mon.col.value')], [
      [t('mon.period'), period],
      [t('pack.generatedAt'), formatDateTime(generatedAt, tr.lang)],
      [t('pack.generatedBy'), `${actor.fullName} (${roles})`],
      ['Codex Alimentarius CXC 1-1969 · ISO 22000:2018 · ISO/TS 22002-1 · ТР ТС 021/2011', ''],
    ], [180, '*']),
    para(t('print.demoMark'), { color: '#7a5600' }),
    { toc: { title: runs(t('pack.toc'), { fontSize: 16, bold: true, margin: [0, 0, 0, 8] }) as never }, pageBreak: 'before' } as Content,
    section(`1. ${t('pack.s1')}`), para(t('pack.plansCount', { n: plans.length }), { bold: true }), ...planContent,
    section(`2. ${t('pack.s2')}`), ...mon.content,
    section(`3. ${t('pack.s3')}`), ...trace.content,
    section(`4. ${t('pack.s4')}`), ...capa.content,
  ];
  return { title: `${t('pack.title')} · ${period}`, content, counts: { plans: plans.length, monitoring: mon.count, trace: trace.count, capa: capa.count } };
}
