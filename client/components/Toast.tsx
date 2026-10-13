import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

type ToastKind = 'info' | 'success' | 'warning' | 'error';
interface ToastItem { id: number; text: string; kind: ToastKind }

const ToastContext = createContext<((text: string, kind?: ToastKind) => void) | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = nextId++;
      setItems((xs) => [...xs.slice(-3), { id, text, kind }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="region" aria-live="polite" aria-label={t('toast.region')}>
        {items.map((x) => (
          <div key={x.id} className={`toast toast--${x.kind}`} role="status">
            <span>{x.text}</span>
            <button type="button" className="icon-btn" onClick={() => dismiss(x.id)} aria-label={t('toast.dismiss')} title={t('toast.dismiss')}>
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
