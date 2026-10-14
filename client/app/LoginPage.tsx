import { useEffect, useState, type FormEvent } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { useErrorText } from '../i18n/useErrorText';
import { LangSelect } from '../components/LangSelect';

interface DemoUsers { demo: boolean; password?: string; users: { login: string; fullName: string; roles: string[] }[] }

export function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const errorText = useErrorText();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<DemoUsers | null>(null);

  useEffect(() => { api<DemoUsers>('/api/auth/demo-users').then(setDemo).catch(() => setDemo(null)); }, []);

  const submit = async (creds: { login: string; password: string }) => {
    setBusy(true);
    setError(null);
    try { await login(creds.login, creds.password); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit(form); };

  return (
    <div className="login" data-testid="page-login">
      <header className="login__header">
        <span className="brand"><ShieldCheck size={22} aria-hidden /> <span className="brand__name">{t('app.title')}</span></span>
        <LangSelect notify={false} />
      </header>
      <div className="login__body">
        <section className="card login__card">
          <h1>{t('login.title')}</h1>
          <p className="muted">{t('app.subtitle')}</p>
          <form className="form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="login-login">{t('login.login')}</label>
              <input id="login-login" name="login" autoComplete="username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="login-password">{t('login.password')}</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {error && <p className="field__error" role="alert">{error}</p>}
            <button type="submit" className="btn btn--primary" disabled={busy}><LogIn size={18} aria-hidden /> {t('login.submit')}</button>
          </form>
        </section>
        {demo?.demo && (
          <section className="card login__card" data-testid="demo-users">
            <h2>{t('login.demoTitle')}</h2>
            <p className="muted">{t('login.demoHint', { password: demo.password ?? '' })}</p>
            <ul className="demo-users">
              {demo.users.map((u) => (
                <li key={u.login}>
                  <button type="button" className="btn demo-user" disabled={busy} onClick={() => void submit({ login: u.login, password: demo.password ?? '' })}
                    aria-label={t('login.useAccount', { login: u.login })} data-testid={`demo-${u.login}`}>
                    <span className="code">{u.login}</span>
                    <span>{u.fullName}</span>
                    <span className="muted">{u.roles.map((r) => t(`role.${r}`)).join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
