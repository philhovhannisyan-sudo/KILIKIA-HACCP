import { createHash } from 'node:crypto';
import type { DB } from '../db/connection';
import type { Actor } from './actor';
import { clock } from './clock';
import { badRequest } from './errors';
import { ulid } from './ids';

// Файлы-доказательства хранятся в базе (BLOB) — попадают в бэкап и экспорт состояния.
export const FILE_MAX_BYTES = 5 * 1024 * 1024;
export const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'];

export interface FileUpload { name?: string; mime?: string; base64?: string }

export function storeFile(db: DB, actor: Actor, f: FileUpload): string {
  const name = String(f.name ?? '').trim().replace(/[\\/]/g, '_');
  if (!name || !f.base64) throw badRequest('file_invalid');
  if (!FILE_TYPES.includes(String(f.mime))) throw badRequest('file_type_not_allowed', { types: FILE_TYPES.join(', ') });
  const content = Buffer.from(f.base64, 'base64');
  if (content.length === 0 || content.length > FILE_MAX_BYTES) throw badRequest('file_too_large', { maxMb: FILE_MAX_BYTES / 1024 / 1024 });
  const id = ulid();
  db.prepare('INSERT INTO file (id, sha256, name, mime, size, content, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, createHash('sha256').update(content).digest('hex'), name, f.mime, content.length, content, actor.id, clock.nowIso());
  return id;
}
