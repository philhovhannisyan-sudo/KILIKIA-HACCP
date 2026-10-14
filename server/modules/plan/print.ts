import type { DB } from '../../db/connection';
import type { Content } from 'pdfmake/interfaces';
import type { Translator } from '../../i18n';
import { heading, para, runs, table } from '../../print/pdf';
import type { Sheet } from '../../print/tabular';
import { formatDate } from '../../../shared/time';
import { loadPlan } from './service';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Номер вопроса дерева на языке печати: В1а / Q1a / Հ1ա */
export const nodeLabel = (node: string, tr: Translator) =>
  node.replace('Q', { ru: 'В', en: 'Q', hy: 'Հ' }[tr.lang]).replace('a', { ru: 'а', en: 'a', hy: 'ա' }[tr.lang]);
const d = (s: string | null, tr: Translator) => (s ? formatDate(new Date(`${s.slice(0, 10)}T12:00:00Z`), tr.lang) : '—');

/** Данные плана в виде таблиц: одни и те же строки идут в PDF, CSV и XLSX. */
export function planTables(db: DB, planId: string, tr: Translator) {
  const { t, l } = tr;
  const p = loadPlan(db, planId) as unknown as { plan: Row; team: Row[]; steps: Row[]; hazards: Row[]; controlPoints: Row[] };
  const steps = new Map(p.steps.map((s: Row) => [s.id, s]));
  const fmtNum = (n: number | null) => (n === null ? null : new Intl.NumberFormat(tr.lang === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: 3 }).format(n));
  const cpLabel = (code: string, type: string) => `${t(type === 'CCP' ? 'term.ccp' : 'term.oprp')}-${code.split('-').slice(1).join('-')}`;
  const equipment = new Map((db.prepare('SELECT id, code FROM equipment').all() as { id: string; code: string }[]).map((e) => [e.id, e.code]));

  const team: Sheet = {
    name: t('plan.screen.1'), headers: [t('plan.col.name'), t('plan.col.role'), t('plan.col.competence')],
    rows: p.team.map((m: Row) => [m.name, m.role, m.competence]),
  };
  const flow: Sheet = {
    name: t('plan.screen.3'), headers: [t('plan.col.no'), t('plan.col.step')],
    rows: p.steps.map((s: Row, i: number) => [i + 1, l(s.name_i18n)]),
  };
  const hazards: Sheet = {
    name: t('plan.screen.4'),
    headers: [t('plan.col.step'), t('plan.col.type'), t('plan.col.hazard'), t('plan.col.likelihood'), t('plan.col.severity'), t('plan.col.significant'), t('plan.col.measure'), t('plan.col.decisions'), t('plan.col.result')],
    rows: p.hazards.map((h: Row) => [
      `${(steps.get(h.step_id)?.ord ?? 0) + 1}. ${l(steps.get(h.step_id)?.name_i18n)}`, t(`hazard.type.${h.type}`), l(h.description_i18n),
      h.likelihood, h.severity, t(h.significant ? 'plan.yes' : 'plan.no'), l(h.control_measure_i18n),
      h.significant
        ? [...h.decisions.map((x: Row) => `${nodeLabel(x.node, tr)}: ${t(x.answer === 'yes' ? 'plan.yes' : 'plan.no')} — ${x.justification}`),
          ...(h.oprp ? [`OPRP: ${[1, 2, 3, 4, 5].map((c) => `${c}=${t(h.oprp.criteria[c]?.answer === 'yes' ? 'plan.yes' : 'plan.no')}`).join(', ')}`] : [])].join('\n')
        : t('plan.notSignificantNote'),
      t(`hazard.result.${h.result}`),
    ]),
  };
  const cps: Sheet = {
    name: t('plan.screen.6'),
    headers: [t('plan.col.code'), t('plan.col.step'), t('plan.col.hazard'), t('plan.col.parameter'), t('plan.col.limits'), t('plan.col.method'), t('plan.col.frequency'), t('plan.col.equipment'), t('plan.col.responsible'), t('plan.col.corrective')],
    rows: p.controlPoints.flatMap((cp: Row) => cp.parameters.map((pr: Row) => {
      const limit = pr.kind === 'pass_fail' ? t('plan.passFail')
        : [pr.limit_min !== null ? `≥ ${fmtNum(pr.limit_min)}` : null, pr.limit_max !== null ? `≤ ${fmtNum(pr.limit_max)}` : null].filter(Boolean).join('; ') + (pr.unit ? ` ${pr.unit}` : '');
      const hz = p.hazards.find((h: Row) => h.id === cp.hazard_id);
      return [cpLabel(cp.code, cp.type), l(steps.get(cp.step_id)?.name_i18n), hz ? l(hz.description_i18n) : '', l(pr.name_i18n), limit,
        l(pr.method_i18n), l(pr.frequency_i18n), pr.equipment_id ? equipment.get(pr.equipment_id) ?? '' : '', t(`role.${cp.responsible_role}`), l(cp.corrective_action_i18n)];
    })),
  };
  return { p, team, flow, hazards, cps };
}

