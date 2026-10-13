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
import { envSheet, journalPdf, monitoringSheet } from './monitoring/print';
import { exercisePdf, exerciseSheets } from './trace/print';
import type { Sheet } from '../print/tabular';
import type { Actor } from '../core/actor';
import type { Translator } from '../i18n';

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

  // Журналы за период: мониторинг ККТ/OPRP (A03) и среда (A10); период [from, to) в UTC ISO
  const journal = (perm: string, build: (tr: Translator, from?: string, to?: string) => Sheet, base: string) =>
    app.get(`/api/${base}/export.:format`, { config: { auth: perm } }, async (req, reply) => {
      const { format } = req.params as { format: string };
      const q = req.query as { lang?: string; from?: string; to?: string };
      const tr = translator(langOf(q.lang));
      const sheet = build(tr, q.from, q.to);
      const name = `${base}-${tr.lang}`;
      if (format === 'pdf') {
        const { title, content } = journalPdf(sheet, tr, q.from, q.to);
        return send(reply, await renderPdf(tr, meta(tr, title, actorOf(req)), content), 'application/pdf', `${name}.pdf`);
      }
      if (format === 'csv') return send(reply, toCsv([sheet], tr.lang), 'text/csv; charset=utf-8', `${name}.csv`);
      if (format === 'xlsx') return send(reply, await toXlsx([sheet]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name}.xlsx`);
      throw badRequest('unknown_format', { format });
    });
  app.get('/api/trace/exercises/:id/export.:format', { config: { auth: 'a04.module.read' } }, async (req, reply) => {
    const { id, format } = req.params as { id: string; format: string };
    const tr = translator(langOf((req.query as { lang?: string }).lang));
    const db = ctx.store.db;
    const name = `trace-${id}-${tr.lang}`;
    if (format === 'pdf') {
      const { title, content } = exercisePdf(db, id, tr);
      return send(reply, await renderPdf(tr, meta(tr, title, actorOf(req)), content, false), 'application/pdf', `${name}.pdf`);
    }
    const { sheets } = exerciseSheets(db, id, tr);
    if (format === 'csv') return send(reply, toCsv(sheets, tr.lang), 'text/csv; charset=utf-8', `${name}.csv`);
    if (format === 'xlsx') return send(reply, await toXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `${name}.xlsx`);
    throw badRequest('unknown_format', { format });
  });
  journal('a03.module.read', (tr, f, to) => monitoringSheet(ctx.store.db, tr, f, to), 'monitoring');
  journal('a10.module.read', (tr, f, to) => envSheet(ctx.store.db, tr, f, to), 'env-records');
};

const meta = (tr: Translator, title: string, actor: Actor) =>
  ({ title, generatedBy: actor.fullName, roles: actor.roles.map((r) => tr.t(`role.${r}`)).join(', '), generatedAt: clock.now() });
