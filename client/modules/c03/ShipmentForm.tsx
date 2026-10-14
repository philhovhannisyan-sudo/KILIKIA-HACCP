import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { ActionButton, Can } from '../../components/Can';
import { NumberInput } from '../../components/NumberInput';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Отгрузка (C03): данные и правила полные — статус партии, остаток, FEFO; интерфейс модуля — каркас (фаза 8). */
export function ShipmentForm() {
  const { t, l } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [customers, setCustomers] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [f, setF] = useState({ customerId: '', fgBatchId: '', qty: '', fefoReason: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Row[]>('/api/customers').then(setCustomers).catch(() => setCustomers([]));
    api<Row[]>('/api/fg-batches').then(setBatches).catch(() => setBatches([]));
  }, [version]);
  const submit = async () => {
    setError(null);
    try {
      const r = await api<{ number: string }>('/api/shipments', { method: 'POST', json: { customerId: f.customerId, lines: [{ fgBatchId: f.fgBatchId, qty: f.qty, fefoReason: f.fefoReason || undefined }] } });
      toast(t('ship.created', { number: r.number }), 'success');
      setF({ ...f, qty: '', fefoReason: '' });
      emitDataChanged();
    } catch (e) { setError(errorText(e)); }
  };
  return (
    <Can permission="shipment.record.create">
      <section className="card" data-testid="shipment-form">
        <h2>{t('ship.title')}</h2>
        <div className="grid-form">
          <div className="field"><label htmlFor="sh-customer">{t('trace.customer')}</label>
            <select id="sh-customer" value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="sh-batch">{t('mon.col.batch')}</label>
            <select id="sh-batch" value={f.fgBatchId} onChange={(e) => setF({ ...f, fgBatchId: e.target.value })}>
              <option value="">—</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {l(b.product)} · {t(`status.batch.${b.status}`)}</option>)}</select></div>
          <NumberInput label={t('trace.qty')} value={f.qty} onChange={(raw) => setF({ ...f, qty: raw })} name="sh-qty" />
          <div className="field"><label htmlFor="sh-fefo">{t('ship.fefoReason')}</label>
            <input id="sh-fefo" value={f.fefoReason} onChange={(e) => setF({ ...f, fefoReason: e.target.value })} /></div>
        </div>
        {error && <p className="field__error" role="alert" data-testid="shipment-error">{error}</p>}
        <ActionButton permission="shipment.record.create" className="btn btn--primary" disabled={!f.customerId || !f.fgBatchId || !f.qty.trim()} onClick={() => void submit()} data-testid="shipment-save">
          <Truck size={16} aria-hidden /> {t('ship.submit')}</ActionButton>
      </section>
    </Can>
  );
}
