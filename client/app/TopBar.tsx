import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, RotateCcw, ShieldCheck, UserRound } from 'lucide-react';
import { LANGS, type Lang } from '../../shared/time';
import { useI18n } from '../i18n/I18nProvider';
import { useModal } from '../components/Modal';
import { useToast } from '../components/Toast';

export function TopBar() {
  const { t, lang, setLang, fmtDateTime } = useI18n();
  const modal = useModal();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Вход, роли, выход и сброс появятся на фазе 2 — пока честная модальная заглушка.
  const phase2 = () => modal.open({ title: t('stub.authTitle'), body: <p>{t('stub.authText')}</p> });

  const onLang = (l: Lang) => {
    setLang(l);
    toast(t('toast.langChanged', { lang: t(`lang.${l}`) }));
  };

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
        <label className="lang-select">
          <span className="visually-hidden">{t('top.language')}</span>
          <select value={lang} onChange={(e) => onLang(e.target.value as Lang)} data-testid="lang-select" aria-label={t('top.language')}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {t(`lang.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--ghost" onClick={phase2} data-testid="user-menu" aria-label={t('top.openMenu')}>
          <UserRound size={18} aria-hidden />
          <span className="topbar__user">
            {t('top.guest')} · {t('top.roles')}: {t('top.noRoles')}
          </span>
        </button>
        <button type="button" className="icon-btn" onClick={phase2} aria-label={t('top.reset')} title={t('top.reset')}>
          <RotateCcw size={18} aria-hidden />
        </button>
        <button type="button" className="icon-btn" onClick={phase2} aria-label={t('top.logout')} title={t('top.logout')}>
          <LogOut size={18} aria-hidden />
        </button>
      </div>
    </header>
  );
}
