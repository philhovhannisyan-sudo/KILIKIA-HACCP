import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

// Модальные окна приложения. alert/confirm/prompt запрещены (CLAUDE.md).
export interface ModalSpec {
  title: string;
  body: ReactNode;
  actions?: ReactNode;
}

const ModalContext = createContext<{ open: (m: ModalSpec) => void; close: () => void } | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalSpec | null>(null);
  const close = useCallback(() => setModal(null), []);
  return (
    <ModalContext.Provider value={{ open: setModal, close }}>
      {children}
      {modal && <ModalView modal={modal} onClose={close} />}
    </ModalContext.Provider>
  );
}

function ModalView({ modal, onClose }: { modal: ModalSpec; onClose: () => void }) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={dialogRef}>
        <header className="modal__header">
          <h2 id="modal-title">{modal.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('modal.close')} title={t('modal.close')}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="modal__body">{modal.body}</div>
        <footer className="modal__footer">
          {modal.actions}
          <button type="button" className="btn" onClick={onClose}>
            {t('modal.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal outside ModalProvider');
  return ctx;
}
