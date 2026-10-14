import type { DB } from '../db/connection';
import { notFound } from '../core/errors';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Прослеживаемость партии ГП: назад — партии сырья/упаковки и поставщики, вперёд — отгрузки и клиенты (К18). */
export function traceBatch(db: DB, fgBatchId: string) {
  const batch = db.prepare(`SELECT b.*, p.code AS product_code, p.name_i18n AS product_name FROM fg_batch b JOIN product p ON p.id = b.product_id WHERE b.id = ?`).get(fgBatchId) as Row | undefined;
  if (!batch) throw notFound('fg_batch', fgBatchId);
  const backward = db.prepare(`SELECT c.qty, l.id AS lot_id, l.code AS lot_code, l.received_date, l.expiry_date, l.unit, l.status AS lot_status,
      m.code AS material_code, m.name_i18n AS material_name, m.kind, s.id AS supplier_id, s.code AS supplier_code, s.name AS supplier_name
    FROM batch_consumption c JOIN material_lot l ON l.id = c.material_lot_id JOIN material m ON m.id = l.material_id
    JOIN supplier s ON s.id = l.supplier_id WHERE c.fg_batch_id = ? ORDER BY m.kind DESC, m.code`).all(fgBatchId) as Row[];
  const forward = db.prepare(`SELECT sl.id AS line_id, sl.qty, sh.id AS shipment_id, sh.number, sh.shipped_date, sh.transport_temp_min, sh.transport_temp_max,
      c.id AS customer_id, c.code AS customer_code, c.name AS customer_name, c.address
    FROM shipment_line sl JOIN shipment sh ON sh.id = sl.shipment_id JOIN customer c ON c.id = sh.customer_id
    WHERE sl.fg_batch_id = ? ORDER BY sh.shipped_date, sh.number`).all(fgBatchId) as Row[];
  const uniq = <T extends Row>(rows: T[], key: string) => [...new Map(rows.map((r) => [r[key], r])).values()];
  const stock = db.prepare("SELECT coalesce(sum(qty), 0) FROM stock WHERE lot_kind = 'fg' AND lot_id = ?").pluck().get(fgBatchId) as number;
  return {
    batch, backward, forward, stock,
    suppliers: uniq(backward, 'supplier_id').map((r) => ({ id: r.supplier_id, code: r.supplier_code, name: r.supplier_name })),
    customers: uniq(forward, 'customer_id').map((r) => ({ id: r.customer_id, code: r.customer_code, name: r.customer_name })),
    shippedQty: forward.reduce((s, r) => s + r.qty, 0),
  };
}

/** Отчёт об упражнении (тест прослеживаемости / тестовый отзыв): общий код экрана, печати и пакета для аудита. */
export function exerciseReport(db: DB, id: string): Row {
  const ex = db.prepare(`SELECT e.*, b.code AS batch_code, u.full_name AS created_by_name, n.code AS nc_code
    FROM trace_exercise e JOIN fg_batch b ON b.id = e.fg_batch_id JOIN user u ON u.id = e.created_by LEFT JOIN nonconformity n ON n.id = e.nc_id
    WHERE e.id = ?`).get(id) as Row | undefined;
  if (!ex) throw notFound('trace_exercise', id);
  const items = db.prepare(`SELECT ri.*, sl.qty, sh.number, sh.shipped_date, c.name AS customer_name
    FROM recall_item ri JOIN shipment_line sl ON sl.id = ri.shipment_line_id JOIN shipment sh ON sh.id = sl.shipment_id JOIN customer c ON c.id = sh.customer_id
    WHERE ri.exercise_id = ? ORDER BY sh.number`).all(id) as Row[];
  const shipped = items.reduce((s, i) => s + i.qty, 0);
  const returned = items.reduce((s, i) => s + (i.returned ? (i.returned_qty ?? i.qty) : 0), 0);
  const shipments = ex.type === 'recall' ? new Set(items.map((i) => i.number)).size
    : (db.prepare('SELECT count(DISTINCT shipment_id) FROM shipment_line WHERE fg_batch_id = ?').pluck().get(ex.fg_batch_id) as number);
  return {
    ...ex, items, shipments, shippedQty: shipped, returnedQty: returned,
    returnedPercent: shipped ? Math.round((returned / shipped) * 1000) / 10 : null,
  };
}
