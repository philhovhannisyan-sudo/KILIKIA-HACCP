import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, FileSpreadsheet, FileText, Flag, Play, Timer } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { ActionButton } from '../../components/Can';
import { NumberInput } from '../../components/NumberInput';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Trace { batch: Row; backward: Row[]; forward: Row[]; suppliers: Row[]; customers: Row[]; stock: number; shippedQty: number }
const CODE = 'A04';

export function TracePage() {
  const { t, l, fmtNumber } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [batches, setBatches] = useState<Row[]>([]);
  const [batchId, setBatchId] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [exercises, setExercises] = useState<Row[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadExercises = useCallback(async () => setExercises(await api<Row[]>('/api/trace/exercises')), []);
  useEffect(() => {
    api<Row[]>('/api/fg-batches').then((b) => { setBatches(b); setBatchId((cur) => cur || b.find((x) => x.code === 'B-APR-01')?.id || b[0]?.id || ''); }).catch(() => setBatches([]));
    void loadExercises().catch(() => setExercises([]));
  }, [version, loadExercises]);
  useEffect(() => {
    if (!batchId) return;
    api<Trace>(`/api/trace/batches/${batchId}`).then(setTrace).catch((e) => toast(errorText(e), 'error'));
  }, [batchId, version, toast, errorText]);

  const start = async (type: 'trace' | 'recall') => {
    try {
      const r = await api<Row>('/api/trace/exercises', { method: 'POST', json: { type, fgBatchId: batchId } });
      setActiveId(r.id);
      await loadExercises();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  const active = exercises.find((e) => e.id === activeId) ?? null;

  return (
    <div className="page page--wide" data-testid={`page-${CODE}`}>
      <h1><span className="code">{CODE}</span> {t('module.A04.title')}</h1>
      <section className="card">
        <div className="toolbar">
          <label className="field field--inline"><span>{t('trace.batch')}</span>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} data-testid="trace-batch">
              {batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {l(b.product)} · {t(`status.batch.${b.status}`)}</option>)}
            </select></label>
          <ActionButton permission="trace.exercise.run" onClick={() => void start('trace')} data-testid="start-trace"><Play size={16} aria-hidden /> {t('trace.startTrace')}</ActionButton>
          <ActionButton permission="trace.exercise.run" onClick={() => void start('recall')} data-testid="start-recall"><Flag size={16} aria-hidden /> {t('trace.startRecall')}</ActionButton>
        </div>
        {trace && (
          <div className="trace-tree" data-testid="trace-tree">
            <div data-testid="trace-backward">
              <h2><ArrowLeft size={18} aria-hidden /> {t('trace.backward')}</h2>
              <ul className="tree">
                {trace.backward.map((r) => (
                  <li key={r.lot_id} data-lot={r.lot_code}>
                    <strong>{l(r.material_name)}</strong> · <span className="code">{r.lot_code}</span> · {fmtNumber(r.qty)} {t(`unit.${r.unit}`)}
                    <ul><li className="muted" data-supplier={r.supplier_code}>{t('trace.supplier')}: <span className="code">{r.supplier_code}</span> {r.supplier_name}</li></ul>
                  </li>
                ))}
              </ul>
              <p className="muted">{t('trace.summaryBack', { lots: trace.backward.length, suppliers: trace.suppliers.length })}</p>
            </div>
            <div className="trace-tree__batch">
              <span className="code">{trace.batch.code}</span>
              <div>{l(trace.batch.product_name)}</div>
              <div className="muted">{t(`status.batch.${trace.batch.status}`)} · {trace.batch.qty}</div>
            </div>
            <div data-testid="trace-forward">
              <h2>{t('trace.forward')} <ArrowRight size={18} aria-hidden /></h2>
              {trace.forward.length === 0 ? <p className="muted">{t('trace.notShipped')}</p> : (
                <ul className="tree">
                  {trace.forward.map((r) => (
                    <li key={r.line_id} data-shipment={r.number}>
                      <span className="code">{r.number}</span> · {r.qty}
                      <ul><li className="muted" data-customer={r.customer_code}>{t('trace.customer')}: <span className="code">{r.customer_code}</span> {r.customer_name}</li></ul>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted">{t('trace.summaryFwd', { shipments: new Set(trace.forward.map((x) => x.number)).size, customers: trace.customers.length, shipped: trace.shippedQty, stock: trace.stock })}</p>
            </div>
          </div>
        )}
      </section>
      {active && <ExercisePanel ex={active} onChanged={loadExercises} />}
      <section className="card" data-testid="exercise-list">
        <h2>{t('trace.history')}</h2>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>{t('plan.col.code')}</th><th>{t('trace.type')}</th><th>{t('mon.col.batch')}</th><th>{t('trace.duration')}</th><th>{t('trace.shipments')}</th><th>{t('trace.returnedPercent')}</th><th>{t('trace.compliant')}</th><th /></tr></thead>
            <tbody>
              {exercises.map((e) => (
                <tr key={e.id} className={e.compliant === 0 ? 'row--bad' : undefined} data-exercise={e.code}>
                  <td data-label={t('plan.col.code')} className="code">{e.code}</td>
                  <td data-label={t('trace.type')}>{t(`trace.type.${e.type}`)}</td>
                  <td data-label={t('mon.col.batch')} className="code">{e.batch_code}</td>
                  <td data-label={t('trace.duration')}>{e.duration_min === null ? t('trace.running') : t('trace.minutes', { n: fmtNumber(e.duration_min) })}</td>
                  <td data-label={t('trace.shipments')}>{e.shipments}</td>
                  <td data-label={t('trace.returnedPercent')}>{e.type === 'recall' && e.returnedPercent !== null ? `${fmtNumber(e.returnedPercent)} %` : '—'}</td>
                  <td data-label={t('trace.compliant')}>{e.compliant === null ? '—' : <span className={`tag ${e.compliant ? 'tag--ok' : 'tag--danger'}`}>{t(e.compliant ? 'trace.ok' : 'trace.exceeded')}{e.nc_code ? ` · ${e.nc_code}` : ''}</span>}</td>
                  <td className="row-actions"><button type="button" className="btn btn--link" onClick={() => setActiveId(e.id)}>{t('trace.open')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExercisePanel({ ex, onChanged }: { ex: Row; onChanged: () => Promise<void> }) {
  const { t, lang, fmtDateTime, fmtNumber } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [now, setNow] = useState(() => Date.now());
  const [qty, setQty] = useState<Record<string, string>>({});
  useEffect(() => {
    if (ex.finished_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ex.finished_at]);
  const elapsedMin = ex.finished_at ? ex.duration_min : Math.max(0, (now - Date.parse(ex.started_at)) / 60_000);
  const hhmmss = (min: number) => { const s = Math.round(min * 60); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const mark = async (itemId: string, returned: boolean) => {
    try { await api(`/api/trace/exercises/${ex.id}/items/${itemId}`, { method: 'PUT', json: { returned, returnedQty: qty[itemId] || undefined } }); await onChanged(); }
    catch (e) { toast(errorText(e), 'error'); }
  };
  const finish = async () => {
    try {
      const r = await api<Row>(`/api/trace/exercises/${ex.id}/finish`, { method: 'POST', json: {} });
      toast(r.compliant ? t('trace.finishedOk') : t('trace.finishedExceeded', { nc: r.nc_code ?? '' }), r.compliant ? 'success' : 'error');
      emitDataChanged();
      await onChanged();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  const url = (fmt: string) => `/api/trace/exercises/${ex.id}/export.${fmt}?lang=${lang}`;
  return (
    <section className={`card${ex.compliant === 0 ? ' card--bad' : ''}`} data-testid="exercise-panel">
      <h2>{t(`trace.type.${ex.type}`)} <span className="code">{ex.code}</span> · <span className="code">{ex.batch_code}</span></h2>
      <div className="kpis">
        <div className="kpi"><div className="kpi__label"><Timer size={14} aria-hidden /> {t('trace.duration')}</div>
          <div className="kpi__value code" data-testid="exercise-timer">{hhmmss(elapsedMin)}</div>
          <div className="kpi__hint muted">{t('trace.target')}: {t('trace.minutes', { n: ex.target_min_snapshot })} · {t('trace.started')}: {fmtDateTime(new Date(ex.started_at))}</div></div>
        <div className="kpi"><div className="kpi__label">{t('trace.shipments')}</div><div className="kpi__value" data-testid="exercise-shipments">{ex.shipments}</div></div>
        {ex.type === 'recall' && <div className="kpi"><div className="kpi__label">{t('trace.returnedPercent')}</div>
          <div className="kpi__value" data-testid="exercise-percent">{ex.returnedPercent === null ? '—' : `${fmtNumber(ex.returnedPercent)} %`}</div>
          <div className="kpi__hint muted">{ex.returnedQty} / {ex.shippedQty}</div></div>}
        {ex.compliant !== null && <div className={`kpi${ex.compliant ? '' : ' kpi--alert'}`}><div className="kpi__label">{t('trace.compliant')}</div>
          <div className="kpi__value" data-testid="exercise-result">{t(ex.compliant ? 'trace.ok' : 'trace.exceeded')}</div>
          {ex.nc_code && <div className="kpi__hint">{t('mon.col.nc')}: <span className="code">{ex.nc_code}</span></div>}</div>}
      </div>
      <p className="badge badge--stub">{t('trace.targetNote')}</p>
      {ex.type === 'recall' && (
        <div className="table-wrap">
          <table className="table table--stack" data-testid="recall-items">
            <thead><tr><th>{t('trace.shipment')}</th><th>{t('trace.customer')}</th><th>{t('trace.qty')}</th><th>{t('trace.returned')}</th></tr></thead>
            <tbody>
              {ex.items.map((i: Row) => (
                <tr key={i.id} data-shipment={i.number}>
                  <td data-label={t('trace.shipment')} className="code">{i.number}</td>
                  <td data-label={t('trace.customer')}>{i.customer_name}</td>
                  <td data-label={t('trace.qty')}>{i.qty}</td>
                  <td data-label={t('trace.returned')}>
                    {ex.finished_at ? (i.returned ? `${t('plan.yes')} (${i.returned_qty})` : t('plan.no')) : (
                      <div className="row-fields">
                        <NumberInput label={t('trace.returnedQty')} value={qty[i.id] ?? (i.returned_qty !== null ? String(i.returned_qty) : '')} onChange={(raw) => setQty({ ...qty, [i.id]: raw })} name={`ret-${i.id}`} />
                        <label className="check"><input type="checkbox" checked={!!i.returned} onChange={(e) => void mark(i.id, e.target.checked)} data-testid="returned" /> {t('trace.returned')}</label>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="actions">
        {!ex.finished_at && <ActionButton permission="trace.exercise.run" className="btn btn--primary" onClick={() => void finish()} data-testid="exercise-finish">{t('trace.finish')}</ActionButton>}
        <a className="btn" href={url('pdf')} target="_blank" rel="noreferrer" data-testid="exercise-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
        <a className="btn" href={url('xlsx')}><FileSpreadsheet size={16} aria-hidden /> {t('export.xlsx')}</a>
        <a className="btn" href={url('csv')}><FileSpreadsheet size={16} aria-hidden /> {t('export.csv')}</a>
      </div>
    </section>
  );
}
