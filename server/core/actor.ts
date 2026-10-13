import type { DB } from '../db/connection';

// Тот, кто действует: пользователь с объединёнными правами всех его ролей (brief §7) или система.
export interface Actor {
  id: string | null;
  login: string;
  fullName: string;
  roles: string[];
  permissions: Set<string>;
}

export const SYSTEM_ACTOR: Actor = { id: null, login: 'system', fullName: 'SYSTEM', roles: ['system'], permissions: new Set() };

export function loadActor(db: DB, userId: string): Actor | null {
  const u = db.prepare('SELECT id, login, full_name, active FROM user WHERE id = ?').get(userId) as
    | { id: string; login: string; full_name: string; active: number } | undefined;
  if (!u || !u.active) return null;
  const roles = db
    .prepare('SELECT r.code FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.code')
    .pluck().all(userId) as string[];
  const perms = db
    .prepare(`SELECT DISTINCT rp.permission_code FROM user_role ur JOIN role_permission rp ON rp.role_id = ur.role_id WHERE ur.user_id = ?`)
    .pluck().all(userId) as string[];
  return { id: u.id, login: u.login, fullName: u.full_name, roles, permissions: new Set(perms) };
}
