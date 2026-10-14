import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { ActionButton, Can } from '../../components/Can';
import { NumberInput } from '../../components/NumberInput';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** B03: регистрация партии ГП с фактическим расходом партий сырья (питает прослеживаемость A04). */
export function BatchForm() {
  const { t, l, fmtNumber } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [products, setProducts] = useState<Row[]>([]);
  const [lots, setLots] = useState<Row[]>([]);
  const [f, setF] = useState({ productId: '', shift: 'A', qty: '' });
  const [lines, setLines] = useState([{ materialLotId: '', qty: '' }]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Row[]>('/api/products').then(setProducts).catch(() => setProducts([]));
    api<Row[]>('/api/material-lots').then(setLots).catch(() => setLots([]));
  }, [version]);
  const setLine = (i: number, p: Partial<{ materialLotId: string; qty: string }>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const submit = async () => {
    setError(null);
    try {
      const r = await api<{ code: string }>('/api/batches', { method: 'POST', json: { ...f, lines } });
      toast(t('b03.created', { code: r.code }), 'success');
      setF({ ...f, qty: '' }); setLines([{ materialLotId: '', qty: '' }]);
      emitDataChanged();
    } catch (e) { setError(errorText(e)); }
  };
  return (
    <Can permission="batch.fg.create">
      <section className="card" data-testid="b03-form">
        <h2>{t('b03.title')}</h2>
        <div className="grid-form">
          <div className="field"><label htmlFor="b03-product">{t('sc.col.product')}</label>
            <select id="b03-product" value={f.productId} onChange={(e) => setF({ ...f, productId: e.target.value })}>
              <option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.code} · {l(p.name_i18n)}</option>)}</select></div>
          <div className="field"><label htmlFor="b03-shift">{t('sc.col.shift')}</label>
            <select id="b03-shift" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>{['A', 'B'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <NumberInput name="b03-qty" label={t('sc.col.qty')} value={f.qty} onChange={(raw) => setF({ ...f, qty: raw })} />
        </div>
        {lines.map((x, i) => (
          <div key={i} className="grid-form" data-testid="b03-line">
            <div className="field"><label htmlFor={`b03-lot-${i}`}>{t('sc.col.material')}</label>
              <select id={`b03-lot-${i}`} value={x.materialLotId} onChange={(e) => setLine(i, { materialLotId: e.target.value })}>
                <option value="">—</option>{lots.map((m) => <option key={m.id} value={m.id}>{m.code} · {l(m.material)} · {fmtNumber(m.stock)} {m.unit} · {t(`status.batch.${m.status}`)}</option>)}</select></div>
            <NumberInput name={`b03-lqty-${i}`} label={t('sc.col.qty')} value={x.qty} onChange={(raw) => setLine(i, { qty: raw })} />
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setLines([...lines, { materialLotId: '', qty: '' }])} data-testid="b03-add"><Plus size={16} aria-hidden /> {t('b03.addLot')}</button>
        {error && <p className="field__error" role="alert" data-testid="b03-error">{error}</p>}
        <ActionButton permission="batch.fg.create" className="btn btn--primary" disabled={!f.productId || !f.qty.trim() || lines.some((x) => !x.materialLotId || !x.qty.trim())} onClick={() => void submit()} data-testid="b03-save">
          <Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
      </section>
    </Can>
  );
}

/** C01: смена статуса партии через конечный автомат (переходы и права — из данных). */
export function StatusForm() {
  const { t, l } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [items, setItems] = useState<Row[]>([]);
  const [sel, setSel] = useState('');
  const [fsm, setFsm] = useState<{ status: string; transitions: { to: string; allowed: boolean; commentRequired: boolean; permission: string }[] } | null>(null);
  const [to, setTo] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api<Row[]>('/api/fg-batches'), api<Row[]>('/api/material-lots')])
      .then(([b, m]) => setItems([...b.map((x) => ({ ...x, entity: 'fg_batch', name: x.product })), ...m.map((x) => ({ ...x, entity: 'material_lot', name: x.material }))]))
      .catch(() => setItems([]));
  }, [version]);
  const item = items.find((x) => x.id === sel);
  useEffect(() => {
    setFsm(null); setTo('');
    if (item) api<NonNullable<typeof fsm>>(`/api/fsm/${item.entity}/${item.id}`).then(setFsm).catch(() => setFsm(null));
  }, [sel, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const tr = fsm?.transitions.find((x) => x.to === to);
  const submit = async () => {
    if (!item) return;
    setError(null);
    try {
      const r = await api<{ status: string }>(`/api/fsm/${item.entity}/${item.id}/transition`, { method: 'POST', json: { to, comment: comment || undefined } });
      toast(t('c01.done', { code: item.code, status: t(`status.batch.${r.status}`) }), 'success');
      setComment('');
      emitDataChanged();
    } catch (e) { setError(errorText(e)); }
  };
  return (
    <section className="card" data-testid="c01-form">
      <h2>{t('c01.title')}</h2>
      <div className="grid-form">
        <div className="field"><label htmlFor="c01-batch">{t('sc.col.batch')}</label>
          <select id="c01-batch" value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">—</option>{items.map((x) => <option key={x.id} value={x.id}>{x.code} · {l(x.name)} · {t(`status.batch.${x.status}`)}</option>)}</select></div>
        <div className="field"><label htmlFor="c01-to">{t('c01.to')}</label>
          <select id="c01-to" value={to} onChange={(e) => setTo(e.target.value)} disabled={!fsm}>
            <option value="">—</option>{fsm?.transitions.filter((x) => x.allowed).map((x) => <option key={x.to} value={x.to}>{t(`status.batch.${x.to}`)}</option>)}</select></div>
        <div className="field"><label htmlFor="c01-comment">{t('form.comment')}</label>
          <input id="c01-comment" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
      </div>
      {error && <p className="field__error" role="alert" data-testid="c01-error">{error}</p>}
      <ActionButton permission={tr?.permission ?? 'batch.release.transition'} className="btn btn--primary" disabled={!tr || (tr.commentRequired && !comment.trim())} onClick={() => void submit()} data-testid="c01-save">
        <Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
    </section>
  );
}

/** D03: запись поверки оборудования. */
export function CalibrationForm() {
  const { t, l, fmtDate } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [eq, setEq] = useState<Row[]>([]);
  const [f, setF] = useState({ id: '', date: '', nextDate: '', certificate: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Row[]>('/api/equipment').then(setEq).catch(() => setEq([])); }, [version]);
  const submit = async () => {
    setError(null);
    try {
      const r = await api<Row>(`/api/equipment/${f.id}/calibrations`, { method: 'POST', json: { date: f.date || undefined, nextDate: f.nextDate || undefined, certificate: f.certificate } });
      toast(t('d03.done', { code: r.code, date: fmtDate(new Date(`${r.next_cal_date}T12:00:00Z`)) }), 'success');
      setF({ id: '', date: '', nextDate: '', certificate: '' });
      emitDataChanged();
    } catch (e) { setError(errorText(e)); }
  };
  return (
    <Can permission="equipment.calibration.record">
      <section className="card" data-testid="d03-form">
        <h2>{t('d03.title')}</h2>
        <div className="grid-form">
          <div className="field"><label htmlFor="d03-eq">{t('sc.col.name')}</label>
            <select id="d03-eq" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })}>
              <option value="">—</option>{eq.map((x) => <option key={x.id} value={x.id}>{x.code} · {l(x.name_i18n)}</option>)}</select></div>
          <div className="field"><label htmlFor="d03-date">{t('sc.col.lastCal')}</label>
            <input id="d03-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          <div className="field"><label htmlFor="d03-next">{t('sc.col.nextCal')}</label>
            <input id="d03-next" type="date" value={f.nextDate} onChange={(e) => setF({ ...f, nextDate: e.target.value })} /></div>
          <div className="field"><label htmlFor="d03-cert">{t('sc.col.certificate')}</label>
            <input id="d03-cert" value={f.certificate} onChange={(e) => setF({ ...f, certificate: e.target.value })} /></div>
        </div>
        {error && <p className="field__error" role="alert" data-testid="d03-error">{error}</p>}
        <ActionButton permission="equipment.calibration.record" className="btn btn--primary" disabled={!f.id || !f.certificate.trim()} onClick={() => void submit()} data-testid="d03-save">
          <Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
      </section>
    </Can>
  );
}
