import { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { useI18n } from '../../i18n/I18nProvider';
import { useErrorText } from '../../i18n/useErrorText';
import { ActionButton, Can } from '../../components/Can';
import { useToast } from '../../components/Toast';
import { emitDataChanged, useDataVersion } from '../../dataEvents';
import { BackupControls } from '../../app/TopBar';
import { ROLES } from '../../../shared/permissions';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** E02: пользователи и роли, журнал входов, журнал аудита с проверкой цепочки, бэкап, площадка (заготовка). */
export function AdminPanels() {
  return (<><Users /><Logins /><Audit /><section className="card"><BackupControls idPrefix="e02-" /></section><Sites /></>);
}

function Users() {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [users, setUsers] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Record<string, string[]>>({});
  useEffect(() => { api<Row[]>('/api/users').then(setUsers).catch(() => setUsers([])); }, [version]);
  const roles = (u: Row): string[] => edit[u.id] ?? u.roles;
  const toggle = (u: Row, r: string) => setEdit({ ...edit, [u.id]: roles(u).includes(r) ? roles(u).filter((x) => x !== r) : [...roles(u), r] });
  const save = async (u: Row) => {
    try {
      await api(`/api/users/${u.id}/roles`, { method: 'PUT', json: { roles: roles(u) } });
      toast(t('e02.rolesSaved', { login: u.login }), 'success');
      const { [u.id]: _done, ...rest } = edit; void _done;
      setEdit(rest);
      emitDataChanged();
    } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <Can permission="user.account.read">
      <section className="card" data-testid="e02-users">
        <h2>{t('e02.users')}</h2>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>{t('sc.col.code')}</th><th>{t('sc.col.name')}</th><th>{t('sc.col.roles')}</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-user={u.login}>
                  <td data-label={t('sc.col.code')} className="code">{u.login}</td>
                  <td data-label={t('sc.col.name')}>{u.fullName}</td>
                  <td data-label={t('sc.col.roles')}>
                    {ROLES.map((r) => (
                      <label key={r} className="check"><input type="checkbox" checked={roles(u).includes(r)} onChange={() => toggle(u, r)} data-role={r} /> {t(`role.${r}`)}</label>
                    ))}
                  </td>
                  <td className="row-actions">
                    <ActionButton permission="user.role.update" className="btn" disabled={roles(u).length === 0} onClick={() => void save(u)} data-testid="e02-save-roles"><Save size={16} aria-hidden /> {t('e02.saveRoles')}</ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Can>
  );
}

function Logins() {
  const { t, fmtDateTime } = useI18n();
  const version = useDataVersion();
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { api<Row[]>('/api/login-events').then(setRows).catch(() => setRows([])); }, [version]);
  return (
    <Can permission="user.account.read">
      <section className="card" data-testid="e02-logins">
        <h2>{t('e02.logins')}</h2>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>{t('sc.col.date')}</th><th>{t('sc.col.code')}</th><th>{t('sc.col.result')}</th></tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r) => (
                <tr key={r.id}>
                  <td data-label={t('sc.col.date')}>{fmtDateTime(new Date(r.at))}</td>
                  <td data-label={t('sc.col.code')} className="code">{r.login}</td>
                  <td data-label={t('sc.col.result')}>{t(r.result === 'success' ? 'e02.loginOk' : 'e02.loginFail')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Can>
  );
}

function Audit() {
  const { t, fmtDateTime } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const version = useDataVersion();
  const [items, setItems] = useState<Row[]>([]);
  const [check, setCheck] = useState<{ ok: boolean; count: number; brokenAtSeq?: number } | null>(null);
  useEffect(() => { api<{ items: Row[] }>('/api/audit?limit=50').then((r) => setItems(r.items)).catch(() => setItems([])); }, [version]);
  const verify = async () => {
    try { setCheck(await api('/api/audit/verify')); } catch (e) { toast(errorText(e), 'error'); }
  };
  return (
    <Can permission="audit.log.read">
      <section className="card" data-testid="e02-audit">
        <h2>{t('e02.audit')}</h2>
        <button type="button" className="btn" onClick={() => void verify()} data-testid="e02-verify"><ShieldCheck size={16} aria-hidden /> {t('e02.verify')}</button>
        {check && <p className={`tag ${check.ok ? 'tag--ok' : 'tag--danger'}`} data-testid="e02-chain" data-ok={check.ok}>
          {check.ok ? t('e02.chainOk', { count: check.count }) : t('e02.chainBroken', { seq: check.brokenAtSeq ?? '' })}</p>}
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>{t('sc.col.date')}</th><th>{t('sc.col.name')}</th><th>{t('sc.col.roles')}</th><th>{t('e02.action')}</th><th>{t('e02.object')}</th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td data-label={t('sc.col.date')}>{fmtDateTime(new Date(r.at))}</td>
                  <td data-label={t('sc.col.name')}>{r.user_name_snapshot}</td>
                  <td data-label={t('sc.col.roles')}>{(r.roles_snapshot as string[]).map((x) => ((ROLES as string[]).includes(x) ? t(`role.${x}`) : x)).join(', ')}</td>
                  <td data-label={t('e02.action')} className="code">{r.module} · {r.action}</td>
                  <td data-label={t('e02.object')} className="code">{r.object_type}{r.object_id ? ` · ${r.object_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Can>
  );
}

function Sites() {
  const { t, l } = useI18n();
  const [sites, setSites] = useState<Row[]>([]);
  useEffect(() => { api<Row[]>('/api/sites').then(setSites).catch(() => setSites([])); }, []);
  return (
    <section className="card" data-testid="e02-sites">
      <h2>{t('e02.site')}</h2>
      <ul>{sites.map((s) => <li key={s.id}><span className="code">{s.code}</span> · {l(s.name_i18n)}</li>)}</ul>
    </section>
  );
}
