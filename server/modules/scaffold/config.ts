// Конфигурация 19 каркасов (brief §2): один шаблон, разные поля/колонки/показатели.
// Показатели и таблицы считаются из реальных данных; подписи — ключи словаря sc.col.* / sc.kpi.<код>.<n>.
export type ColKind = 'text' | 'i18n' | 'date' | 'number' | 'status';
export interface Col { key: string; kind?: ColKind; status?: string }
export interface ScaffoldDef {
  kpis: string[];          // SQL, возвращающий одно число; подпись sc.kpi.<код>.<индекс>
  rows: string;            // SQL строк таблицы (колонки названы ключами cols)
  cols: Col[];
  fields: { key: string; type: 'text' | 'number' | 'date' }[]; // поля формы будущего модуля
  form?: 'B03' | 'C01' | 'C03' | 'D03'; // рабочая форма на полных данных (Р-14)
}

const rec = (m: string) => `FROM scaffold_record WHERE module = '${m}'`;
const j = (k: string) => `json_extract(data, '$.${k}')`;

export const SCAFFOLDS: Record<string, ScaffoldDef> = {
  A05: {
    kpis: [`SELECT count(*) ${rec('A05')} AND record_date >= date(:today, '-30 day')`, `SELECT count(*) ${rec('A05')} AND ${j('atp')} > 100`],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('area')} AS area, ${j('method')} AS method, ${j('atp')} AS atp, ${j('result')} AS result ${rec('A05')} ORDER BY record_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'area', kind: 'i18n' }, { key: 'method' }, { key: 'atp', kind: 'number' }, { key: 'result', kind: 'status', status: 'sc.res' }],
    fields: [{ key: 'area', type: 'text' }, { key: 'method', type: 'text' }, { key: 'atp', type: 'number' }, { key: 'date', type: 'date' }],
  },
  A06: {
    kpis: [`SELECT count(*) ${rec('A06')}`, `SELECT count(*) ${rec('A06')} AND ${j('activity')} > 0`],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('point')} AS point, ${j('activity')} AS activity, ${j('contractor')} AS contractor ${rec('A06')} ORDER BY record_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'point' }, { key: 'activity', kind: 'number' }, { key: 'contractor' }],
    fields: [{ key: 'point', type: 'text' }, { key: 'activity', type: 'number' }, { key: 'contractor', type: 'text' }, { key: 'date', type: 'date' }],
  },
  A07: {
    kpis: [`SELECT count(*) ${rec('A07')}`, `SELECT coalesce(sum(${j('attendees')}), 0) ${rec('A07')}`],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('topic')} AS topic, ${j('attendees')} AS attendees ${rec('A07')} ORDER BY record_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'topic', kind: 'i18n' }, { key: 'attendees', kind: 'number' }],
    fields: [{ key: 'topic', type: 'text' }, { key: 'attendees', type: 'number' }, { key: 'date', type: 'date' }],
  },
  A08: {
    kpis: ['SELECT count(*) FROM product', `SELECT count(*) ${rec('A08')}`],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('product')} AS product, ${j('note')} AS note ${rec('A08')} ORDER BY record_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'product' }, { key: 'note', kind: 'i18n' }],
    fields: [{ key: 'product', type: 'text' }, { key: 'allergens', type: 'text' }, { key: 'note', type: 'text' }],
  },
  A09: {
    kpis: [`SELECT count(*) ${rec('A09')}`, 'SELECT count(*) FROM material'],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('material')} AS material, ${j('risk')} AS risk ${rec('A09')} ORDER BY record_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'material' }, { key: 'risk', kind: 'status', status: 'sc.risk' }],
    fields: [{ key: 'material', type: 'text' }, { key: 'risk', type: 'text' }, { key: 'date', type: 'date' }],
  },
  B01: {
    kpis: ['SELECT count(*) FROM product', 'SELECT count(*) FROM recipe_line'],
    rows: `SELECT p.code, p.name_i18n AS name, r.version, r.valid_from AS validFrom, (SELECT count(*) FROM recipe_line l WHERE l.recipe_id = r.id) AS lines, p.shelf_life_days AS shelfLife
      FROM product p JOIN recipe r ON r.product_id = p.id ORDER BY p.code`,
    cols: [{ key: 'code' }, { key: 'name', kind: 'i18n' }, { key: 'version', kind: 'number' }, { key: 'validFrom', kind: 'date' }, { key: 'lines', kind: 'number' }, { key: 'shelfLife', kind: 'number' }],
    fields: [{ key: 'product', type: 'text' }, { key: 'material', type: 'text' }, { key: 'qty', type: 'number' }, { key: 'validFrom', type: 'date' }],
  },
  B02: {
    kpis: [`SELECT count(*) ${rec('B02')}`, `SELECT coalesce(sum(${j('qty')}), 0) ${rec('B02')}`],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('product')} AS product, ${j('qty')} AS qty, ${j('shift')} AS shift ${rec('B02')} ORDER BY record_date`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'product' }, { key: 'qty', kind: 'number' }, { key: 'shift' }],
    fields: [{ key: 'product', type: 'text' }, { key: 'qty', type: 'number' }, { key: 'shift', type: 'text' }, { key: 'date', type: 'date' }],
  },
  B03: {
    kpis: ['SELECT count(*) FROM fg_batch', 'SELECT count(*) FROM batch_consumption'],
    rows: `SELECT b.code, b.produced_date AS date, p.name_i18n AS product, b.shift, b.qty, (SELECT count(*) FROM batch_consumption c WHERE c.fg_batch_id = b.id) AS lots, b.status
      FROM fg_batch b JOIN product p ON p.id = b.product_id ORDER BY b.produced_date DESC, b.code DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'product', kind: 'i18n' }, { key: 'shift' }, { key: 'qty', kind: 'number' }, { key: 'lots', kind: 'number' }, { key: 'status', kind: 'status', status: 'status.batch' }],
    fields: [], form: 'B03',
  },
  C01: {
    kpis: ["SELECT count(*) FROM stock WHERE qty > 0", "SELECT count(*) FROM fg_batch WHERE status = 'quarantine'"],
    rows: `SELECT w.code AS warehouse, b.code AS batch, p.name_i18n AS product, s.qty, date(b.produced_date, '+' || p.shelf_life_days || ' days') AS expiry, b.status
      FROM stock s JOIN warehouse w ON w.id = s.warehouse_id JOIN fg_batch b ON b.id = s.lot_id AND s.lot_kind = 'fg' JOIN product p ON p.id = b.product_id WHERE s.qty > 0
      UNION ALL
      SELECT w.code, l.code, m.name_i18n, s.qty, l.expiry_date, l.status FROM stock s JOIN warehouse w ON w.id = s.warehouse_id
      JOIN material_lot l ON l.id = s.lot_id AND s.lot_kind = 'material' JOIN material m ON m.id = l.material_id WHERE s.qty > 0
      ORDER BY 1, 5`,
    cols: [{ key: 'warehouse' }, { key: 'batch' }, { key: 'product', kind: 'i18n' }, { key: 'qty', kind: 'number' }, { key: 'expiry', kind: 'date' }, { key: 'status', kind: 'status', status: 'status.batch' }],
    fields: [], form: 'C01',
  },
  C02: {
    kpis: ["SELECT count(*) FROM supplier WHERE approval_status = 'approved'", "SELECT count(*) FROM supplier_document WHERE valid_to < :today"],
    rows: `SELECT s.code, s.name, s.rating, s.approval_status AS approval, (SELECT count(*) FROM supplier_document d WHERE d.supplier_id = s.id) AS documents FROM supplier s ORDER BY s.code`,
    cols: [{ key: 'code' }, { key: 'name' }, { key: 'rating', kind: 'number' }, { key: 'approval', kind: 'status', status: 'sc.approval' }, { key: 'documents', kind: 'number' }],
    fields: [{ key: 'name', type: 'text' }, { key: 'rating', type: 'number' }, { key: 'documents', type: 'text' }],
  },
  C03: {
    kpis: ['SELECT count(*) FROM shipment', 'SELECT count(DISTINCT customer_id) FROM shipment'],
    rows: `SELECT sh.number AS code, sh.shipped_date AS date, c.name AS customer, (SELECT group_concat(b.code, ', ') FROM shipment_line l JOIN fg_batch b ON b.id = l.fg_batch_id WHERE l.shipment_id = sh.id) AS batch,
      (SELECT sum(qty) FROM shipment_line l WHERE l.shipment_id = sh.id) AS qty, sh.transport_temp_min || '…' || sh.transport_temp_max || ' °C' AS temp
      FROM shipment sh JOIN customer c ON c.id = sh.customer_id ORDER BY sh.shipped_date DESC, sh.number DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'customer' }, { key: 'batch' }, { key: 'qty', kind: 'number' }, { key: 'temp' }],
    fields: [], form: 'C03',
  },
  D01: {
    kpis: ["SELECT count(*) FROM material_lot WHERE status = 'released'", "SELECT count(*) FROM fg_batch WHERE status IN ('quarantine','blocked')"],
    rows: `SELECT l.code AS batch, l.received_date AS date, m.name_i18n AS product, s.name AS supplier, l.status FROM material_lot l JOIN material m ON m.id = l.material_id JOIN supplier s ON s.id = l.supplier_id ORDER BY l.received_date DESC`,
    cols: [{ key: 'batch' }, { key: 'date', kind: 'date' }, { key: 'product', kind: 'i18n' }, { key: 'supplier' }, { key: 'status', kind: 'status', status: 'status.batch' }],
    fields: [{ key: 'batch', type: 'text' }, { key: 'result', type: 'text' }, { key: 'date', type: 'date' }],
  },
  D02: {
    kpis: ['SELECT count(*) FROM lab_sample', "SELECT count(*) FROM lab_sample WHERE approval_stage <> 'approved'"],
    rows: `SELECT ls.code, ls.sampled_date AS date, coalesce(b.code, l.code) AS batch, ls.method_i18n AS method, ls.result, ls.spec, ls.approval_stage AS stage
      FROM lab_sample ls LEFT JOIN fg_batch b ON b.id = ls.fg_batch_id LEFT JOIN material_lot l ON l.id = ls.material_lot_id ORDER BY ls.sampled_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'batch' }, { key: 'method', kind: 'i18n' }, { key: 'result' }, { key: 'spec' }, { key: 'stage', kind: 'status', status: 'sc.stage' }],
    fields: [{ key: 'batch', type: 'text' }, { key: 'method', type: 'text' }, { key: 'result', type: 'text' }, { key: 'date', type: 'date' }],
  },
  D03: {
    kpis: ["SELECT count(*) FROM equipment WHERE next_cal_date < :today", "SELECT count(*) FROM equipment WHERE next_cal_date BETWEEN :today AND date(:today, '+30 day')"],
    rows: `SELECT code, name_i18n AS name, zone_i18n AS zone, last_cal_date AS lastCal, next_cal_date AS nextCal, certificate,
      CASE WHEN next_cal_date < :today THEN 'overdue' WHEN next_cal_date <= date(:today, '+30 day') THEN 'soon' ELSE 'ok' END AS status
      FROM equipment ORDER BY next_cal_date`,
    cols: [{ key: 'code' }, { key: 'name', kind: 'i18n' }, { key: 'zone', kind: 'i18n' }, { key: 'lastCal', kind: 'date' }, { key: 'nextCal', kind: 'date' }, { key: 'certificate' }, { key: 'status', kind: 'status', status: 'sc.cal' }],
    fields: [], form: 'D03',
  },
  D05: {
    kpis: ["SELECT count(*) FROM internal_audit WHERE status = 'completed'", 'SELECT count(*) FROM audit_finding'],
    rows: `SELECT a.code, a.audit_date AS date, a.scope_i18n AS scope, a.status, (SELECT count(*) FROM audit_finding f WHERE f.audit_id = a.id) AS findings FROM internal_audit a ORDER BY a.audit_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'scope', kind: 'i18n' }, { key: 'status', kind: 'status', status: 'sc.audit' }, { key: 'findings', kind: 'number' }],
    fields: [{ key: 'scope', type: 'text' }, { key: 'date', type: 'date' }],
  },
  D06: {
    kpis: ['SELECT count(*) FROM claim', "SELECT count(*) FROM claim WHERE status <> 'closed'"],
    rows: `SELECT cl.code, cl.received_date AS date, c.name AS customer, b.code AS batch, cl.category, cl.status FROM claim cl JOIN customer c ON c.id = cl.customer_id LEFT JOIN fg_batch b ON b.id = cl.fg_batch_id ORDER BY cl.received_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'customer' }, { key: 'batch' }, { key: 'category', kind: 'status', status: 'sc.claimCat' }, { key: 'status', kind: 'status', status: 'sc.claim' }],
    fields: [{ key: 'customer', type: 'text' }, { key: 'batch', type: 'text' }, { key: 'category', type: 'text' }, { key: 'date', type: 'date' }],
  },
  D07: {
    kpis: ["SELECT count(*) FROM document WHERE status = 'current'", "SELECT count(*) FROM document WHERE status = 'current' AND review_due_date <= date(:today, '+30 day')"],
    rows: 'SELECT code, title_i18n AS title, version, status, approved_date AS date, review_due_date AS reviewDue FROM document ORDER BY code, version',
    cols: [{ key: 'code' }, { key: 'title', kind: 'i18n' }, { key: 'version', kind: 'number' }, { key: 'status', kind: 'status', status: 'status.document' }, { key: 'date', kind: 'date' }, { key: 'reviewDue', kind: 'date' }],
    fields: [{ key: 'title', type: 'text' }, { key: 'version', type: 'number' }, { key: 'reviewDue', type: 'date' }],
  },
  D08: {
    kpis: [`SELECT count(*) ${rec('D08')}`, "SELECT count(*) FROM nonconformity WHERE status <> 'closed'"],
    rows: `SELECT ${j('code')} AS code, record_date AS date, ${j('title')} AS title, ${j('status')} AS status ${rec('D08')} ORDER BY record_date DESC`,
    cols: [{ key: 'code' }, { key: 'date', kind: 'date' }, { key: 'title', kind: 'i18n' }, { key: 'status', kind: 'status', status: 'sc.audit' }],
    fields: [{ key: 'title', type: 'text' }, { key: 'date', type: 'date' }],
  },
  E02: {
    kpis: ['SELECT count(*) FROM user WHERE active = 1', "SELECT count(*) FROM login_event WHERE result = 'failure'"],
    rows: `SELECT u.login AS code, u.full_name AS name, (SELECT group_concat(r.code, ', ') FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles, u.active FROM user u ORDER BY u.login`,
    cols: [{ key: 'code' }, { key: 'name' }, { key: 'roles' }, { key: 'active', kind: 'number' }],
    fields: [{ key: 'name', type: 'text' }, { key: 'code', type: 'text' }, { key: 'roles', type: 'text' }],
  },
};
