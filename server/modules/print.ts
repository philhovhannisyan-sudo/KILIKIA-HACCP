import type { FastifyReply } from 'fastify';
import type { RouteRegistrar } from '../http';
import { actorOf } from '../http';
import { clock } from '../core/clock';
import { badRequest } from '../core/errors';
import { langOf, translator } from '../i18n';
import { renderPdf } from '../print/pdf';
import { toCsv, toXlsx } from '../print/tabular';
import { planPdfContent, planSheets } from './plan/print';
import { getPlan } from './plan/service';

const send = (reply: FastifyReply, body: Buffer, type: string, name: string) =>
  reply.header('content-type', type).header('content-disposition', `inline; filename="${encodeURIComponent(name)}"`).send(body);

export const printRoutes: RouteRegistrar = (app, ctx) => {
  // Печатная форма и экспорт плана ХАССП на языке из ?lang= (язык интерфейса)
  app.get('/api/plans/:id/export.:format', { config: { auth: 'a01.module.read' } }, async (req, reply) => {
    const { id, format } = req.params as { id: string; format: string };
    const tr = translator(langOf((req.query as { lang?: string }).lang));
    const db = ctx.store.db;
    const plan = getPlan(db, id);
    const base = `haccp-plan-v${plan.version}-${tr.lang}`;
    const actor = actorOf(req);
    if (format === 'pdf') {
      const { title, content } = planPdfContent(db, id, tr);
      const roles = actor.roles.map((r) => tr.t(`role.${r}`)).join(', ');
      return send(reply, await renderPdf(tr, { title, generatedBy: actor.fullName, roles, generatedAt: clock.now() }, content), 'application/pdf', `${base}.pdf`);
    }
    if (format === 'csv') return send(reply, toCsv(planSheets(db, id, tr), tr.lang), 'text/csv; charset=utf-8', `${base}.csv`);
    if (format === 'xlsx') return send(reply, await toXlsx(planSheets(db, id, tr)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${base}.xlsx`);
    throw badRequest('unknown_format', { format });
  });
};
