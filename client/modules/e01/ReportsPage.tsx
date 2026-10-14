import { useEffect, useState } from 'react';
import { FileArchive, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { Can } from '../../components/Can';
import { useToast } from '../../components/Toast';
import { defaultPeriod, periodToIso } from '../period';

interface Source { key: string; module: string; label: string; fields: { key: string; label: string }[] }
interface Result { title: string; headers: string[]; rows: (string | number | null)[][]; total: number; groups: { value: string | number | null; count: number }[] | null }
const CODE = 'E01';
const PREVIEW = 100;

function Period({ value, onChange, idPrefix }: { value: { fromDate: string; toDate: string }; onChange: (v: { fromDate: string; toDate: string }) => void; idPrefix: string }) {
  const { t } = useI18n();
  return (
    <>
      <div className="field"><label htmlFor={`${idPrefix}-from`}>{t('mon.from')}</label>
        <input id={`${idPrefix}-from`} type="date" value={value.fromDate} onChange={(e) => onChange({ ...value, fromDate: e.target.value })} /></div>
      <div className="field"><label htmlFor={`${idPrefix}-to`}>{t('mon.to')}</label>
        <input id={`${idPrefix}-to`} type="date" value={value.toDate} onChange={(e) => onChange({ ...value, toDate: e.target.value })} /></div>
    </>
  );
}

export function ReportsPage() {
  const { t } = useI18n();
  return (
    <div className="page page--wide" data-testid={`page-${CODE}`}>
      <h1><span className="code">{CODE}</span> {t('module.E01.title')}</h1>
      <Can permission="audit.pack.generate"><AuditPack /></Can>
      <Can permission="report.custom.generate"><Builder /></Can>
    </div>
  );
}

function AuditPack() {
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState(() => defaultPeriod(90));
  const { from, to } = periodToIso(period.fromDate, period.toDate);
  const href = `/api/audit-pack.pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&lang=${lang}`;
  return (
    <section className="card" data-testid="audit-pack">
      <h2>{t('term.audit_pack')}</h2>
      <p className="muted">{t('pack.hint')}</p>
      <div className="toolbar">
        <Period value={period} onChange={setPeriod} idPrefix="pack" />
        <a className="btn btn--primary" href={href} target="_blank" rel="noreferrer" data-testid="audit-pack-generate"><FileArchive size={16} aria-hidden /> {t('pack.generate')}</a>
      </div>
    </section>
  );
}

function Builder() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState('');
  const [fields, setFields] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState('');
  const [period, setPeriod] = useState(() => defaultPeriod(30));
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    api<Source[]>(`/api/reports/sources?lang=${lang}`).then((s) => { setSources(s); setSource((cur) => cur || s[0]?.key || ''); }).catch(() => setSources([]));
  }, [lang]);
  const src = sources.find((s) => s.key === source);
  useEffect(() => { setFields(src ? src.fields.map((f) => f.key) : []); setGroupBy(''); setResult(null); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const { from, to } = periodToIso(period.fromDate, period.toDate);
  const query = `source=${source}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&fields=${fields.join(',')}&groupBy=${groupBy}&lang=${lang}`;
  const run = async () => {
    try { setResult(await api<Result>(`/api/reports/run?${query}`)); } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <section className="card" data-testid="report-builder">
      <h2>{t('report.builder')}</h2>
      <div className="toolbar">
        <div className="field field--inline"><label htmlFor="rep-source">{t('report.source')}</label>
          <select id="rep-source" value={source} onChange={(e) => setSource(e.target.value)}>
            {sources.map((s) => <option key={s.key} value={s.key}>{s.module} · {s.label}</option>)}</select></div>
        <Period value={period} onChange={setPeriod} idPrefix="rep" />
        <div className="field"><label htmlFor="rep-group">{t('report.groupBy')}</label>
          <select id="rep-group" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="">{t('report.noGroup')}</option>
            {src?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
      </div>
      {src && (
        <fieldset className="subform">
          <legend>{t('report.fields')}</legend>
          <div className="radio-row">
            {src.fields.map((f) => (
              <label key={f.key} className="check"><input type="checkbox" checked={fields.includes(f.key)} data-testid={`field-${f.key}`}
                onChange={(e) => setFields(e.target.checked ? src.fields.map((x) => x.key).filter((k) => k === f.key || fields.includes(k)) : fields.filter((k) => k !== f.key))} /> {f.label}</label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="actions">
        <button type="button" className="btn btn--primary" disabled={!source || fields.length === 0} onClick={() => void run()} data-testid="report-run"><Play size={16} aria-hidden /> {t('report.run')}</button>
        <a className="btn" href={`/api/reports/export.pdf?${query}`} target="_blank" rel="noreferrer" data-testid="report-pdf"><FileText size={16} aria-hidden /> {t('export.pdf')}</a>
        <a className="btn" href={`/api/reports/export.xlsx?${query}`} data-testid="report-xlsx"><FileSpreadsheet size={16} aria-hidden /> {t('export.xlsx')}</a>
        <a className="btn" href={`/api/reports/export.csv?${query}`} data-testid="report-csv"><FileSpreadsheet size={16} aria-hidden /> {t('export.csv')}</a>
      </div>
      {result && (
        <div data-testid="report-preview">
          <h3>{t('report.preview')}: {result.title}</h3>
          <p className="muted" data-testid="report-total">{t('pack.count', { n: result.total })}{result.total > PREVIEW ? ` · ${t('report.previewLimit', { n: PREVIEW, total: result.total })}` : ''}</p>
          {result.groups && (
            <table className="table" data-testid="report-groups">
              <thead><tr><th>{t('report.groupValue')}</th><th>{t('report.count')}</th></tr></thead>
              <tbody>{result.groups.map((g) => <tr key={String(g.value)}><td>{g.value ?? '—'}</td><td className="code">{g.count}</td></tr>)}</tbody>
            </table>
          )}
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr>{result.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{result.rows.slice(0, PREVIEW).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} data-label={result.headers[j]}>{c ?? '—'}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
