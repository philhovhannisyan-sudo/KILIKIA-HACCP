import { Link } from 'react-router-dom';
import { GROUPS, modulePath, modulesOfGroup } from '../../shared/modules';
import { useI18n, type TKey } from '../i18n/I18nProvider';

const KPIS: TKey[] = ['home.kpi.readiness', 'home.kpi.openCapa', 'home.kpi.overdueCal', 'home.kpi.quarantine'];

export function HomePage() {
  const { t } = useI18n();
  return (
    <div className="page" data-testid="page-home">
      <h1>{t('home.title')}</h1>
      <p className="muted">{t('home.subtitle')}</p>
      <p className="badge badge--stub">{t('home.stubNote')}</p>
      <div className="kpis">
        {KPIS.map((k) => (
          <div key={k} className="kpi">
            <div className="kpi__label">{t(k)}</div>
            <div className="kpi__value" aria-label={t('home.noData')}>
              —
            </div>
            <div className="kpi__hint muted">{t('home.noData')}</div>
          </div>
        ))}
      </div>
      <h2>{t('home.modules')}</h2>
      <div className="module-grid">
        {GROUPS.map((g) => (
          <section key={g} className="card">
            <h3>
              <span className="code">{g}</span> {t(`group.${g}`)}
            </h3>
            <ul className="link-list">
              {modulesOfGroup(g).map((m) => (
                <li key={m.code}>
                  <Link to={modulePath(m.code)}>
                    <span className="code">{m.code}</span> {t(`module.${m.code}.title`)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