export function planPdfContent(db: DB, planId: string, tr: Translator): { title: string; content: Content[] } {
  const { t, l } = tr;
  const { p, team, flow, hazards, cps } = planTables(db, planId, tr);
  const products = (db.prepare(`SELECT name_i18n FROM product WHERE id IN (${p.plan.scope.map(() => '?').join(',') || "''"}) ORDER BY code`).pluck().all(...p.plan.scope) as string[]).map((x) => l(x));
  const site = db.prepare('SELECT name_i18n FROM site WHERE active = 1').pluck().get() as string;
  const ws = p.plan.wizard_state as Record<string, string>;
  const title = `${t('plan.title')}: ${l(p.plan.title_i18n)} · ${t('plan.version')} ${p.plan.version}`;
  const content: Content[] = [
    runs(t('plan.title'), { fontSize: 22, bold: true, margin: [0, 60, 0, 8] }),
    runs(l(p.plan.title_i18n), { fontSize: 14, margin: [0, 0, 0, 24] }),
    table([t('plan.site'), t('plan.version'), t('plan.status'), t('plan.approvedBy'), t('plan.approvedAt'), t('plan.effective')],
      [[l(site), p.plan.version, t(`status.haccp_plan.${p.plan.status}`), p.plan.approved_by_name ?? '—', d(p.plan.approved_at, tr), d(p.plan.effective_from, tr)]],
      ['*', 'auto', 'auto', '*', 'auto', 'auto']),
    para('Codex Alimentarius CXC 1-1969 · ISO 22000:2018 · ISO/TS 22002-1 · ТР ТС 021/2011', { color: '#5b6763' }),
    para(t('print.demoMark'), { color: '#7a5600' }),
    { text: '', pageBreak: 'after' } as Content,
    heading(`1. ${t('plan.screen.1')}`), table(team.headers, team.rows, ['*', '*', '*']),
    heading(`2. ${t('plan.screen.2')}`),
    para(`${t('plan.products')}: ${products.join('; ') || '—'}`),
    para(`${t('plan.intendedUse')}: ${l(ws.intendedUse ?? null) || '—'}`),
    ...(ws.productDescription ? [para(`${t('plan.description')}: ${l(ws.productDescription)}`)] : []),
    heading(`3. ${t('plan.screen.3')}`),
    para(flow.rows.map((r) => `${r[0]}. ${r[1]}`).join('  →  ')),
    para(`${t('plan.siteVerified')}: ${d(p.plan.site_verified_date, tr)} · ${t('plan.siteVerifiedBy')}: ${p.plan.site_verified_by ?? '—'}`),
    heading(`4–5. ${t('plan.screen.4')} · ${t('plan.screen.5')}`),
    table(hazards.headers, hazards.rows, [78, 74, '*', 14, 14, 40, 88, '*', 52]),
    heading(`6. ${t('plan.screen.6')}`),
    table(cps.headers, cps.rows, [34, 70, '*', 66, 48, 62, 70, 34, 60, 104]),
    heading(`7. ${t('plan.screen.7')}`),
    para(`${t('plan.verification')}: ${l(ws.verification ?? null) || '—'}`),
    ...(ws.validation ? [para(`${t('plan.validation')}: ${l(ws.validation)}`)] : []),
    ...(ws.records ? [para(`${t('plan.records')}: ${l(ws.records)}`)] : []),
  ];
  return { title, content };
}

export function planSheets(db: DB, planId: string, tr: Translator): Sheet[] {
  const { team, flow, hazards, cps } = planTables(db, planId, tr);
  return [team, flow, hazards, cps];
}
