import { useEffect, useState, type ReactNode } from 'react';
import { Construction, FileText } from 'lucide-react';
import { api } from '../../api';
import { useI18n, type TKey } from '../../i18n/I18nProvider';
import { NumberInput } from '../../components/NumberInput';
import { useDataVersion } from '../../dataEvents';
import { ShipmentForm } from '../c03/ShipmentForm';
import { BatchForm, CalibrationForm, StatusForm } from './forms';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Col { key: string; kind?: 'text' | 'i18n' | 'date' | 'number' | 'status'; status?: string }
interface Field { key: string; type: 'text' | 'number' | 'date' }
interface Data { code: string; form: string | null; cols: Col[]; fields: Field[]; kpis: number[]; rows: Row[] }

/** Типовой каркас модуля (фаза 8): панель на реальных данных, таблица, форма, печатная заготовка, пометка «в разработке». */
export function ScaffoldPage({ code, children }: { code: string; children?: ReactNode }) {
  const { t, l, lang, fmtDate, fmtNumber } = useI18n();
  const version = useDataVersion();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>(`/api/scaffold/${code}`).then(setD).catch(() => setD(null)); }, [code, version]);
  const cell = (c: Col, v: unknown) => {
    if (v === null || v === undefined || v === '') return '—';
    if (c.kind === 'i18n') return l(v as string);
    if (c.kind === 'date') return fmtDate(new Date(`${String(v).slice(0, 10)}T12:00:00Z`));
    if (c.kind === 'number') return fmtNumber(Number(v));
    if (c.kind === 'status') return t(`${c.status}.${v}` as TKey);
    return String(v);
  };
  return (
    <div className="page page--wide" data-testid={`page-${code}`}>
      <h1><span className="code">{code}</span> {t(`module.${code}.title`)}</h1>
      <p className="badge badge--stub" data-testid="stub-badge"><Construction size={16} aria-hidden /> {t('sc.badge')} · {t('term.in_development')}</p>
      <section className="card">
        <h2>{t('sc.future')}</h2>
        <p data-testid="sc-future">{t(`sc.future.${code}`)}</p>
      </section>
      {d && (
        <>
          <section className="card">
            <h2>{t('sc.panel')}</h2>
            <div className="kpis" data-testid="sc-kpis">
              {d.kpis.map((v, i) => (
                <div key={i} className="kpi"><div className="kpi__label">{t(`sc.kpi.${code}.${i}`)}</div><div className="kpi__value" data-testid={`sc-kpi-${i}`}>{fmtNumber(v)}</div></div>
              ))}
            </div>
          </section>
          {children}
          {d.form === 'B03' && <BatchForm />}
          {d.form === 'C01' && <StatusForm />}
          {d.form === 'C03' && <ShipmentForm />}
          {d.form === 'D03' && <CalibrationForm />}
          <section className="card">
            <h2>{t('sc.table')}</h2>
            <div className="table-wrap">
              <table className="table table--stack" data-testid="sc-table">
                <thead><tr>{d.cols.map((c) => <th key={c.key}>{t(`sc.col.${c.key}`)}</th>)}</tr></thead>
                <tbody>
                  {d.rows.map((r, i) => (
                    <tr key={i}>{d.cols.map((c) => <td key={c.key} data-label={t(`sc.col.${c.key}`)} className={c.key === 'code' ? 'code' : undefined}>{cell(c, r[c.key])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a className="btn" href={`/api/scaffold/${code}/export.pdf?lang=${lang}`} target="_blank" rel="noreferrer" data-testid="sc-pdf"><FileText size={16} aria-hidden /> {t('sc.print')}</a>
          </section>
          {d.fields.length > 0 && <DraftForm code={code} fields={d.fields} />}
        </>
      )}
    </div>
  );
}

/** Форма-заготовка: показывает будущие поля, сохранение отключено до наполнения модуля. */
function DraftForm({ code, fields }: { code: string; fields: Field[] }) {
  const { t } = useI18n();
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  return (
    <section className="card">
      <h2>{t('sc.form')}</h2>
      <form className="grid-form" onSubmit={(e) => e.preventDefault()} data-testid="sc-form">
        {fields.map((f) => f.type === 'number'
          ? <NumberInput key={f.key} name={`${code}-${f.key}`} label={t(`sc.col.${f.key}`)} value={v[f.key] ?? ''} onChange={(raw) => set(f.key, raw)} />
          : <div key={f.key} className="field"><label htmlFor={`${code}-${f.key}`}>{t(`sc.col.${f.key}`)}</label>
              <input id={`${code}-${f.key}`} type={f.type} value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} /></div>)}
      </form>
      <p className="muted">{t('sc.formDisabled')}</p>
      <button type="button" className="btn btn--primary" disabled data-testid="sc-save">{t('term.in_development')}</button>
    </section>
  );
}
