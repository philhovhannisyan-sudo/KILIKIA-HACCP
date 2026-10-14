import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { GROUPS, findModule, modulePath, modulesOfGroup, type GroupCode } from '../../shared/modules';
import { useI18n } from '../i18n/I18nProvider';

// ≥ 820px — боковое меню (5 групп, 26 пунктов); < 820px — две полосы вкладок (группы → модули).
export function Sidebar() {
  const { t } = useI18n();
  return (
    <nav className="sidebar" aria-label={t('nav.menu')}>
      {GROUPS.map((g) => (
        <section key={g} className="sidebar__group">
          <h2 className="sidebar__group-title">
            <span className="code">{g}</span> {t(`group.${g}`)}
          </h2>
          <ul>
            {modulesOfGroup(g).map((m) => (
              <li key={m.code}>
                <NavLink to={modulePath(m.code)} className="sidebar__link" data-testid={`nav-${m.code}`}>
                  <span className="code">{m.code}</span>
                  <span className="sidebar__label">{t(`module.${m.code}.title`)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export function TabStrips() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const current = findModule(pathname.split('/')[2] ?? '');
  const group: GroupCode = current?.group ?? 'A';
  const ref = useRef<HTMLElement>(null);
  // Активные вкладки прокручиваются в видимую часть полосы
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('.tab.active').forEach((el) => {
      const strip = el.closest('.tabstrip') as HTMLElement | null;
      if (strip) strip.scrollLeft = el.offsetLeft - strip.offsetLeft - 8;
    });
  }, [pathname]);
  return (
    <nav className="tabstrips" aria-label={t('nav.menu')} ref={ref}>
      <ul className="tabstrip" aria-label={t('nav.groups')}>
        {GROUPS.map((g) => (
          <li key={g}>
            <NavLink
              to={modulePath(modulesOfGroup(g)[0].code)}
              className={() => `tab${g === group && current ? ' active' : ''}`}
              title={t(`group.${g}`)}
            >
              <span className="code">{g}</span> {t(`group.${g}`)}
            </NavLink>
          </li>
        ))}
      </ul>
      <ul className="tabstrip" aria-label={t('nav.modulesOfGroup')}>
        {modulesOfGroup(group).map((m) => (
          <li key={m.code}>
            <NavLink to={modulePath(m.code)} className="tab" title={t(`module.${m.code}.title`)}>
              <span className="code">{m.code}</span> {t(`module.${m.code}.title`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
