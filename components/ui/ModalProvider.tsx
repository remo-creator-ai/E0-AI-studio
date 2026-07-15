import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalType = 'success' | 'error' | 'warning' | 'info';

interface ModalOptions {
  type?: ModalType;
  confirmText?: string;
  cancelText?: string;
}

interface ModalState {
  kind: 'alert' | 'confirm';
  message: string;
  type: ModalType;
  confirmText: string;
  cancelText: string;
  resolve: (value: boolean) => void;
}

interface ModalContextValue {
  alert: (message: string, options?: ModalOptions) => Promise<void>;
  confirm: (message: string, options?: ModalOptions) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ModalContext = createContext<ModalContextValue | null>(null);

export const useModal = (): ModalContextValue => {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
};

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

const iconMap: Record<ModalType, { icon: React.ElementType; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  error:   { icon: AlertCircle,  color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
  warning: { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  info:    { icon: Info,          color: 'text-[#293463]', bg: 'bg-[#EEF0F6] border-[#CBD2E4]' },
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [visible, setVisible] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Animate in when modal mounts
  useEffect(() => {
    if (modal) {
      // rAF so the initial render has opacity-0, then we flip to opacity-100
      requestAnimationFrame(() => setVisible(true));
    }
  }, [modal]);

  const close = useCallback((result: boolean) => {
    setVisible(false);
    // Wait for fade-out animation before unmounting
    setTimeout(() => {
      setModal((prev) => {
        prev?.resolve(result);
        return null;
      });
    }, 200);
  }, []);

  // ESC key handler
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(modal.kind === 'confirm' ? false : true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, close]);

  const alert = useCallback((message: string, options?: ModalOptions): Promise<void> => {
    return new Promise<boolean>((resolve) => {
      setModal({
        kind: 'alert',
        message,
        type: options?.type ?? 'info',
        confirmText: options?.confirmText ?? t('common.confirm'),
        cancelText: '',
        resolve,
      });
    }).then(() => undefined);
  }, [t]);

  const confirm = useCallback((message: string, options?: ModalOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setModal({
        kind: 'confirm',
        message,
        type: options?.type ?? 'info',
        confirmText: options?.confirmText ?? t('common.confirm'),
        cancelText: options?.cancelText ?? t('common.cancel'),
        resolve,
      });
    });
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && modal?.kind === 'confirm') {
      close(false);
    }
  };

  // Render
  const IconInfo = modal ? iconMap[modal.type] : null;
  const IconComponent = IconInfo?.icon;

  return (
    <ModalContext.Provider value={{ alert, confirm }}>
      {children}

      {modal && (
        <div
          ref={backdropRef}
          onClick={handleBackdropClick}
          className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md transition-opacity duration-200 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className={`bg-white border border-zinc-200 rounded-[2rem] w-full max-w-md shadow-2xl transition-all duration-200 ${
              visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
          >
            {/* Icon + Message */}
            <div className="p-8 space-y-6">
              {/* Icon */}
              {IconComponent && IconInfo && (
                <div className="flex justify-center">
                  <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center ${IconInfo.bg}`}>
                    <IconComponent size={32} className={IconInfo.color} />
                  </div>
                </div>
              )}

              {/* Message */}
              <p className="text-center text-base text-zinc-900 leading-relaxed whitespace-pre-line font-medium">
                {modal.message}
              </p>
            </div>

            {/* Buttons */}
            <div className="px-8 pb-8 flex gap-3">
              {modal.kind === 'confirm' && (
                <button
                  onClick={() => close(false)}
                  className="flex-1 py-3.5 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full font-bold text-sm text-zinc-700 transition-all active:scale-95"
                >
                  {modal.cancelText}
                </button>
              )}
              <button
                onClick={() => close(modal.kind === 'confirm' ? true : true)}
                className="flex-1 py-3.5 bg-primary hover:bg-[#1E2650] rounded-full font-black text-sm text-white transition-all active:scale-95 shadow-[0_8px_20px_rgba(41,52,99,0.25)]"
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
