import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, FileText, PencilLine, Save } from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { cpLabel } from '../../i18n/labels';
import { ActionButton, Can } from '../../components/Can';
import { NumberInput } from '../../components/NumberInput';
import { EventTimeInput, yerevanLocalNow, yerevanLocalToIso } from '../../components/EventTimeInput';
import { LineChart } from '../../components/LineChart';
import { useModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';
import { defaultPeriod, periodToIso } from '../period';
import { ControlPointRegistry } from './Registry';

interface Param { id: string; code: string; name_i18n: string; kind: 'numeric' | 'pass_fail'; limit_min: number | null; limit_max: number | null; unit: string | null; equipment_id: string | null }
interface Cp { id: string; code: string; type: string; name_i18n: string; parameters: Param[] }
interface Batch { id: string; code: string; status: string; product: string }
interface Equipment { id: string; code: string; name_i18n: string; next_cal_date: string | null }
export interface MonRecord {
  id: string; event_at: string; recorded_at: string; cp_code: string; cp_type: string; param_code: string; param_name: string; parameter_id: string;
  unit: string | null; kind: string; value_num: number | null; value_pass: number | null; limit_min_snapshot: number | null; limit_max_snapshot: number | null;
  in_limits: number; batch_code: string; equipment_code: string | null; operator_name_snapshot: string; nc_code: string | null;
  corrections: number; corr_value_num: number | null; corr_value_pass: number | null; corr_in_limits: number | null; corr_reason: string | null; corr_author: string | null;
}

const CODE = 'A03';

export function MonitoringPage() {
  const { t, lang } = useI18n();
  const version = useDataVersion();
  const [period, setPeriod] = useState(() => defaultPeriod(14));
  const [records, setRecords] = useState<MonRecord[]>([]);
  const [cps, setCps] = useState<Cp[]>([]);
  const load = useCallback(async () => {
    const { from, to } = periodToIso(period.fromDate, period.toDate);
    setRecords(await api<MonRecord[]>(`/api/monitoring?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
    setCps(await api<Cp[]>('/api/control-points'));
  }, [period]);
  useEffect(() => { void load().catch(() => setRecords([])); }, [load, version]);
  const { from, to } = periodToIso(period.fromDate, period.toDate);
  const exportUrl = (fmt: string) => `/api/monitoring/export.${fmt}?lang=${lang}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <div className="page page--wide" data-testid={`page-${CODE}`}>
      <h1><span className="code">{CODE}</span> {t('module.A03.title')}</h1>
      <ControlPointRegistry />
      <Can permission="ccp.monitoring.create"><MonitoringForm cps={cps} onSaved={load} /></Can>
      <section className="card" data-testid="mon-journal">
        <h2>{t('mon.journal')}</h2>
        <div className="toolbar">
          <div className="field"><label htmlFor="mon-from">{t('mon.from')}</label>
            <input id="mon-from" type="date" value={period.fromDate} onChange={(e) => setPeriod({ ...period, fromDate: e.target.value })} /></div>
          <div className="field"><label htmlFor="mon-to">{t('mon.to')}</label>
            <input id="mon-to" type="date" value={period.toDate} onChange={(e) => setPeriod({ ...period, toDate: e.target.value })} /></div>
          <a className="btn" href={exportUrl('pdf')} target="_blank" rel="noreferrer" data-testid="mon-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
          <a className="btn" href={exportUrl('xlsx')}><FileSpreadsheet size={16} aria-hidden /> {t('export.xlsx')}</a>
          <a className="btn" href={exportUrl('csv')}><FileSpreadsheet size={16} aria-hidden /> {t('export.csv')}</a>
        </div>
        <p className="muted" data-testid="mon-count">{t('mon.count', { n: records.length })}</p>
        <RecordsTable records={records} onChanged={load} />
      </section>
      <Trends cps={cps} records={records} />
    </div>
  );
}

function MonitoringForm({ cps, onSaved }: { cps: Cp[]; onSaved: () => Promise<void> }) {
  const { t, l, fmtDate } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [paramId, setParamId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [value, setValue] = useState('');
  const [pass, setPass] = useState<'' | 'yes' | 'no'>('');
  const [eventAt, setEventAt] = useState(yerevanLocalNow);
  const [equipmentId, setEquipmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const version = useDataVersion();
  useEffect(() => {
    api<Batch[]>('/api/fg-batches').then(setBatches).catch(() => setBatches([]));
    api<Equipment[]>('/api/equipment').then(setEquipment).catch(() => setEquipment([]));
  }, [version]);
  const today = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
  const expired = (e: Equipment) => !e.next_cal_date || e.next_cal_date < today;
  const params = useMemo(() => cps.flatMap((cp) => cp.parameters.map((p) => ({ cp, p }))), [cps]);
  const sel = params.find((x) => x.p.id === paramId);
  const onParam = (id: string) => {
    setParamId(id); setValue(''); setPass('');
    const p = params.find((x) => x.p.id === id)?.p;
    const eq = equipment.find((e) => e.id === p?.equipment_id);
    setEquipmentId(eq && !expired(eq) ? eq.id : '');
  };
  const defaultEq = equipment.find((e) => e.id === sel?.p.equipment_id);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ inLimits: boolean; nc: { ncCode: string } | null }>('/api/monitoring', {
        method: 'POST',
        json: { parameterId: paramId, fgBatchId: batchId, value: sel?.p.kind === 'numeric' ? value : undefined, pass: sel?.p.kind === 'pass_fail' ? pass === 'yes' : undefined, eventAt: yerevanLocalToIso(eventAt), equipmentId: equipmentId || null },
      });
      if (r.inLimits) toast(t('mon.savedOk'), 'success');
      else toast(t('mon.savedDeviation', { nc: r.nc?.ncCode ?? '' }), 'error');
      setValue(''); setPass(''); setEventAt(yerevanLocalNow());
      emitDataChanged();
      await onSaved();
    } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <section className="card" data-testid="mon-form">
      <h2>{t('mon.newRecord')}</h2>
      <div className="grid-form">
        <div className="field"><label htmlFor="mon-param">{t('plan.col.parameter')}</label>
          <select id="mon-param" value={paramId} onChange={(e) => onParam(e.target.value)}>
            <option value="">—</option>
            {params.map(({ cp, p }) => <option key={p.id} value={p.id}>{cpLabel(t, cp.code, cp.type)} · {l(p.name_i18n)}</option>)}
          </select></div>
        <div className="field"><label htmlFor="mon-batch">{t('mon.col.batch')}</label>
          <select id="mon-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">—</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.code} · {l(b.product)}</option>)}
          </select></div>
        {sel?.p.kind === 'pass_fail' ? (
          <fieldset className="field"><legend>{t('mon.col.value')}</legend>
            <div className="radio-row">
              <label className="check"><input type="radio" name="mon-pass" checked={pass === 'yes'} onChange={() => setPass('yes')} /> {t('mon.pass')}</label>
              <label className="check"><input type="radio" name="mon-pass" checked={pass === 'no'} onChange={() => setPass('no')} /> {t('mon.fail')}</label>
            </div></fieldset>
        ) : (
          <NumberInput label={`${t('mon.col.value')}${sel?.p.unit ? `, ${sel.p.unit}` : ''}`} value={value} onChange={(raw) => setValue(raw)} name="mon-value" />
        )}
        <EventTimeInput id="mon-event" value={eventAt} onChange={setEventAt} />
        <div className="field"><label htmlFor="mon-eq">{t('plan.col.equipment')}</label>
          <select id="mon-eq" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} data-testid="mon-equipment">
            <option value="">—</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id} disabled={expired(e)} data-testid={`eq-${e.code}`}>
                {e.code} · {l(e.name_i18n)}{expired(e) ? ` — ${t('mon.calExpired', { date: e.next_cal_date ? fmtDate(new Date(`${e.next_cal_date}T12:00:00Z`)) : '—' })}` : ''}
              </option>
            ))}
          </select>
          {defaultEq && expired(defaultEq) && (
            <p className="field__error" role="alert" data-testid="eq-blocked">
              <AlertTriangle size={14} aria-hidden /> {t('mon.eqBlocked', { code: defaultEq.code, date: defaultEq.next_cal_date ? fmtDate(new Date(`${defaultEq.next_cal_date}T12:00:00Z`)) : '—' })}
            </p>
          )}
        </div>
      </div>
      {sel && <p className="muted">{t('plan.col.limits')}: {sel.p.kind === 'pass_fail' ? t('plan.passFail') : [sel.p.limit_min !== null ? `≥ ${sel.p.limit_min}` : '', sel.p.limit_max !== null ? `≤ ${sel.p.limit_max}` : ''].filter(Boolean).join('; ')} {sel.p.unit ?? ''}</p>}
      <ActionButton permission="ccp.monitoring.create" className="btn btn--primary" data-testid="mon-save"
        disabled={busy || !paramId || !batchId || !equipmentId || (sel?.p.kind === 'pass_fail' ? !pass : !value.trim())} onClick={() => void submit()}>
        <Save size={16} aria-hidden /> {t('wizard.save')}</ActionButton>
    </section>
  );
}

