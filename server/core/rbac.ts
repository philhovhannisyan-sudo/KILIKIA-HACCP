import type { Actor } from './actor';
import { forbidden } from './errors';

/** Единственная точка проверки прав. Бросает 403 с названием недостающего права. */
export function authorize(actor: Actor, permission: string): void {
  if (!actor.permissions.has(permission)) throw forbidden(permission);
}

export const can = (actor: Actor, permission: string) => actor.permissions.has(permission);
