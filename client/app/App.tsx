import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider, useI18n } from '../i18n/I18nProvider';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { ModalProvider } from '../components/Modal';
import { ToastProvider } from '../components/Toast';
import { TopBar } from './TopBar';
import { Sidebar, TabStrips } from './Sidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { HomePage } from './HomePage';
import { LoginPage } from './LoginPage';
import { ModulePage, NotFound } from './ModulePage';

function Shell() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  if (loading) return <p className="muted center" data-testid="loading">{t('login.loading')}</p>;
  if (!me) return <LoginPage />;
  return (
    <div className="shell">
      <a href="#content" className="skip-link">{t('nav.skipToContent')}</a>
      <TopBar />
      <TabStrips />
      <div className="shell__body">
        <Sidebar />
        <main id="content" className="content">
          <Breadcrumbs />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/m/:code" element={<ModulePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ToastProvider>
            <ModalProvider>
              <Shell />
            </ModalProvider>
          </ToastProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
