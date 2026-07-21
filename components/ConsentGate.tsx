import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useConsentStore } from '../store/consentStore';
import { CONSENT_DOCUMENTS, type ConsentDocType } from '../lib/consentDocuments';
import { LegalDocBody, legalDocTitleKey } from './legal/LegalDocBody';

// PRD §9.1 약관 동의 게이트.
// 최초 로그인(또는 약관 개정 후)에서 필수 3종 동의 전까지 앱 접근을 차단한다.
// 팝업은 배경 클릭·ESC 로 닫히지 않는다(AUTH-02). App 이 needsConsent 일 때만 렌더.

export const ConsentGate: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { agree, isSubmitting } = useConsentStore();

  const [checked, setChecked] = useState<Record<ConsentDocType, boolean>>({
    terms: false, privacy: false, ai_content: false,
  });
  const [viewing, setViewing] = useState<ConsentDocType | null>(null);
  const [error, setError] = useState(false);

  const allChecked = CONSENT_DOCUMENTS.every((d) => checked[d.type]);

  const toggleAll = () => {
    const next = !allChecked;
    setChecked({ terms: next, privacy: next, ai_content: next });
  };

  const submit = async () => {
    if (!user || !allChecked || isSubmitting) return;
    setError(false);
    const ok = await agree(user.id);
    if (!ok) setError(true);
    // 성공 시 needsConsent=false 로 바뀌어 App 이 이 게이트를 언마운트한다.
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-md">
      <div className="relative bg-white border border-zinc-200 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-8 pb-5 text-center space-y-3 shrink-0">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-[#E5EDFA] border border-[#C0D4F0] flex items-center justify-center">
              <ShieldCheck size={28} className="text-primary" />
            </div>
          </div>
          <h2 className="text-xl font-black tracking-tight text-zinc-900">{t('consent.gate.title')}</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">{t('consent.gate.subtitle')}</p>
        </div>

        {/* Items */}
        <div className="px-6 space-y-2 overflow-y-auto custom-scrollbar">
          {CONSENT_DOCUMENTS.map((d) => (
            <div
              key={d.type}
              className="flex items-center gap-3 p-3.5 rounded-2xl border border-zinc-150 bg-zinc-50/60"
            >
              <button
                type="button"
                onClick={() => setChecked((c) => ({ ...c, [d.type]: !c[d.type] }))}
                aria-pressed={checked[d.type]}
                className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${
                  checked[d.type]
                    ? 'bg-primary border-primary'
                    : 'bg-white border-zinc-300 hover:border-primary/50'
                }`}
              >
                {checked[d.type] && <Check size={15} strokeWidth={3} className="text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
                  {t('consent.gate.required')}
                </span>
                <p className="text-sm font-semibold text-zinc-800 leading-tight">{t(d.labelKey)}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewing(d.type)}
                className="shrink-0 text-xs font-bold text-zinc-500 underline underline-offset-2 hover:text-zinc-900 transition-colors"
              >
                {t('consent.gate.view')}
              </button>
            </div>
          ))}
        </div>

        {/* Agree-all + submit */}
        <div className="p-6 pt-4 space-y-3 shrink-0">
          <button
            type="button"
            onClick={toggleAll}
            aria-pressed={allChecked}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-zinc-200 hover:border-primary/40 transition-all"
          >
            <span
              className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all ${
                allChecked ? 'bg-primary border-primary' : 'bg-white border-zinc-300'
              }`}
            >
              {allChecked && <Check size={15} strokeWidth={3} className="text-white" />}
            </span>
            <span className="text-sm font-black text-zinc-900">{t('consent.gate.agreeAll')}</span>
          </button>

          {error && (
            <p className="text-center text-xs font-semibold text-red-500">{t('consent.gate.error')}</p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!allChecked || isSubmitting}
            className="w-full py-4 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 rounded-full font-black text-sm text-white transition-all active:scale-[0.98] shadow-[0_8px_20px_rgba(0,80,191,0.25)] disabled:shadow-none"
          >
            {isSubmitting ? t('consent.gate.submitting') : t('consent.gate.submit')}
          </button>
          <p className="text-center text-[11px] text-zinc-400">{t('consent.gate.creditNote')}</p>
        </div>
      </div>

      {/* Document viewer overlay (닫기 가능 — 게이트 자체는 불가) */}
      {viewing && (
        <div
          className="fixed inset-0 z-[310] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="absolute inset-0 bg-zinc-900/50 backdrop-blur-md" />
          <div className="relative bg-white border border-zinc-200 rounded-3xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-zinc-100 shrink-0">
              <h3 className="text-lg font-black tracking-tight text-zinc-900">{t(legalDocTitleKey(viewing))}</h3>
              <button onClick={() => setViewing(null)} className="p-2 hover:bg-zinc-100 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-zinc-600 leading-relaxed space-y-4">
              <LegalDocBody type={viewing} />
            </div>
            <div className="p-4 border-t border-zinc-100 shrink-0">
              <button
                onClick={() => setViewing(null)}
                className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-2xl font-bold text-sm transition-all"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