export function RecordsTable({ records, onChanged }: { records: MonRecord[]; onChanged: () => Promise<void> }) {
  const { t, l, fmtDateTime, fmtNumber } = useI18n();
  const { me, can } = useAuth();
  const modal = useModal();
  const v = (num: number | null, pass: number | null, kind: string, unit: string | null) =>
    kind === 'numeric' ? `${num === null ? '—' : fmtNumber(num)} ${unit ?? ''}` : pass === null ? '—' : t(pass ? 'mon.pass' : 'mon.fail');
  return (
    <div className="table-wrap">
      <table className="table table--stack" data-testid="mon-table">
        <thead><tr>
          <th>{t('mon.col.time')}</th><th>{t('plan.col.code')}</th><th>{t('plan.col.parameter')}</th><th>{t('mon.col.batch')}</th>
          <th>{t('mon.col.value')}</th><th>{t('mon.col.status')}</th><th>{t('mon.col.operator')}</th><th>{t('mon.col.nc')}</th><th />
        </tr></thead>
        <tbody>
          {records.map((r) => {
            const ok = (r.corr_in_limits ?? r.in_limits) === 1;
            const mayCorrect = can('ccp.monitoring.correct_any') || (can('ccp.monitoring.correct') && r.operator_name_snapshot === me?.fullName);
            return (
              <tr key={r.id} className={ok ? undefined : 'row--bad'} data-record-id={r.id}>
                <td data-label={t('mon.col.time')}>{fmtDateTime(new Date(r.event_at))}</td>
                <td data-label={t('plan.col.code')} className="code">{cpLabel(t, r.cp_code, r.cp_type)}</td>
                <td data-label={t('plan.col.parameter')}>{l(r.param_name)}</td>
                <td data-label={t('mon.col.batch')} className="code">{r.batch_code}</td>
                <td data-label={t('mon.col.value')}>
                  {r.corrections > 0
                    ? <><s className="muted" data-testid="original-value">{v(r.value_num, r.value_pass, r.kind, r.unit)}</s>{' → '}<strong data-testid="corrected-value">{v(r.corr_value_num, r.corr_value_pass, r.kind, r.unit)}</strong>
                      <div className="muted" data-testid="correction-reason">{t('mon.correctionBy', { reason: r.corr_reason ?? '', author: r.corr_author ?? '' })}</div></>
                    : <span className="code">{v(r.value_num, r.value_pass, r.kind, r.unit)}</span>}
                </td>
                <td data-label={t('mon.col.status')}><span className={`tag ${ok ? 'tag--ok' : 'tag--danger'}`}>{t(ok ? 'mon.inLimits' : 'mon.outOfLimits')}</span></td>
                <td data-label={t('mon.col.operator')}>{r.operator_name_snapshot}</td>
                <td data-label={t('mon.col.nc')} className="code">{r.nc_code ?? ''}</td>
                <td className="row-actions">
                  {mayCorrect && <ActionButton permission="ccp.monitoring.correct" className="icon-btn" aria-label={t('mon.correct')} title={t('mon.correct')} data-testid="correct"
                    onClick={() => modal.open({ title: t('mon.correct'), body: <CorrectionForm record={r} onDone={async () => { modal.close(); await onChanged(); }} /> })}>
                    <PencilLine size={16} aria-hidden /></ActionButton>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CorrectionForm({ record, onDone }: { record: MonRecord; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [value, setValue] = useState('');
  const [pass, setPass] = useState<'' | 'yes' | 'no'>('');
  const [reason, setReason] = useState('');
  const submit = async () => {
    try {
      await api(`/api/monitoring/${record.id}/corrections`, { method: 'POST', json: record.kind === 'numeric' ? { value, reason } : { pass: pass === 'yes', reason } });
      toast(t('mon.corrected'), 'success');
      emitDataChanged();
      await onDone();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <p className="muted">{t('mon.correctHint')}</p>
      {record.kind === 'numeric'
        ? <NumberInput label={t('mon.newValue')} value={value} onChange={(raw) => setValue(raw)} name="corr-value" />
        : <div className="radio-row">
          <label className="check"><input type="radio" name="corr-pass" checked={pass === 'yes'} onChange={() => setPass('yes')} /> {t('mon.pass')}</label>
          <label className="check"><input type="radio" name="corr-pass" checked={pass === 'no'} onChange={() => setPass('no')} /> {t('mon.fail')}</label></div>}
      <div className="field"><label htmlFor="corr-reason">{t('mon.reason')}</label>
        <textarea id="corr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <button type="submit" className="btn btn--primary" disabled={!reason.trim() || (record.kind === 'numeric' ? !value.trim() : !pass)} data-testid="correction-submit">{t('wizard.save')}</button>
    </form>
  );
}

function Trends({ cps, records }: { cps: Cp[]; records: MonRecord[] }) {
  const { t, l, fmtDateTime, fmtNumber } = useI18n();
  const numeric = cps.flatMap((cp) => cp.parameters.filter((p) => p.kind === 'numeric').map((p) => ({ cp, p })));
  return (
    <section className="card" data-testid="mon-trends">
      <h2>{t('mon.trends')}</h2>
      <div className="charts">
        {numeric.map(({ cp, p }) => {
          const pts = records.filter((r) => r.parameter_id === p.id).map((r) => ({ t: Date.parse(r.event_at), v: (r.corr_value_num ?? r.value_num) as number, ok: (r.corr_in_limits ?? r.in_limits) === 1 })).filter((x) => x.v !== null);
          return (
            <div key={p.id} data-testid={`trend-${cp.code}-${p.code}`}>
              <h3>{cpLabel(t, cp.code, cp.type)} · {l(p.name_i18n)}</h3>
              {pts.length === 0 ? <p className="muted">{t('home.empty')}</p>
                : <LineChart points={pts} min={p.limit_min} max={p.limit_max} label={`${l(p.name_i18n)}${p.unit ? `, ${p.unit}` : ''}`} formatT={(x) => fmtDateTime(new Date(x))} formatV={(x) => fmtNumber(Math.round(x * 100) / 100)} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
