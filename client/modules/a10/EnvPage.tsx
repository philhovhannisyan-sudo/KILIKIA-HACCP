import { useCallback, useEffect, useState } from 'react';
import { FilePlus2, FileSpreadsheet, FileText, PencilLine, Save } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { ActionButton, Can } from '../../components/Can';
import { NumberInput } from '../../components/NumberInput';
import { EventTimeInput, yerevanLocalNow, yerevanLocalToIso } from '../../components/EventTimeInput';
import { LineChart } from '../../components/LineChart';
import { useModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';
import { defaultPeriod, periodToIso } from '../period';

interface Point { id: string; code: string; zone_i18n: string; kind: string; limit_min: number | null; limit_max: number | null; unit: string; equipment_code: string | null; next_cal_date: string | null }
interface Rec {
  id: string; point_id: string; point_code: string; zone_i18n: string; unit: string; event_at: string; value: number; effective_value: number;
  effective_in_limits: number; recorded_by_name_snapshot: string; correction_reason: string | null; correction_author: string | null; nc_code: string | null; limit_min: number | null; limit_max: number | null;
}
const CODE = 'A10';

export function EnvPage() {
  const { t, l, lang, fmtNumber, fmtDateTime, fmtDate } = useI18n();
  const toast = useToast();
  const modal = useModal();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [period, setPeriod] = useState(() => defaultPeriod(14));
  const [points, setPoints] = useState<Point[]>([]);
  const [records, setRecords] = useState<Rec[]>([]);
  const load = useCallback(async () => {
    const { from, to } = periodToIso(period.fromDate, period.toDate);
    setPoints(await api<Point[]>('/api/env-points'));
    setRecords(await api<Rec[]>(`/api/env-records?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
  }, [period]);
  useEffect(() => { void load().catch(() => setRecords([])); }, [load, version]);
  const { from, to } = periodToIso(period.fromDate, period.toDate);
  const exportUrl = (fmt: string) => `/api/env-records/export.${fmt}?lang=${lang}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const lim = (p: { limit_min: number | null; limit_max: number | null; unit: string }) =>
    `${[p.limit_min !== null ? `≥ ${fmtNumber(p.limit_min)}` : '', p.limit_max !== null ? `≤ ${fmtNumber(p.limit_max)}` : ''].filter(Boolean).join('; ')} ${p.unit}`;
  const registerNc = async (r: Rec) => {
    try {
      const res = await api<{ ncCode: string }>(`/api/env-records/${r.id}/nonconformity`, { method: 'POST', json: {} });
      toast(t('env.ncRegistered', { nc: res.ncCode }), 'success');
      await load();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  const deviations = records.filter((r) => !r.effective_in_limits);

  return (
    <div className="page page--wide" data-testid={`page-${CODE}`}>
      <h1><span className="code">{CODE}</span> {t('module.A10.title')}</h1>
      <div className="kpis">
        {points.map((p) => {
          const last = records.find((r) => r.point_id === p.id);
          return (
            <div key={p.id} className={`kpi${last && !last.effective_in_limits ? ' kpi--alert' : ''}`} data-testid={`point-${p.code}`}>
              <div className="kpi__label"><span className="code">{p.code}</span> · {l(p.zone_i18n)} · {t(`env.kind.${p.kind}`)}</div>
              <div className="kpi__value">{last ? `${fmtNumber(last.effective_value)} ${p.unit}` : '—'}</div>
              <div className="kpi__hint muted">{t('plan.col.limits')}: {lim(p)} · {p.equipment_code ?? ''}{p.next_cal_date ? ` (${t('home.calValidUntil')}: ${fmtDate(new Date(`${p.next_cal_date}T12:00:00Z`))})` : ''}</div>
            </div>
          );
        })}
      </div>
      <Can permission="env.record.create"><EnvForm points={points} onSaved={load} /></Can>
      <section className="card">
        <h2>{t('env.charts')}</h2>
        <div className="charts">
          {points.map((p) => {
            const pts = records.filter((r) => r.point_id === p.id).map((r) => ({ t: Date.parse(r.event_at), v: r.effective_value, ok: !!r.effective_in_limits }));
            return (
              <div key={p.id} data-testid={`chart-${p.code}`}>
                <h3><span className="code">{p.code}</span> · {l(p.zone_i18n)}</h3>
                {pts.length ? <LineChart points={pts} min={p.limit_min} max={p.limit_max} label={`${t(`env.kind.${p.kind}`)}, ${p.unit}`} formatT={(x) => fmtDate(new Date(x))} formatV={(x) => fmtNumber(Math.round(x * 10) / 10)} />
                  : <p className="muted">{t('home.empty')}</p>}
              </div>
            );
          })}
        </div>
      </section>
      <section className="card" data-testid="env-deviations">
        <h2>{t('env.deviations')}</h2>
        {deviations.length === 0 ? <p className="muted">{t('home.empty')}</p> : (
          <ul className="items">
            {deviations.map((r) => (
              <li key={r.id} className="item--overdue">
                <span className="code">{r.point_code}</span> · {l(r.zone_i18n)}: <strong>{fmtNumber(r.effective_value)} {r.unit}</strong> ({lim(r)}) · {fmtDateTime(new Date(r.event_at))}
                {r.nc_code ? <span className="code"> · {r.nc_code}</span>
                  : <ActionButton permission="nc.record.create" className="btn btn--link" onClick={() => void registerNc(r)} data-testid="env-register-nc"><FilePlus2 size={14} aria-hidden /> {t('env.registerNc')}</ActionButton>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" data-testid="env-journal">
        <h2>{t('env.journal')}</h2>
        <div className="toolbar">
          <div className="field"><label htmlFor="env-from">{t('mon.from')}</label>
            <input id="env-from" type="date" value={period.fromDate} onChange={(e) => setPeriod({ ...period, fromDate: e.target.value })} /></div>
          <div className="field"><label htmlFor="env-to">{t('mon.to')}</label>
            <input id="env-to" type="date" value={period.toDate} onChange={(e) => setPeriod({ ...period, toDate: e.target.value })} /></div>
          <a className="btn" href={exportUrl('pdf')} target="_blank" rel="noreferrer" data-testid="env-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
          <a className="btn" href={exportUrl('xlsx')}><FileSpreadsheet size={16} aria-hidden /> {t('export.xlsx')}</a>
          <a className="btn" href={exportUrl('csv')}><FileSpreadsheet size={16} aria-hidden /> {t('export.csv')}</a>
        </div>
        <p className="muted">{t('mon.count', { n: records.length })}</p>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>{t('mon.col.time')}</th><th>{t('env.col.point')}</th><th>{t('mon.col.value')}</th><th>{t('mon.col.status')}</th><th>{t('mon.col.operator')}</th><th /></tr></thead>
            <tbody>
              {records.slice(0, 200).map((r) => (
                <tr key={r.id} className={r.effective_in_limits ? undefined : 'row--bad'}>
                  <td data-label={t('mon.col.time')}>{fmtDateTime(new Date(r.event_at))}</td>
                  <td data-label={t('env.col.point')}><span className="code">{r.point_code}</span> · {l(r.zone_i18n)}</td>
                  <td data-label={t('mon.col.value')}>{r.correction_reason
                    ? <><s className="muted">{fmtNumber(r.value)}</s> → <strong>{fmtNumber(r.effective_value)} {r.unit}</strong><div className="muted">{t('mon.correctionBy', { reason: r.correction_reason, author: r.correction_author ?? '' })}</div></>
                    : <span className="code">{fmtNumber(r.value)} {r.unit}</span>}</td>
                  <td data-label={t('mon.col.status')}><span className={`tag ${r.effective_in_limits ? 'tag--ok' : 'tag--danger'}`}>{t(r.effective_in_limits ? 'mon.inLimits' : 'mon.outOfLimits')}</span></td>
                  <td data-label={t('mon.col.operator')}>{r.recorded_by_name_snapshot}</td>
                  <td className="row-actions">
                    <ActionButton permission="env.record.correct" className="icon-btn" aria-label={t('mon.correct')} title={t('mon.correct')}
                      onClick={() => modal.open({ title: t('mon.correct'), body: <EnvCorrection record={r} onDone={async () => { modal.close(); await load(); }} /> })}><PencilLine size={16} aria-hidden /></ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EnvForm({ points, onSaved }: { points: Point[]; onSaved: () => Promise<void> }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [pointId, setPointId] = useState('');
  const [value, setValue] = useState('');
  const [eventAt, setEventAt] = useState(yerevanLocalNow);
  const submit = async () => {
    try {
      const r = await api<{ inLimits: boolean }>('/api/env-records', { method: 'POST', json: { pointId, value, eventAt: yerevanLocalToIso(eventAt) } });
      toast(t(r.inLimits ? 'mon.savedOk' : 'env.savedDeviation'), r.inLimits ? 'success' : 'error');
      setValue('');
      emitDataChanged();
      await onSaved();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <section className="card" data-testid="env-form">
      <h2>{t('env.newRecord')}</h2>
      <div className="grid-form">
        <div className="field"><label htmlFor="env-point">{t('env.col.point')}</label>
          <select id="env-point" value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="">—</option>
            {points.map((p) => <option key={p.id} value={p.id}>{p.code} · {l(p.zone_i18n)} · {t(`env.kind.${p.kind}`)}</option>)}
          </select></div>
        <NumberInput label={t('mon.col.value')} value={value} onChange={(raw) => setValue(raw)} name="env-value" />
        <EventTimeInput id="env-event" value={eventAt} onChange={setEventAt} />
      </div>
      <ActionButton permission="env.record.create" className="btn btn--primary" disabled={!pointId || !value.trim()} onClick={() => void submit()} data-testid="env-save"><Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
    </section>
  );
}

function EnvCorrection({ record, onDone }: { record: Rec; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault();
      try { await api(`/api/env-records/${record.id}/corrections`, { method: 'POST', json: { value, reason } }); toast(t('mon.corrected'), 'success'); await onDone(); }
      catch (err) { toast(errorText(err), 'error'); }
    }}>
      <p className="muted">{t('mon.correctHint')}</p>
      <NumberInput label={t('mon.newValue')} value={value} onChange={(raw) => setValue(raw)} name="env-corr-value" />
      <div className="field"><label htmlFor="env-corr-reason">{t('mon.reason')}</label>
        <textarea id="env-corr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <button type="submit" className="btn btn--primary" disabled={!value.trim() || !reason.trim()}>{t('wizard.save')}</button>
    </form>
  );
}
