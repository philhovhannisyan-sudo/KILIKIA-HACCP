import { useI18n } from '../i18n/I18nProvider';

// Фактическое время события вводится по Еревану (UTC+4, без перехода на летнее время) и передаётся на сервер в UTC.
export const yerevanLocalNow = () => new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 16);
export const yerevanLocalToIso = (v: string) => new Date(`${v}:00+04:00`).toISOString();

export function EventTimeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id}>{t('mon.eventTime')}</label>
      <input id={id} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="muted field__hint">{t('mon.eventTimeHint')}</span>
    </div>
  );
}
