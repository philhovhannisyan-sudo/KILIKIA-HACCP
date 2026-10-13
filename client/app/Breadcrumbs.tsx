import { Link, useLocation } from 'react-router-dom';
import { findModule, modulePath, modulesOfGroup } from '../../shared/modules';
import { useI18n } from '../i18n/I18nProvider';

export function Breadcrumbs() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const m = findModule(pathname.split('/')[2] ?? '');
  if (!m) return null;
  return (
    <nav aria-label={t('nav.breadcrumbs')} className="breadcrumbs">
      <ol>
        <li>
          <Link to="/">{t('nav.home')}</Link>
        </li>
        <li>
          <Link to={modulePath(modulesOfGroup(m.group)[0].code)}>{t(`group.${m.group}`)}</Link>
        </li>
        <li aria-current="page">{t(`module.${m.code}.title`)}</li>
      </ol>
    </nav>
  );
}
