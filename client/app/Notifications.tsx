import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n/I18nProvider';
import { useModal } from '../components/Modal';
import { useDataVersion } from '../dataEvents';

interface Note { id: string; type: string; params: Record<string, string | number | null>; created_at: string }

/** Уведомления ролей пользователя (отклонения ККТ и среды) — только внутри приложения. */
export function NotificationsButton() {
  const { t, fmtDateTime } = useI18n();
  const modal = useModal();
  const version = useDataVersion();
  const [items, setItems] = useState<Note[]>([]);
  useEffect(() => { api<Note[]>('/api/notifications').then(setItems).catch(() => setItems([])); }, [version]);
  const text = (n: Note) => t(`note.${n.type}` as 'note.ccp_deviation', Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, String(v ?? '—')])));
  return (
    <button type="button" className="icon-btn bell" aria-label={t('note.title', { n: items.length })} title={t('note.title', { n: items.length })} data-testid="notifications"
      onClick={() => modal.open({
        title: t('note.title', { n: items.length }),
        body: items.length === 0 ? <p className="muted">{t('home.empty')}</p> : (
          <ul className="items" data-testid="notification-list">
            {items.map((n) => <li key={n.id}>{text(n)}<div className="muted">{fmtDateTime(new Date(n.created_at))}</div></li>)}
          </ul>
        ),
      })}>
      <Bell size={18} aria-hidden />
      {items.length > 0 && <span className="bell__count" data-testid="notification-count">{items.length}</span>}
    </button>
  );
}
