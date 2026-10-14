import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { badRequest, notFound, unprocessable } from '../../core/errors';
import { authorize } from '../../core/rbac';
import { ulid } from '../../core/ids';
import { langOf, translator } from '../../i18n';
import { para, renderPdf, runs, table } from '../../print/pdf';
import { formatDate } from '../../../shared/time';
import { parseDecimal } from '../../../shared/number';
import { MODULE_READ } from '../../../shared/permissions';
import { addDays } from '../../../shared/time';
import { SCAFFOLDS } from './config';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const scaffoldRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;
  // :today — деловая дата сервера (Asia/Yerevan, подменяемые часы в тестах)
  const sql = (s: string) => s.replace(/:today/g, `'${clock.today()}'`);
  const data = (code: string) => {
    const def = SCAFFOLDS[code];
    if (!def) throw notFound('module', code);
    return {
      code, form: def.form ?? null, cols: def.cols, fields: def.fields,
      kpis: def.kpis.map((k) => db().prepare(sql(k)).pluck().get() as number),
      rows: db().prepare(sql(def.rows)).all() as Row[],
    };
  };

  app.get('/api/scaffold/:code', { config: { auth: 'user' } }, async (req) => {
    const code = (req.params as { code: string }).code.toUpperCase();
    authorize(actorOf(req), MODULE_READ(code));
    return data(code);
  });

  // Печатная форма-заготовка каркаса: шапка, пометка «в разработке», таблица текущих данных
  app.get('/api/scaffold/:code/export.pdf', { config: { auth: 'user' } }, async (req, reply) => {
    const code = (req.params as { code: string }).code.toUpperCase();
    const actor = actorOf(req);
    authorize(actor, MODULE_READ(code));
    const tr = translator(langOf((req.query as { lang?: string }).lang));
    const d = data(code);
    const cell = (c: { key: string; kind?: string; status?: string }, v: unknown) => {
      if (v === null || v === undefined) return '';
      if (c.kind === 'i18n') return tr.l(String(v));
      if (c.kind === 'date') return formatDate(new Date(`${String(v).slice(0, 10)}T12:00:00Z`), tr.lang);
      if (c.kind === 'status') return tr.t(`${c.status}.${v}`);
      return String(v);
    };
    const title = `${code} ${tr.t(`module.${code}.title`)}`;
    const content = [runs(title, { fontSize: 16, bold: true, margin: [0, 0, 0, 6] }),
      para(`${tr.t('sc.printDraft')} · ${tr.t('term.in_development')}`, { color: '#7a5600', bold: true }),
      para(tr.t(`sc.future.${code}`)),
      table(d.cols.map((c) => tr.t(`sc.col.${c.key}`)), d.rows.map((r) => d.cols.map((c) => cell(c, r[c.key]))), d.cols.map(() => '*'))];
    const pdf = await renderPdf(tr, { title, generatedBy: actor.fullName, roles: actor.roles.map((r) => tr.t(`role.${r}`)).join(', '), generatedAt: clock.now() }, content, true);
    return reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="${code}-${tr.lang}.pdf"`).send(pdf);
  });

  // ── B03: протокол партии — новая партия ГП с фактическим расходом партий сырья (данные полные) ──
  app.get('/api/material-lots', { config: { auth: 'user' } }, async () =>
    db().prepare(`SELECT l.id, l.code, l.status, l.unit, m.name_i18n AS material, (SELECT coalesce(sum(qty), 0) FROM stock s WHERE s.lot_kind = 'material' AND s.lot_id = l.id) AS stock
      FROM material_lot l JOIN material m ON m.id = l.material_id ORDER BY m.code, l.received_date`).all());

  app.post('/api/batches', { config: { auth: 'batch.fg.create' } }, async (req) => {
    const b = (req.body ?? {}) as { productId?: string; shift?: string; qty?: unknown; lines?: { materialLotId?: string; qty?: unknown }[] };
    const d = db();
    const product = d.prepare('SELECT id, code FROM product WHERE id = ?').get(b.productId) as { id: string; code: string } | undefined;
    if (!product) throw badRequest('field_required', { field: 'productId' });
    const qty = parseDecimal(String(b.qty ?? ''));
    if (qty === null || qty <= 0) throw badRequest('invalid_number', { field: 'qty' });
    if (!['A', 'B'].includes(String(b.shift))) throw badRequest('field_required', { field: 'shift' });
    if (!Array.isArray(b.lines) || b.lines.length === 0) throw badRequest('field_required', { field: 'lines' });
    const lines = b.lines.map((l, i) => {
      const lot = d.prepare(`SELECT id, code, status, (SELECT coalesce(sum(qty), 0) FROM stock s WHERE s.lot_kind = 'material' AND s.lot_id = material_lot.id) AS stock FROM material_lot WHERE id = ?`).get(l.materialLotId) as Row | undefined;
      if (!lot) throw badRequest('field_required', { field: `lines[${i}].materialLotId` });
      if (lot.status !== 'released') throw unprocessable('batch_not_shippable', { batch: lot.code, status: lot.status });
      const q = parseDecimal(String(l.qty ?? ''));
      if (q === null || q <= 0) throw badRequest('invalid_number', { field: `lines[${i}].qty` });
      if (q > lot.stock) throw unprocessable('insufficient_stock', { batch: lot.code, available: lot.stock });
      return { lot, qty: q };
    });
    if (new Set(lines.map((l) => l.lot.id)).size !== lines.length) throw badRequest('duplicate_lot');
    const prefix = product.code.split('-')[1];
    const codes = d.prepare('SELECT code FROM fg_batch WHERE code LIKE ?').pluck().all(`B-${prefix}-%`) as string[];
    const code = `B-${prefix}-${String(codes.reduce((m, c) => Math.max(m, Number(c.split('-')[2]) || 0), 0) + 1).padStart(2, '0')}`;
    const id = ulid();
    d.transaction(() => {
      const recipe = d.prepare("SELECT id FROM recipe WHERE product_id = ? AND status = 'current' ORDER BY version DESC").pluck().get(product.id) as string | undefined;
      const line = d.prepare('SELECT id FROM production_line ORDER BY code').pluck().get() as string;
      d.prepare(`INSERT INTO fg_batch (id, code, product_id, recipe_id, produced_date, line_id, shift, qty, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'quarantine')`)
        .run(id, code, product.id, recipe ?? null, clock.today(), line, b.shift, qty);
      for (const l of lines) {
        d.prepare('INSERT INTO batch_consumption (id, fg_batch_id, material_lot_id, qty) VALUES (?, ?, ?, ?)').run(ulid(), id, l.lot.id, l.qty);
        d.prepare("UPDATE stock SET qty = qty - ? WHERE lot_kind = 'material' AND lot_id = ?").run(l.qty, l.lot.id);
      }
      const wh = d.prepare("SELECT id FROM warehouse WHERE code = 'WH-FG'").pluck().get() as string;
      d.prepare("INSERT INTO stock (id, warehouse_id, lot_kind, lot_id, qty) VALUES (?, ?, 'fg', ?, ?)").run(ulid(), wh, id, qty);
      appendAudit(d, actorOf(req), { module: 'B03', objectType: 'fg_batch', objectId: id, action: 'create', after: { code, qty, lots: lines.map((l) => ({ lot: l.lot.code, qty: l.qty })) } });
    })();
    return { id, code };
  });

  // ── D03: запись поверки оборудования (снимает блокировку при действующей дате) ──
  app.post('/api/equipment/:id/calibrations', { config: { auth: 'equipment.calibration.record' } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { date?: string; nextDate?: string; certificate?: string };
    const d = db();
    const e = d.prepare('SELECT * FROM equipment WHERE id = ?').get(id) as Row | undefined;
    if (!e) throw notFound('equipment', id);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? b.date! : clock.today();
    if (date > clock.today()) throw badRequest('date_in_future', { field: 'date' });
    const next = /^\d{4}-\d{2}-\d{2}$/.test(String(b.nextDate)) ? b.nextDate! : addDays(date, 365);
    if (next <= date) throw badRequest('field_required', { field: 'nextDate' });
    const certificate = String(b.certificate ?? '').trim();
    if (!certificate) throw badRequest('field_required', { field: 'certificate' });
    d.transaction(() => {
      d.prepare("UPDATE equipment SET last_cal_date = ?, next_cal_date = ?, certificate = ?, status = 'in_service' WHERE id = ?").run(date, next, certificate, id);
      appendAudit(d, actorOf(req), { module: 'D03', objectType: 'equipment', objectId: id, action: 'calibration', before: { last: e.last_cal_date, next: e.next_cal_date }, after: { last: date, next, certificate } });
    })();
    return d.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
  });

  // ── E02: журнал входов ──
  app.get('/api/login-events', { config: { auth: 'user.account.read' } }, async () =>
    db().prepare('SELECT * FROM login_event ORDER BY at DESC LIMIT 200').all());

  // ── E02: площадки (мультиплощадка — заготовка) ──
  app.get('/api/sites', { config: { auth: 'user' } }, async () => db().prepare('SELECT * FROM site ORDER BY code').all());
};
