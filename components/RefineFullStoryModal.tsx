
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, X, CheckCheck, XCircle } from 'lucide-react';
import { Scene } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefinedSceneResult {
  content_kr: string;
  content_en: string;
  script_kr: string;
  script_en: string;
}

interface RefineFullStoryModalProps {
  originalScenes: Scene[];
  refinedResults: RefinedSceneResult[];
  viewLanguage: 'KR' | 'EN';
  onApply: (acceptedMask: boolean[]) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RefineFullStoryModal: React.FC<RefineFullStoryModalProps> = ({
  originalScenes,
  refinedResults,
  viewLanguage,
  onApply,
  onCancel,
}) => {
  const { t } = useTranslation();

  const [accepted, setAccepted] = useState<boolean[]>(
    () => new Array(originalScenes.length).fill(true)
  );

  // Derived state
  const acceptedCount = accepted.filter(Boolean).length;
  const allAccepted = acceptedCount === accepted.length;
  const noneAccepted = acceptedCount === 0;

  // ESC key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Toggle a single scene
  const toggleScene = (index: number) => {
    setAccepted((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  // Bulk controls
  const acceptAll = () => setAccepted(new Array(originalScenes.length).fill(true));
  const rejectAll = () => setAccepted(new Array(originalScenes.length).fill(false));

  // Backdrop click — only fires when clicking the outer overlay, not modal content
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  // Text helpers based on viewLanguage
  const getOriginalContent = (scene: Scene): string =>
    viewLanguage === 'KR' ? scene.content_kr : scene.content_en;

  const getOriginalScript = (scene: Scene): string =>
    viewLanguage === 'KR' ? scene.script_kr : scene.script_en;

  const getRefinedContent = (result: RefinedSceneResult): string =>
    viewLanguage === 'KR' ? result.content_kr : result.content_en;

  const getRefinedScript = (result: RefinedSceneResult): string =>
    viewLanguage === 'KR' ? result.script_kr : result.script_en;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Modal panel */}
      <div
        className="bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{
          animation: 'refineModalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        {/* ------------------------------------------------------------------ */}
        {/* HEADER                                                               */}
        {/* ------------------------------------------------------------------ */}
        <div className="shrink-0 p-6 md:p-8 border-b border-white/5">
          <div className="flex items-start justify-between gap-4">
            {/* Left: icon + title */}
            <div className="flex items-start gap-4 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-2xl bg-[#00D1FF]/10 border border-[#00D1FF]/20 flex items-center justify-center mt-0.5">
                <Wand2 size={18} className="text-[#00D1FF]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black italic uppercase tracking-wider text-white leading-tight">
                  {t('assembly.refineModal.title')}
                </h2>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  {t('assembly.refineModal.subtitle')}
                </p>
              </div>
            </div>

            {/* Right: bulk controls + badge + close */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Accept All */}
              <button
                type="button"
                onClick={acceptAll}
                disabled={allAccepted}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#00D1FF]/[0.12] hover:bg-[#00D1FF]/20 border border-[#00D1FF]/20 hover:border-[#00D1FF]/40 rounded-xl text-[11px] font-black uppercase tracking-wide text-[#00D1FF] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <CheckCheck size={12} />
                {t('assembly.refineModal.acceptAll')}
              </button>

              {/* Reject All */}
              <button
                type="button"
                onClick={rejectAll}
                disabled={noneAccepted}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-[11px] font-black uppercase tracking-wide text-gray-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <XCircle size={12} />
                {t('assembly.refineModal.rejectAll')}
              </button>

              {/* Selected badge */}
              <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl">
                <span className="text-[11px] font-black tabular-nums text-gray-300">
                  {t('assembly.refineModal.selectedCount', {
                    count: acceptedCount,
                    total: originalScenes.length,
                  })}
                </span>
              </div>

              {/* Close */}
              <button
                type="button"
                onClick={onCancel}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all active:scale-95"
                aria-label={t('common.cancel')}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Mobile bulk controls */}
          <div className="flex sm:hidden items-center gap-2 mt-4">
            <button
              type="button"
              onClick={acceptAll}
              disabled={allAccepted}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00D1FF]/[0.12] border border-[#00D1FF]/20 rounded-xl text-[11px] font-black uppercase tracking-wide text-[#00D1FF] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <CheckCheck size={12} />
              {t('assembly.refineModal.acceptAll')}
            </button>
            <button
              type="button"
              onClick={rejectAll}
              disabled={noneAccepted}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-black uppercase tracking-wide text-gray-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <XCircle size={12} />
              {t('assembly.refineModal.rejectAll')}
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* SCENE LIST                                                           */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
          {originalScenes.map((scene, index) => {
            const result = refinedResults[index];
            const isAccepted = accepted[index] ?? true;

            if (!result) return null;

            return (
              <div
                key={scene.id}
                className={`rounded-2xl border transition-all duration-200 ${
                  isAccepted
                    ? 'bg-white/[0.03] border-[#00D1FF]/20'
                    : 'bg-white/[0.01] border-white/5 opacity-50'
                }`}
              >
                {/* DESKTOP layout (md+): horizontal row */}
                <div className="hidden md:flex flex-row gap-4 p-4 relative">
                  {/* Thumbnail + cut label */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    {scene.image_url ? (
                      <img
                        src={scene.image_url}
                        alt={`Cut ${scene.order}`}
                        className="w-16 h-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <span className="text-[10px] font-black text-gray-600 uppercase">IMG</span>
                      </div>
                    )}
                    <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                      {t('assembly.cutLabel', { number: scene.order })}
                    </span>
                  </div>

                  {/* BEFORE column */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <span className="block text-[10px] font-black text-gray-600 uppercase tracking-widest">
                      {t('assembly.refineModal.before')}
                    </span>
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                      {getOriginalContent(scene)}
                    </p>
                    {getOriginalScript(scene) && (
                      <p className="text-xs text-gray-500 italic leading-relaxed line-clamp-2">
                        {getOriginalScript(scene)}
                      </p>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="shrink-0 w-px bg-white/5 self-stretch" />

                  {/* AFTER column */}
                  <div className="flex-1 min-w-0 space-y-2 pr-12">
                    <span className="block text-[10px] font-black text-[#00D1FF] uppercase tracking-widest">
                      {t('assembly.refineModal.after')}
                    </span>
                    <p
                      className={`text-xs leading-relaxed line-clamp-3 transition-all ${
                        isAccepted
                          ? 'text-white'
                          : 'text-gray-500 line-through'
                      }`}
                    >
                      {getRefinedContent(result)}
                    </p>
                    {getRefinedScript(result) && (
                      <p
                        className={`text-xs italic leading-relaxed line-clamp-2 transition-all ${
                          isAccepted
                            ? 'text-white'
                            : 'text-gray-500 line-through'
                        }`}
                      >
                        {getRefinedScript(result)}
                      </p>
                    )}
                  </div>

                  {/* Toggle — absolute top-right */}
                  <div className="absolute top-4 right-4">
                    <button
                      type="button"
                      onClick={() => toggleScene(index)}
                      className={`w-10 h-5 rounded-full transition-all relative flex items-center px-0.5 shrink-0 ${
                        isAccepted
                          ? 'bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)]'
                          : 'bg-gray-700'
                      }`}
                      aria-label={isAccepted ? 'Accepted' : 'Rejected'}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                          isAccepted ? 'translate-x-[20px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* MOBILE layout (<md): vertical stack */}
                <div className="md:hidden flex flex-col gap-3 p-4">
                  {/* Top row: thumbnail + cut label + toggle */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {scene.image_url ? (
                        <img
                          src={scene.image_url}
                          alt={`Cut ${scene.order}`}
                          className="w-12 h-12 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-black text-gray-600 uppercase">IMG</span>
                        </div>
                      )}
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                        {t('assembly.cutLabel', { number: scene.order })}
                      </span>
                    </div>

                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleScene(index)}
                      className={`w-10 h-5 rounded-full transition-all relative flex items-center px-0.5 shrink-0 ${
                        isAccepted
                          ? 'bg-[#00D1FF] shadow-[0_0_10px_rgba(0,209,255,0.4)]'
                          : 'bg-gray-700'
                      }`}
                      aria-label={isAccepted ? 'Accepted' : 'Rejected'}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full transition-all shadow-sm ${
                          isAccepted ? 'translate-x-[20px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Before section */}
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-black text-gray-600 uppercase tracking-widest">
                      {t('assembly.refineModal.before')}
                    </span>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {getOriginalContent(scene)}
                    </p>
                    {getOriginalScript(scene) && (
                      <p className="text-xs text-gray-500 italic leading-relaxed">
                        {getOriginalScript(scene)}
                      </p>
                    )}
                  </div>

                  {/* Separator */}
                  <div className="h-px bg-white/5" />

                  {/* After section */}
                  <div className="space-y-1.5">
                    <span className="block text-[10px] font-black text-[#00D1FF] uppercase tracking-widest">
                      {t('assembly.refineModal.after')}
                    </span>
                    <p
                      className={`text-xs leading-relaxed transition-all ${
                        isAccepted ? 'text-white' : 'text-gray-500 line-through'
                      }`}
                    >
                      {getRefinedContent(result)}
                    </p>
                    {getRefinedScript(result) && (
                      <p
                        className={`text-xs italic leading-relaxed transition-all ${
                          isAccepted ? 'text-white' : 'text-gray-500 line-through'
                        }`}
                      >
                        {getRefinedScript(result)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* FOOTER                                                               */}
        {/* ------------------------------------------------------------------ */}
        <div className="shrink-0 p-6 md:p-8 border-t border-white/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Left: summary text */}
            <p className="text-xs text-gray-500 font-medium">
              {noneAccepted
                ? t('assembly.refineModal.noScenesSelected')
                : t('assembly.refineModal.selectedCount', {
                    count: acceptedCount,
                    total: originalScenes.length,
                  })}
            </p>

            {/* Right: action buttons */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Cancel */}
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 sm:flex-none px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-all active:scale-95"
              >
                {t('common.cancel')}
              </button>

              {/* Apply Selected */}
              <button
                type="button"
                onClick={() => onApply(accepted)}
                disabled={noneAccepted}
                className="flex-1 sm:flex-none px-8 py-3 bg-[#0057FF] hover:bg-[#0057FF]/80 rounded-xl text-xs font-black uppercase tracking-wider text-white transition-all active:scale-95 shadow-[0_8px_24px_rgba(0,87,255,0.3)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {t('assembly.refineModal.applySelected')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe animation injected via a style tag — avoids Tailwind config dependency */}
      <style>{`
        @keyframes refineModalIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
