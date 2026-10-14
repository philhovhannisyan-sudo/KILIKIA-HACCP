import type { FastifyReply } from 'fastify';
import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { badRequest } from '../../core/errors';
import { authorize } from '../../core/rbac';
import { langOf, translator } from '../../i18n';
import { renderPdf, para, table } from '../../print/pdf';
import { toCsv, toXlsx } from '../../print/tabular';
import { MODULE_READ } from '../../../shared/permissions';
import { SOURCES, runReport } from './sources';
import { auditPack } from './pack';

const send = (reply: FastifyReply, body: Buffer, type: string, name: string) =>
  reply.header('content-type', type).header('content-disposition', `inline; filename="${encodeURIComponent(name)}"`).send(body);

function period(q: { from?: string; to?: string }) {
  const ok = (s?: string) => !!s && !Number.isNaN(Date.parse(s));
  if (!ok(q.from) || !ok(q.to) || q.from! >= q.to!) throw badRequest('period_invalid');
  return { from: new Date(q.from!).toISOString(), to: new Date(q.to!).toISOString() };
}

export const reportRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;
  const sourceOf = (key: string | undefined) => {
    const s = SOURCES.find((x) => x.key === key);
    if (!s) throw badRequest('field_required', { field: 'source' });
    return s;
  };

  app.get('/api/reports/sources', { config: { auth: 'report.custom.generate' } }, async (req) => {
    const tr = translator(langOf((req.query as { lang?: string }).lang));
    const a = actorOf(req);
    return SOURCES.filter((s) => a.permissions.has(MODULE_READ(s.module))).map((s) => ({ key: s.key, module: s.module, label: tr.t(s.label), fields: s.fields.map((f) => ({ key: f.key, label: tr.t(f.label) })) }));
  });

  // Конструктор отчётов: предпросмотр и экспорт CSV / XLSX / PDF
  app.get('/api/reports/run', { config: { auth: 'report.custom.generate' } }, async (req) => {
    const q = req.query as { source?: string; from?: string; to?: string; fields?: string; groupBy?: string; lang?: string };
    const s = sourceOf(q.source);
    authorize(actorOf(req), MODULE_READ(s.module));
    const p = period(q);
    return runReport(db(), translator(langOf(q.lang)), s, p.from, p.to, (q.fields ?? '').split(',').filter(Boolean), q.groupBy || undefined);
  });

  app.get('/api/reports/export.:format', { config: { auth: 'report.custom.generate' } }, async (req, reply) => {
    const { format } = req.params as { format: string };
    const q = req.query as { source?: string; from?: string; to?: string; fields?: string; groupBy?: string; lang?: string };
    const s = sourceOf(q.source);
    const actor = actorOf(req);
    authorize(actor, MODULE_READ(s.module));
    const p = period(q);
    const tr = translator(langOf(q.lang));
    const r = runReport(db(), tr, s, p.from, p.to, (q.fields ?? '').split(',').filter(Boolean), q.groupBy || undefined);
    const sheets = [{ name: r.title, headers: r.headers, rows: r.rows }, ...(r.groups ? [{ name: tr.t('report.groups'), headers: [tr.t('report.groupValue'), tr.t('report.count')], rows: r.groups.map((g) => [g.value, g.count]) }] : [])];
    const name = `report-${s.key}-${tr.lang}`;
    if (format === 'csv') return send(reply, toCsv(sheets, tr.lang), 'text/csv; charset=utf-8', `${name}.csv`);
    if (format === 'xlsx') return send(reply, await toXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name}.xlsx`);
    if (format === 'pdf') {
      const content = [para(tr.t('pack.count', { n: r.total }), { bold: true }), table(r.headers, r.rows, r.headers.map(() => '*')),
        ...(r.groups ? [table([tr.t('report.groupValue'), tr.t('report.count')], r.groups.map((g) => [g.value, g.count]), ['*', 80])] : [])];
      return send(reply, await renderPdf(tr, { title: r.title, generatedBy: actor.fullName, roles: actor.roles.map((x) => tr.t(`role.${x}`)).join(', '), generatedAt: clock.now() }, content), 'application/pdf', `${name}.pdf`);
    }
    throw badRequest('unknown_format', { format });
  });

  // Пакет для аудита в один клик (право есть и у внешнего аудитора)
  app.get('/api/audit-pack.pdf', { config: { auth: 'audit.pack.generate' } }, async (req, reply) => {
    const q = req.query as { from?: string; to?: string; lang?: string };
    const p = period(q);
    const tr = translator(langOf(q.lang));
    const actor = actorOf(req);
    const now = clock.now();
    const pack = auditPack(db(), tr, actor, p.from, p.to, now);
    const pdf = await renderPdf(tr, { title: pack.title, generatedBy: actor.fullName, roles: actor.roles.map((x) => tr.t(`role.${x}`)).join(', '), generatedAt: now }, pack.content, true);
    db().transaction(() => appendAudit(db(), actor, { module: 'E01', objectType: 'audit_pack', action: 'generate', after: { from: p.from, to: p.to, ...pack.counts } }))();
    reply.header('x-pack-counts', JSON.stringify(pack.counts));
    return send(reply, pdf, 'application/pdf', `audit-pack-${tr.lang}.pdf`);
  });
};
