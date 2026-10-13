import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useDataVersion } from '../../dataEvents';

interface Nc { id: string; code: string; source_type: string; source_id: string | null; batch_code: string | null; lot_code: string | null; description: string; severity: string; status: string; registered_at: string; due_date: string }

/** Реестр несоответствий (только просмотр). Полный модуль D04 — «5 почему», Исикава, CAPA — фаза 6. */
export function NcRegistry() {
  const { t, fmtDateTime } = useI18n();
  const version = useDataVersion();
  const [items, setItems] = useState<Nc[]>([]);
  useEffect(() => { api<Nc[]>('/api/nonconformities').then(setItems).catch(() => setItems([])); }, [version]);
  return (
    <section className="card" data-testid="nc-registry">
      <h2>{t('nc.registry')}</h2>
      <div className="table-wrap">
        <table className="table table--stack">
          <thead><tr><th>{t('plan.col.code')}</th><th>{t('nc.source')}</th><th>{t('mon.col.batch')}</th><th>{t('nc.description')}</th><th>{t('nc.severity')}</th><th>{t('mon.col.status')}</th><th>{t('nc.registered')}</th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} data-nc-code={n.code}>
                <td data-label={t('plan.col.code')} className="code">{n.code}</td>
                <td data-label={t('nc.source')} data-testid="nc-source">{t(`nc.sourceType.${n.source_type}`)}</td>
                <td data-label={t('mon.col.batch')} className="code">{n.batch_code ?? n.lot_code ?? ''}</td>
                <td data-label={t('nc.description')}>{n.description}</td>
                <td data-label={t('nc.severity')}>{t(`nc.sev.${n.severity}`)}</td>
                <td data-label={t('mon.col.status')}>{t(`status.nc.${n.status}`)}</td>
                <td data-label={t('nc.registered')}>{fmtDateTime(new Date(n.registered_at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
