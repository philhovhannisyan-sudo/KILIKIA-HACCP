import { Link, useParams } from 'react-router-dom';
import { findModule } from '../../shared/modules';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { PlanPage } from '../modules/a01/PlanPage';
import { MonitoringPage } from '../modules/a03/MonitoringPage';
import { EnvPage } from '../modules/a10/EnvPage';
import { NcPage } from '../modules/d04/NcPage';
import { PrpPage } from '../modules/a02/PrpPage';
import { ReportsPage } from '../modules/e01/ReportsPage';
import { TracePage } from '../modules/a04/TracePage';
import { ScaffoldPage } from '../modules/scaffold/ScaffoldPage';
import { AdminPanels } from '../modules/e02/AdminPanels';

// Маршрут модуля: полные модули — свои страницы, остальные 19 — типовой каркас (фаза 8).
export function ModulePage() {
  const { code = '' } = useParams();
  const { can } = useAuth();
  const m = findModule(code);
  if (!m) return <NotFound />;
  if (!can(`${m.code.toLowerCase()}.module.read`)) return <AccessDenied code={m.code} />;
  if (m.code === 'A01') return <PlanPage />;
  if (m.code === 'A03') return <MonitoringPage />;
  if (m.code === 'A10') return <EnvPage />;
  if (m.code === 'A04') return <TracePage />;
  if (m.code === 'A02') return <PrpPage />;
  if (m.code === 'D04') return <NcPage />;
  if (m.code === 'E01') return <ReportsPage />;
  if (m.code === 'E02') return <ScaffoldPage key={m.code} code={m.code}><AdminPanels /></ScaffoldPage>;
  return <ScaffoldPage key={m.code} code={m.code} />;
}

function AccessDenied({ code }: { code: string }) {
  const { t } = useI18n();
  return (
    <div className="page" data-testid={`page-${code}`}>
      <h1><span className="code">{code}</span> {t(`module.${code}.title`)}</h1>
      <p className="tag tag--danger" data-testid="access-denied">{t('error.forbidden', { permission: `${code.toLowerCase()}.module.read` })}</p>
    </div>
  );
}

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="page" data-testid="page-not-found">
      <h1>{t('notFound.title')}</h1>
      <Link to="/">{t('notFound.back')}</Link>
    </div>
  );
}
