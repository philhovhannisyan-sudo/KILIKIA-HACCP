import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, LogOut, RotateCcw, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { useErrorText } from '../i18n/useErrorText';
import { useModal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ActionButton, Can } from '../components/Can';
import { LangSelect } from '../components/LangSelect';
import { emitDataChanged } from '../dataEvents';
import { NotificationsButton } from './Notifications';

export function TopBar() {
  const { t, fmtDateTime } = useI18n();
  const { me, logout } = useAuth();
  const modal = useModal();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!me) return null;
  const roles = me.roles.map((r) => t(`role.${r}`)).join(', ');

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <ShieldCheck size={22} aria-hidden />
        <span className="brand__name">{t('app.title')}</span>
      </Link>
      <div className="topbar__time" title={t('home.now')}>
        <time dateTime={now.toISOString()}>{fmtDateTime(now)}</time> <span className="muted">({t('top.timeZone')})</span>
      </div>
      <div className="topbar__actions">
        <LangSelect />
        <button type="button" className="btn btn--ghost" data-testid="user-menu" aria-label={t('top.openMenu')}
          onClick={() => modal.open({ title: t('top.account'), body: <AccountPanel /> })}>
          <UserRound size={18} aria-hidden />
          <span className="topbar__user">
            <span data-testid="user-name">{me.fullName}</span> · <span className="muted" data-testid="user-roles">{roles}</span>
          </span>
        </button>
        <NotificationsButton />
        <ResetButton />
        <button type="button" className="icon-btn" onClick={() => void logout()} aria-label={t('top.logout')} title={t('top.logout')} data-testid="logout">
          <LogOut size={18} aria-hidden />
        </button>
      </div>
    </header>
  );
}

function ResetButton() {
  const { t } = useI18n();
  const modal = useModal();
  const toast = useToast();
  const errorText = useErrorText();
  const doReset = async () => {
    try {
      const r = await api<{ backupFile: string }>('/api/system/reset', { method: 'POST' });
      modal.close();
      toast(t('top.resetDone', { file: r.backupFile }), 'success');
      emitDataChanged();
    } catch (e) {
      toast(errorText(e), 'error');
    }
  };
  return (
    <ActionButton permission="system.demo.reset" className="icon-btn" aria-label={t('top.reset')} title={t('top.reset')} data-testid="reset"
      onClick={() => modal.open({
        title: t('top.resetTitle'),
        body: <p>{t('top.resetText')}</p>,
        actions: <ActionButton permission="system.demo.reset" className="btn btn--danger" onClick={() => void doReset()} data-testid="reset-confirm">{t('top.resetConfirm')}</ActionButton>,
      })}>
      <RotateCcw size={18} aria-hidden />
    </ActionButton>
  );
}

function AccountPanel() {
  const { t } = useI18n();
  const { me } = useAuth();
  const toast = useToast();
  const errorText = useErrorText();
  const fileRef = useRef<HTMLInputElement>(null);
  if (!me) return null;

  const doExport = async () => {
    try {
      const blob = await api<Blob>('/api/system/export', { method: 'POST' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `haccp-state-${new Date().toISOString().slice(0, 10)}.json.gz`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('top.exported'), 'success');
    } catch (e) { toast(errorText(e), 'error'); }
  };
  const doImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    try {
      const r = await api<{ backupFile: string }>('/api/system/import', { method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' } });
      toast(t('top.imported', { file: r.backupFile }), 'success');
      emitDataChanged();
    } catch (e) { toast(errorText(e), 'error'); }
  };

  return (
    <div className="account">
      <dl className="facts">
        <div><dt>{t('top.user')}</dt><dd>{me.fullName}</dd></div>
        <div><dt>{t('top.loginName')}</dt><dd className="code">{me.login}</dd></div>
        <div><dt>{t('top.roles')}</dt><dd>{me.roles.map((r) => t(`role.${r}`)).join(', ')}</dd></div>
      </dl>
      <Can permission="system.backup.export">
        <h3>{t('top.backupTitle')}</h3>
        <p className="muted">{t('top.backupHint')}</p>
        <div className="form">
          <ActionButton permission="system.backup.export" onClick={() => void doExport()} data-testid="export"><Download size={16} aria-hidden /> {t('top.export')}</ActionButton>
          <Can permission="system.backup.import">
            <div className="field">
              <label htmlFor="import-file">{t('top.importFile')}</label>
              <input id="import-file" type="file" accept=".gz,.json,application/gzip,application/json" ref={fileRef} />
            </div>
            <ActionButton permission="system.backup.import" onClick={() => void doImport()} data-testid="import"><Upload size={16} aria-hidden /> {t('top.import')}</ActionButton>
          </Can>
        </div>
      </Can>
    </div>
  );
}
