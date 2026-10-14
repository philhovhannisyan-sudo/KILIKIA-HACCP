import type { Content } from 'pdfmake/interfaces';
import type { DB } from '../../db/connection';
import type { Translator } from '../../i18n';
import { heading, para, runs, table } from '../../print/pdf';
import type { Sheet } from '../../print/tabular';
import { formatDate } from '../../../shared/time';
import { checklistDetail } from './routes';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function checklistSheet(db: DB, id: string, tr: Translator): { c: Row; sheet: Sheet } {
  const { t, l } = tr;
  const c = checklistDetail(db, id);
  return {
    c,
    sheet: {
      name: t('prp.checklist'),
      headers: [t('plan.col.no'), t('prp.question'), t('prp.result'), t('prp.note'), t('prp.evidence')],
      rows: c.items.map((i: Row, n: number) => [n + 1, l(i.question_i18n), t(`prp.res.${i.result}`), i.note ?? '',
        i.file_name ? `${i.file_name} (${Math.ceil(i.file_size / 1024)} KB, SHA-256 ${String(i.file_sha256).slice(0, 16)}…)` : '']),
    },
  };
}

/** Печатная форма чек-листа PRP: таблица пунктов и приложения-доказательства (изображения — встроены, прочие файлы — имя и хэш) — К22. */
export function checklistPdf(db: DB, id: string, tr: Translator): { title: string; content: Content[] } {
  const { t, l } = tr;
  const { c, sheet } = checklistSheet(db, id, tr);
  const title = `${t('prp.checklist')} · ${c.prp_code}`;
  const evidence: Content[] = [];
  for (const i of c.items as Row[]) {
    if (!i.file_id) continue;
    evidence.push(runs(`${i.file_name} — ${l(i.question_i18n)}`, { bold: true, margin: [0, 8, 0, 4] }));
    if (i.file_mime === 'image/png' || i.file_mime === 'image/jpeg') {
      const content = db.prepare('SELECT content FROM file WHERE id = ?').pluck().get(i.file_id) as Buffer;
      evidence.push({ image: `data:${i.file_mime};base64,${content.toString('base64')}`, fit: [360, 240], margin: [0, 0, 0, 8] } as Content);
    } else {
      evidence.push(para(`SHA-256: ${i.file_sha256}`, { fontSize: 8, color: '#5b6763' }));
    }
  }
  return {
    title,
    content: [heading(title), para(`${l(c.prp_description)}`),
      para(`${t('prp.performed')}: ${formatDate(new Date(`${c.performed_date}T12:00:00Z`), tr.lang)} · ${c.performed_by_name} · ${t(`prp.status.${c.status}`)}`),
      table(sheet.headers, sheet.rows, [20, '*', 60, '*', 150]),
      ...(evidence.length ? [heading(t('prp.evidenceAppendix'), 2), ...evidence] : [])],
  };
}
