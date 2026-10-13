import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';

// Любой элемент, изменяющий данные, выводится только через эти компоненты: без права он не рендерится,
// а атрибут data-action позволяет тесту К7 проверить, что у аудитора таких элементов нет.
// Скрытая кнопка не является запретом — сервер проверяет то же право.
export function Can({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : null;
}

export function ActionButton({ permission, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { permission: string }) {
  const { can } = useAuth();
  if (!can(permission)) return null;
  return <button type="button" {...rest} className={className ?? 'btn'} data-action={permission} />;
}
