import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { badRequest, conflict, notFound, unprocessable } from '../../core/errors';
import { ulid } from '../../core/ids';
import { parseDecimal } from '../../../shared/number';
import { exerciseReport, traceBatch } from '../../queries/trace';
import { exercisesInPeriod } from '../../queries/period';
import { nextCode, registerDeviation } from '../monitoring/deviation';

const setting = (db: import('../../db/connection').DB, key: string) => JSON.parse(db.prepare('SELECT value FROM setting WHERE key = ?').pluck().get(key) as string);

export const traceRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;

  app.get('/api/trace/batches/:id', { config: { auth: 'a04.module.read' } }, async (req) => traceBatch(db(), (req.params as { id: string }).id));
  app.get('/api/trace/exercises', { config: { auth: 'a04.module.read' } }, async (req) => {
    const q = req.query as { from?: string; to?: string };
    return exercisesInPeriod(db(), q.from, q.to);
  });
  app.get('/api/trace/exercises/:id', { config: { auth: 'a04.module.read' } }, async (req) => exerciseReport(db(), (req.params as { id: string }).id));

  // Старт теста прослеживаемости или тестового отзыва: таймер на сервере, целевое время — снимок настройки (DEMO 4 ч)
  app.post('/api/trace/exercises', { config: { auth: 'trace.exercise.run' } }, async (req) => {
    const b = (req.body ?? {}) as { type?: string; fgBatchId?: string };
    if (b.type !== 'trace' && b.type !== 'recall') throw badRequest('field_required', { field: 'type' });
    const d = db();
    const t = traceBatch(d, String(b.fgBatchId));
    const target = setting(d, b.type === 'trace' ? 'trace_target_minutes' : 'recall_target_minutes') as number;
    const id = ulid();
    d.transaction(() => {
      d.prepare(`INSERT INTO trace_exercise (id, code, type, fg_batch_id, started_at, target_min_snapshot, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, nextCode(d, 'trace_exercise', b.type === 'trace' ? 'TR' : 'RC'), b.type, t.batch.id, clock.nowIso(), target, actorOf(req).id);
      if (b.type === 'recall') for (const f of t.forward) d.prepare('INSERT INTO recall_item (id, exercise_id, shipment_line_id, returned) VALUES (?, ?, ?, 0)').run(ulid(), id, f.line_id);
      appendAudit(d, actorOf(req), { module: 'A04', objectType: 'trace_exercise', objectId: id, action: 'start', after: { type: b.type, batch: t.batch.code, targetMin: target } });
    })();
    return exerciseReport(d, id);
  });

  // Отметка «возвращено» по позиции отзыва
  app.put('/api/trace/exercises/:id/items/:itemId', { config: { auth: 'trace.exercise.run' } }, async (req) => {
    const { id, itemId } = req.params as { id: string; itemId: string };
    const b = (req.body ?? {}) as { returned?: boolean; returnedQty?: unknown };
    const d = db();
    const ex = exerciseReport(d, id);
    if (ex.finished_at) throw conflict('exercise_finished', { code: ex.code });
    const item = (ex.items as Record<string, any>[]).find((i) => i.id === itemId); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!item) throw notFound('recall_item', itemId);
    let qty: number | null = null;
    if (b.returnedQty !== undefined && b.returnedQty !== null && b.returnedQty !== '') {
      qty = typeof b.returnedQty === 'number' ? b.returnedQty : parseDecimal(String(b.returnedQty));
      if (qty === null || qty < 0 || qty > item.qty) throw badRequest('invalid_number', { field: 'returnedQty', max: item.qty });
    }
    d.transaction(() => {
      d.prepare('UPDATE recall_item SET returned = ?, returned_qty = ? WHERE id = ?').run(Number(!!b.returned), b.returned ? (qty ?? item.qty) : null, itemId);
      appendAudit(d, actorOf(req), { module: 'A04', objectType: 'recall_item', objectId: itemId, action: 'update', after: { returned: !!b.returned, qty } });
    })();
    return exerciseReport(d, id);
  });

  // Завершение: длительность и соответствие целевому времени; превышение → отчёт помечен, несоответствие в D04 (К19)
  app.post('/api/trace/exercises/:id/finish', { config: { auth: 'trace.exercise.run' } }, async (req) => {
    const { id } = req.params as { id: string };
    const d = db();
    const actor = actorOf(req);
    const ex = exerciseReport(d, id);
    if (ex.finished_at) throw conflict('exercise_finished', { code: ex.code });
    const finished = clock.nowIso();
    const duration = Math.round(((Date.parse(finished) - Date.parse(ex.started_at)) / 60_000) * 10) / 10;
    const compliant = duration <= ex.target_min_snapshot;
    d.transaction(() => {
      let ncId: string | null = null;
      if (!compliant) {
        ncId = registerDeviation(d, actor, { sourceType: 'recall', sourceId: id, fgBatchId: null, cpType: null,
          description: `${ex.code} (${ex.type === 'trace' ? 'trace' : 'mock recall'}, ${ex.batch_code}): ${duration} min > ${ex.target_min_snapshot} min` }).ncId;
      }
      d.prepare('UPDATE trace_exercise SET finished_at = ?, duration_min = ?, compliant = ?, nc_id = ? WHERE id = ?').run(finished, duration, Number(compliant), ncId, id);
      appendAudit(d, actor, { module: 'A04', objectType: 'trace_exercise', objectId: id, action: 'finish', after: { durationMin: duration, compliant } });
    })();
    return exerciseReport(d, id);
  });

  // ── C03: отгрузка с проверками статуса партии, остатка и FEFO (данные полные, интерфейс — каркас) ──
  app.get('/api/customers', { config: { auth: 'user' } }, async () => db().prepare('SELECT * FROM customer ORDER BY code').all());
  app.get('/api/shipments', { config: { auth: 'c03.module.read' } }, async () =>
    db().prepare(`SELECT sh.*, c.name AS customer_name, group_concat(b.code || ' × ' || sl.qty, ', ') AS lines
      FROM shipment sh JOIN customer c ON c.id = sh.customer_id JOIN shipment_line sl ON sl.shipment_id = sh.id JOIN fg_batch b ON b.id = sl.fg_batch_id
      GROUP BY sh.id ORDER BY sh.shipped_date DESC, sh.number DESC`).all());

  app.post('/api/shipments', { config: { auth: 'shipment.record.create' } }, async (req) => {
    const b = (req.body ?? {}) as { customerId?: string; lines?: { fgBatchId?: string; qty?: unknown; fefoReason?: string }[]; tempMin?: unknown; tempMax?: unknown };
    const d = db();
    if (!d.prepare('SELECT 1 FROM customer WHERE id = ?').get(b.customerId)) throw badRequest('field_required', { field: 'customerId' });
    if (!Array.isArray(b.lines) || b.lines.length === 0) throw badRequest('field_required', { field: 'lines' });
    const lines = b.lines.map((l, i) => {
      const batch = d.prepare('SELECT id, code, status, product_id, produced_date FROM fg_batch WHERE id = ?').get(l.fgBatchId) as
        { id: string; code: string; status: string; product_id: string; produced_date: string } | undefined;
      if (!batch) throw badRequest('field_required', { field: `lines[${i}].fgBatchId` });
      // brief §6: партия в «Карантине» или «Заблокирована» не отгружается; сообщение называет партию и статус (К20)
      if (batch.status !== 'released') throw unprocessable('batch_not_shippable', { batch: batch.code, status: batch.status }, `Batch ${batch.code} cannot be shipped: status ${batch.status}`);
      const qty = typeof l.qty === 'number' ? l.qty : parseDecimal(String(l.qty ?? ''));
      if (qty === null || qty <= 0) throw badRequest('invalid_number', { field: `lines[${i}].qty` });
      const stock = d.prepare("SELECT coalesce(sum(qty), 0) FROM stock WHERE lot_kind = 'fg' AND lot_id = ?").pluck().get(batch.id) as number;
      if (qty > stock) throw unprocessable('insufficient_stock', { batch: batch.code, available: stock });
      // FEFO: есть более старая выпущенная партия того же продукта с остатком → нужно обоснование
      const older = d.prepare(`SELECT b.code FROM fg_batch b WHERE b.product_id = ? AND b.status = 'released' AND b.produced_date < ? AND b.id <> ?
        AND (SELECT coalesce(sum(qty), 0) FROM stock s WHERE s.lot_kind = 'fg' AND s.lot_id = b.id) > 0 ORDER BY b.produced_date LIMIT 1`).pluck().get(batch.product_id, batch.produced_date, batch.id) as string | undefined;
      if (older && !l.fefoReason?.trim()) throw conflict('fefo_violation', { batch: batch.code, olderBatch: older }, `FEFO: older batch ${older} is in stock; justification required`);
      return { batch, qty, fefoReason: older ? l.fefoReason!.trim() : null };
    });
    const id = ulid();
    const number = nextCode(d, 'shipment', 'SH', 'number');
    d.transaction(() => {
      d.prepare('INSERT INTO shipment (id, number, customer_id, shipped_date, transport_temp_min, transport_temp_max) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, number, b.customerId, clock.today(), parseDecimal(String(b.tempMin ?? '')) , parseDecimal(String(b.tempMax ?? '')));
      for (const l of lines) {
        d.prepare('INSERT INTO shipment_line (id, shipment_id, fg_batch_id, qty, fefo_override_reason) VALUES (?, ?, ?, ?, ?)').run(ulid(), id, l.batch.id, l.qty, l.fefoReason);
        d.prepare("UPDATE stock SET qty = qty - ? WHERE lot_kind = 'fg' AND lot_id = ?").run(l.qty, l.batch.id);
      }
      appendAudit(d, actorOf(req), { module: 'C03', objectType: 'shipment', objectId: id, action: 'create', after: { number, lines: lines.map((l) => ({ batch: l.batch.code, qty: l.qty, fefoReason: l.fefoReason })) } });
    })();
    return { id, number };
  });
};
