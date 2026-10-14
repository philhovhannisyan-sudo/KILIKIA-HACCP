import type { RouteRegistrar } from '../../http';
import { actorOf } from '../../http';
import type { DB } from '../../db/connection';
import { appendAudit } from '../../core/audit';
import { clock } from '../../core/clock';
import { badRequest, notFound } from '../../core/errors';
import { storeFile, type FileUpload } from '../../core/files';
import { ulid } from '../../core/ids';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Реестр PRP с ближайшей датой проверки (общий запрос экрана, печати и панели готовности). */
export function prpRegistry(db: DB, today: string): Row[] {
  return (db.prepare(`SELECT p.*, s.number AS section_number, s.short_name_i18n AS section_name, s.verify_status,
      date(p.last_checked_date, '+' || p.frequency_days || ' days') AS next_due
    FROM prp p JOIN prp_section s ON s.id = p.section_id ORDER BY CAST(s.number AS INTEGER), p.code`).all() as Row[])
    .map((p) => ({ ...p, overdue: !p.next_due || p.next_due < today }));
}

export function checklistDetail(db: DB, id: string): Row {
  const c = db.prepare(`SELECT c.*, p.code AS prp_code, p.description_i18n AS prp_description, u.full_name AS performed_by_name
    FROM prp_checklist c JOIN prp p ON p.id = c.prp_id JOIN user u ON u.id = c.performed_by WHERE c.id = ?`).get(id) as Row | undefined;
  if (!c) throw notFound('prp_checklist', id);
  const items = db.prepare(`SELECT i.*, f.name AS file_name, f.mime AS file_mime, f.size AS file_size, f.sha256 AS file_sha256
    FROM prp_checklist_item i LEFT JOIN file f ON f.id = i.file_id WHERE i.checklist_id = ? ORDER BY i.rowid`).all(id);
  return { ...c, items };
}

export const prpRoutes: RouteRegistrar = (app, ctx) => {
  const db = () => ctx.store.db;

  app.get('/api/prp', { config: { auth: 'a02.module.read' } }, async () => prpRegistry(db(), clock.today()));
  app.get('/api/prp/checklists', { config: { auth: 'a02.module.read' } }, async (req) => {
    const { prpId } = req.query as { prpId?: string };
    const ids = (prpId ? db().prepare('SELECT id FROM prp_checklist WHERE prp_id = ? ORDER BY performed_date DESC, rowid DESC').pluck().all(prpId)
      : db().prepare('SELECT id FROM prp_checklist ORDER BY performed_date DESC, rowid DESC').pluck().all()) as string[];
    return ids.map((id) => checklistDetail(db(), id));
  });
  app.get('/api/prp/checklists/:id', { config: { auth: 'a02.module.read' } }, async (req) => checklistDetail(db(), (req.params as { id: string }).id));

  // Чек-лист периодической оценки PRP с доказательствами (К22)
  app.post('/api/prp/:id/checklists', { config: { auth: 'prp.checklist.create' }, bodyLimit: 30 * 1024 * 1024 }, async (req) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { items?: { question?: string; result?: string; note?: string; file?: FileUpload | null }[] };
    const d = db();
    const actor = actorOf(req);
    if (!d.prepare('SELECT 1 FROM prp WHERE id = ?').get(id)) throw notFound('prp', id);
    if (!Array.isArray(b.items) || b.items.length === 0) throw badRequest('field_required', { field: 'items' });
    const items = b.items.map((it, i) => {
      const q = String(it.question ?? '').trim();
      if (!q) throw badRequest('field_required', { field: `items[${i}].question` });
      if (!['ok', 'nok', 'na'].includes(String(it.result))) throw badRequest('field_required', { field: `items[${i}].result` });
      return { question: q, result: it.result as string, note: String(it.note ?? '').trim() || null, file: it.file ?? null };
    });
    const today = clock.today();
    const cid = ulid();
    d.transaction(() => {
      const status = items.some((i) => i.result === 'nok') ? 'completed_with_findings' : 'completed';
      d.prepare('INSERT INTO prp_checklist (id, prp_id, performed_date, performed_by, status) VALUES (?, ?, ?, ?, ?)').run(cid, id, today, actor.id, status);
      for (const it of items) {
        const fileId = it.file ? storeFile(d, actor, it.file) : null;
        d.prepare('INSERT INTO prp_checklist_item (id, checklist_id, question_i18n, result, note, file_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(ulid(), cid, JSON.stringify({ src: it.question }), it.result, it.note, fileId);
      }
      d.prepare('UPDATE prp SET last_checked_date = ? WHERE id = ?').run(today, id);
      appendAudit(d, actor, { module: 'A02', objectType: 'prp_checklist', objectId: cid, action: 'create', after: { prp: id, items: items.length, status, files: items.filter((i) => i.file).length } });
    })();
    return checklistDetail(d, cid);
  });

  // Скачивание файла-доказательства
  app.get('/api/files/:id', { config: { auth: 'user' } }, async (req, reply) => {
    const f = db().prepare('SELECT name, mime, content FROM file WHERE id = ?').get((req.params as { id: string }).id) as { name: string; mime: string; content: Buffer } | undefined;
    if (!f) throw notFound('file');
    return reply.header('content-type', f.mime).header('content-disposition', `inline; filename="${encodeURIComponent(f.name)}"`).send(f.content);
  });
};
