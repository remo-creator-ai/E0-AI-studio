import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalType = 'success' | 'error' | 'warning' | 'info';

interface ModalOptions {
  type?: ModalType;
  confirmText?: string;
  cancelText?: string;
  /** 굵은 한 줄 제목. 무엇이 실패/완료됐는지. 없으면 message 만 보여준다. */
  title?: string;
  /** 다음에 뭘 하면 되는지. 본문 아래 강조 박스로 붙는다. */
  hint?: string;
  /** 문의용 짧은 식별자 (예: "오류 코드: PROHIBITED_CONTENT"). */
  code?: string;
  /** 영어 원문 등 기술 정보. 기본 접힘 — 일반 사용자에게 노출되지 않는다. */
  detail?: string;
}

interface ModalState {
  kind: 'alert' | 'confirm';
  message: string;
  type: ModalType;
  confirmText: string;
  cancelText: string;
  title?: string;
  hint?: string;
  code?: string;
  detail?: string;
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
  success: { icon: CheckCircle2, color: 'text-[#0050BF]', bg: 'bg-[#E5EDFA] border-[#C0D4F0]' },
  error:   { icon: AlertCircle,  color: 'text-zinc-600',     bg: 'bg-zinc-100 border-zinc-200' },
  warning: { icon: AlertTriangle, color: 'text-[#0050BF]',  bg: 'bg-[#E5EDFA] border-[#C0D4F0]' },
  info:    { icon: Info,          color: 'text-[#0050BF]', bg: 'bg-[#EEF3FC] border-[#C0D4F0]' },
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [visible, setVisible] = useState(false);
  // 기술 정보 펼침 상태. 모달이 바뀔 때마다 접힌 상태로 되돌린다.
  const [detailOpen, setDetailOpen] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Animate in when modal mounts
  useEffect(() => {
    if (modal) {
      setDetailOpen(false);
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
        title: options?.title,
        hint: options?.hint,
        code: options?.code,
        detail: options?.detail,
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

              {/* Title + Message */}
              <div className="space-y-2.5">
                {modal.title && (
                  <p className="text-center text-lg font-black text-zinc-900 leading-snug">
                    {modal.title}
                  </p>
                )}
                <p className={`text-center leading-relaxed whitespace-pre-line ${
                  modal.title
                    ? 'text-sm text-zinc-600 font-medium'
                    : 'text-base text-zinc-900 font-medium'
                }`}>
                  {modal.message}
                </p>
              </div>

              {/* 다음 행동 안내 — 원인만 알려주고 끝내지 않는다 */}
              {modal.hint && (
                <div className="rounded-2xl bg-[#EEF3FC] border border-[#C0D4F0] px-4 py-3">
                  <p className="text-[13px] text-[#0050BF] font-bold leading-relaxed text-center whitespace-pre-line">
                    {modal.hint}
                  </p>
                </div>
              )}

              {/* 문의용 코드 + 접힌 원문 (기술 정보는 기본적으로 숨긴다) */}
              {(modal.code || modal.detail) && (
                <div className="space-y-2">
                  {modal.code && (
                    <p className="text-center text-[11px] text-zinc-400 tabular-nums">{modal.code}</p>
                  )}
                  {modal.detail && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setDetailOpen((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        <ChevronDown size={12} className={`transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
                        {t('errors.gen.detailToggle')}
                      </button>
                      {detailOpen && (
                        <pre className="mt-2 max-h-32 overflow-auto rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-left text-[10px] leading-relaxed text-zinc-500 whitespace-pre-wrap break-all">
                          {modal.detail}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                className="flex-1 py-3.5 bg-primary hover:bg-[#003E99] rounded-full font-black text-sm text-white transition-all active:scale-95 shadow-[0_8px_20px_rgba(0,80,191,0.25)]"
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
