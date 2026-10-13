import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../api';
import { useI18n, type TKey } from '../i18n/I18nProvider';
import { useDataVersion } from '../dataEvents';
import { cpLabel } from '../i18n/labels';

type I18n = Record<string, string>;
export interface Dashboard {
  today: string;
  readiness: { percent: number; covered: number; total: number; clauses: { id: string; standard: string; number: string; shortName: I18n; covered: boolean; verifyStatus: string }[] };
  openCapa: { count: number; overdue: number; items: { id: string; code: string; action: string; dueDate: string; status: string; ncCode: string; owner: string; overdue: boolean }[] };
  overdueCalibration: { count: number; items: { id: string; code: string; name: I18n; nextCalDate: string }[] };
  quarantine: { count: number; items: { id: string; code: string; kind: 'fg' | 'material'; name: I18n; date: string }[] };
  recentDeviations: { id: string; eventAt: string; cpCode: string; cpType: string; parameter: I18n; unit: string | null; value: number | null; batchCode: string; ncCode: string | null }[];
  upcoming: { kind: string; code: string; date: string }[];
}

const dateOf = (s: string) => new Date(`${s}T12:00:00Z`);

export function HomePage() {
  const { t, l, fmtDate, fmtDateTime, fmtNumber } = useI18n();
  const version = useDataVersion();
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<Dashboard>('/api/dashboard').then((d) => alive && setData(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [version]);

  const Kpi = ({ labelKey, value, detail, testId, alert }: { labelKey: TKey; value: string; detail?: string; testId: string; alert?: boolean }) => (
    <div className={`kpi${alert ? ' kpi--alert' : ''}`} data-testid={testId}>
      <div className="kpi__label">{t(labelKey)}</div>
      <div className="kpi__value" data-testid={`${testId}-value`}>{value}</div>
      {detail && <div className="kpi__hint muted">{detail}</div>}
    </div>
  );
  const Empty = () => <p className="muted">{t('home.empty')}</p>;

  return (
    <div className="page" data-testid="page-home">
      <h1>{t('home.title')}</h1>
      <p className="muted">{t('home.subtitle')}</p>
      {failed && <p className="field__error" role="alert">{t('home.loadError')}</p>}
      {data && (
        <>
          <div className="kpis">
            <Kpi testId="kpi-readiness" labelKey="home.kpi.readiness" value={`${fmtNumber(data.readiness.percent)} %`}
              detail={t('home.readinessDetail', { covered: data.readiness.covered, total: data.readiness.total })} />
            <Kpi testId="kpi-capa" labelKey="home.kpi.openCapa" value={fmtNumber(data.openCapa.count)} alert={data.openCapa.overdue > 0}
              detail={t('home.openCapaDetail', { overdue: data.openCapa.overdue })} />
            <Kpi testId="kpi-calibration" labelKey="home.kpi.overdueCal" value={fmtNumber(data.overdueCalibration.count)} alert={data.overdueCalibration.count > 0} />
            <Kpi testId="kpi-quarantine" labelKey="home.kpi.quarantine" value={fmtNumber(data.quarantine.count)} alert={data.quarantine.count > 0} />
          </div>

          <div className="grid-2">
            <section className="card" data-testid="list-capa">
              <h2>{t('home.capaList')}</h2>
              {data.openCapa.items.length === 0 ? <Empty /> : (
                <ul className="items">
                  {data.openCapa.items.map((c) => (
                    <li key={c.id} className={c.overdue ? 'item--overdue' : undefined}>
                      <span className="code">{c.code}</span> · <span className="code">{c.ncCode}</span> · {t(`status.capa.${c.status}`)}
                      <div>{c.action}</div>
                      <div className="muted">{t('home.owner')}: {c.owner} · {t('home.due')}: {fmtDate(dateOf(c.dueDate))}
                        {c.overdue && <strong className="tag tag--danger"> {t('home.overdue')}</strong>}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" data-testid="list-calibration">
              <h2>{t('home.calList')}</h2>
              {data.overdueCalibration.items.length === 0 ? <Empty /> : (
                <ul className="items">
                  {data.overdueCalibration.items.map((e) => (
                    <li key={e.id} className="item--overdue"><span className="code">{e.code}</span> {l(e.name)}
                      <div className="muted">{t('home.calValidUntil')}: {fmtDate(dateOf(e.nextCalDate))}</div></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" data-testid="list-quarantine">
              <h2>{t('home.quarantineList')}</h2>
              {data.quarantine.items.length === 0 ? <Empty /> : (
                <ul className="items">
                  {data.quarantine.items.map((b) => (
                    <li key={b.id}><span className="code">{b.code}</span> · {t(b.kind === 'fg' ? 'home.batchFg' : 'home.batchMaterial')} · {l(b.name)}
                      <div className="muted">{fmtDate(dateOf(b.date))}</div></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card" data-testid="list-deviations">
              <h2>{t('home.deviations')}</h2>
              {data.recentDeviations.length === 0 ? <Empty /> : (
                <ul className="items">
                  {data.recentDeviations.map((r) => (
                    <li key={r.id} className="item--overdue">
                      <AlertTriangle size={16} aria-hidden /> <span className="code">{cpLabel(t, r.cpCode, r.cpType)}</span> · {l(r.parameter)}:{' '}
                      <span className="code">{r.value === null ? '—' : `${fmtNumber(r.value)} ${r.unit ?? ''}`}</span>
                      <div className="muted"><span className="code">{r.batchCode}</span>{r.ncCode && <> · <span className="code">{r.ncCode}</span></>} · {fmtDateTime(new Date(r.eventAt))}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card" data-testid="list-upcoming">
            <h2>{t('home.upcoming')}</h2>
            {data.upcoming.length === 0 ? <Empty /> : (
              <ul className="items items--inline">
                {data.upcoming.map((u) => (
                  <li key={`${u.kind}-${u.code}`}><span className="code">{fmtDate(dateOf(u.date))}</span> · {t(`deadline.${u.kind}`)} · <span className="code">{u.code}</span></li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" data-testid="clauses">
            <h2>{t('home.clauses')}</h2>
            <p className="badge badge--stub">{t('home.verifyBadge')}</p>
            <div className="table-wrap">
              <table className="table table--stack">
                <thead><tr><th>{t('home.colStandard')}</th><th>{t('home.colClause')}</th><th>{t('home.colName')}</th><th>{t('home.colStatus')}</th></tr></thead>
                <tbody>
                  {data.readiness.clauses.map((c) => (
                    <tr key={c.id} data-covered={c.covered}>
                      <td className="nowrap" data-label={t('home.colStandard')}>{c.standard}</td>
                      <td className="code" data-label={t('home.colClause')}>{c.number}</td>
                      <td data-label={t('home.colName')}>{l(c.shortName)}</td>
                      <td data-label={t('home.colStatus')}>{c.covered
                        ? <span className="tag tag--ok"><CheckCircle2 size={14} aria-hidden /> {t('home.covered')}</span>
                        : <span className="tag tag--danger"><XCircle size={14} aria-hidden /> {t('home.notCovered')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
