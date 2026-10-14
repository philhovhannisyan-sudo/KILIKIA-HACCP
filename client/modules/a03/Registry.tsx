import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { cpLabel } from '../../i18n/labels';
import { useDataVersion } from '../../dataEvents';

interface Param { id: string; code: string; name_i18n: string; kind: string; limit_min: number | null; limit_max: number | null; unit: string | null; frequency_i18n: string }
interface Cp { id: string; code: string; type: string; name_i18n: string; responsible_role: string; parameters: Param[] }

/** Реестр ККТ/OPRP (A03) — те же записи, что создаёт мастер A01 (К16). Полный модуль мониторинга — фаза 4. */
export function ControlPointRegistry() {
  const { t, l, fmtNumber } = useI18n();
  const version = useDataVersion();
  const [items, setItems] = useState<Cp[]>([]);
  useEffect(() => { api<Cp[]>('/api/control-points').then(setItems).catch(() => setItems([])); }, [version]);
  const limit = (p: Param) => p.kind === 'pass_fail' ? t('plan.passFail')
    : [p.limit_min !== null ? `≥ ${fmtNumber(p.limit_min)}` : '', p.limit_max !== null ? `≤ ${fmtNumber(p.limit_max)}` : ''].filter(Boolean).join('; ') + (p.unit ? ` ${p.unit}` : '');
  return (
    <section className="card" data-testid="cp-registry">
      <h2>{t('a03.registry')}</h2>
      <div className="table-wrap">
        <table className="table table--stack">
          <thead><tr><th>{t('plan.col.code')}</th><th>{t('wizard.cpName')}</th><th>{t('plan.col.parameter')}</th><th>{t('plan.col.limits')}</th><th>{t('plan.col.frequency')}</th><th>{t('plan.col.responsible')}</th></tr></thead>
          <tbody>
            {items.flatMap((cp) => cp.parameters.map((p, i) => (
              <tr key={p.id} data-cp-id={cp.id} data-param-id={p.id}>
                <td data-label={t('plan.col.code')} className="code">{i === 0 ? cpLabel(t, cp.code, cp.type) : ''}</td>
                <td data-label={t('wizard.cpName')}>{i === 0 ? l(cp.name_i18n) : ''}</td>
                <td data-label={t('plan.col.parameter')}>{l(p.name_i18n)}</td>
                <td data-label={t('plan.col.limits')} className="nowrap" data-testid="cp-limit">{limit(p)}</td>
                <td data-label={t('plan.col.frequency')}>{l(p.frequency_i18n)}</td>
                <td data-label={t('plan.col.responsible')}>{t(`role.${cp.responsible_role}`)}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
