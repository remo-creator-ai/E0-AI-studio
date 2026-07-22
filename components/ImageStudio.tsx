// =============================================================
//  단건 이미지 제작 (PRD §9.4 / single-image-generation-uiux.md)
//
//  1단계 범위: 텍스트로 생성 → 결과 1장 → 다운로드 / 다시 생성.
//  이미지 참고(자산 보관함 연동)와 자산 저장은 후속 단계에서 붙인다.
//
//  영상 경로와 격리: services/imageStudioService 만 사용하고
//  geminiService(스토리보드·씬 재생성)는 import 하지 않는다.
// =============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Download, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';
import { useCreditStore } from '../store/creditStore';
import {
  generateStudioImage, isImageApiReady,
  STUDIO_ASPECTS, DEFAULT_ASPECT, IMAGE_STUDIO_CREDIT_COST,
  type StudioAspect, type GenerateFailure,
} from '../services/imageStudioService';

const ASPECT_LABEL: Record<StudioAspect, string> = {
  '1:1': 'square',
  '16:9': 'landscape',
  '9:16': 'portrait',
};

/** 형태 버튼 안의 비율 아이콘 (계획서 §5.5) */
const AspectIcon: React.FC<{ aspect: StudioAspect; active: boolean }> = ({ aspect, active }) => {
  const [w, h] = aspect === '1:1' ? [16, 16] : aspect === '16:9' ? [20, 11] : [11, 20];
  return (
    <span className="h-5 flex items-center justify-center">
      <span
        className={`block rounded-[3px] border-2 transition-colors ${active ? 'border-white' : 'border-zinc-400'}`}
        style={{ width: w, height: h }}
      />
    </span>
  );
};

export const ImageStudio: React.FC = () => {
  const { t } = useTranslation();
  const balance = useCreditStore((s) => s.balance);
  const deduct = useCreditStore((s) => s.deduct);
  const hasEnough = useCreditStore((s) => s.hasEnough);

  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<StudioAspect>(DEFAULT_ASPECT);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [failure, setFailure] = useState<GenerateFailure | null>(null);
  const [apiReady, setApiReady] = useState(true);

  useEffect(() => { isImageApiReady().then(setApiReady); }, []);

  const cost = IMAGE_STUDIO_CREDIT_COST;
  const enoughCredits = hasEnough(cost);
  const canGenerate = prompt.trim().length > 0 && !busy && apiReady && enoughCredits;

  const run = useCallback(async () => {
    if (!canGenerate) return;
    setBusy(true);
    setFailure(null);
    const res = await generateStudioImage({ prompt, aspect });
    if (res.ok && res.imageUrl) {
      setImage(res.imageUrl);
      // IMAGE-08: 성공한 생성에만 차감한다. 실패 시 차감 자체가 없어 환불 경로를 타지 않는다.
      await deduct(cost, `image_studio:${aspect}`);
    } else {
      setFailure(res.failure ?? 'error');
    }
    setBusy(false);
  }, [canGenerate, prompt, aspect, cost, deduct]);

  const download = useCallback(() => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = `SODAM_Image_${aspect.replace(':', 'x')}.png`;
    link.click();
  }, [image, aspect]);

  // 오류가 나도 프롬프트와 형태는 유지한다 (계획서 §9)
  const errorMessage = !apiReady
    ? t('imageStudio.error.noApiKey')
    : !enoughCredits
      ? t('imageStudio.error.notEnoughCredits', { cost, balance })
      : failure === 'no_api_key'
        ? t('imageStudio.error.noApiKey')
        : failure === 'blocked'
          ? t('imageStudio.error.blocked')
          : failure
            ? t('imageStudio.error.failed')
            : null;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ================= 생성 설정 패널 ================= */}
      <aside className="w-full lg:w-[380px] lg:shrink-0 flex flex-col bg-white border border-zinc-200 rounded-3xl p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">{t('imageStudio.title')}</h1>
          <p className="text-xs text-zinc-500 mt-1">{t('imageStudio.subtitle')}</p>
        </div>

        {/* 생성 방식 — 이미지 참고는 후속 단계 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.mode.label')}</label>
        <div className="mt-1.5 mb-5 flex gap-1 p-1 bg-zinc-100 rounded-xl">
          <span className="flex-1 py-2 rounded-lg bg-white text-center text-sm font-bold text-zinc-900 shadow-sm">
            {t('imageStudio.mode.text')}
          </span>
          <span
            title={t('imageStudio.mode.referenceSoon')}
            className="flex-1 py-2 rounded-lg text-center text-sm font-bold text-zinc-400 cursor-not-allowed"
          >
            {t('imageStudio.mode.reference')}
          </span>
        </div>

        {/* 프롬프트 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.prompt.label')}</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder={t('imageStudio.prompt.placeholder')}
          className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:border-primary resize-none"
        />
        <div className="flex items-start justify-between gap-3 mt-1.5 mb-5">
          <p className="text-[11px] text-zinc-400 leading-relaxed">{t('imageStudio.prompt.example')}</p>
          <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">{prompt.length}</span>
        </div>

        {/* 이미지 형태 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.aspect.label')}</label>
        <div className="mt-1.5 mb-5 grid grid-cols-3 gap-2">
          {STUDIO_ASPECTS.map((a) => {
            const active = aspect === a;
            return (
              <button
                key={a}
                onClick={() => setAspect(a)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border font-bold transition-all active:scale-95 ${
                  active ? 'bg-primary border-primary text-white' : 'bg-white border-zinc-200 text-zinc-600 hover:border-primary/40'
                }`}
              >
                <AspectIcon aspect={a} active={active} />
                <span className="text-[11px]">{t(`imageStudio.aspect.${ASPECT_LABEL[a]}`)}</span>
                <span className={`text-[10px] ${active ? 'text-white/70' : 'text-zinc-400'}`}>{a}</span>
              </button>
            );
          })}
        </div>

        {errorMessage && (
          <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-red-600 leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* 생성 버튼 — 패널 하단 고정 (계획서 §5.6) */}
        <div className="mt-auto pt-2">
          <button
            onClick={run}
            disabled={!canGenerate}
            className="w-full py-4 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-full font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                {t('imageStudio.generate.generating')}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {t('imageStudio.generate.button')}
                <span className="opacity-70">· {t('imageStudio.generate.cost', { count: cost })}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ================= 결과 작업영역 ================= */}
      <section className="flex-1 min-h-[70vh] bg-white border border-zinc-200 rounded-3xl flex items-center justify-center p-6">
        {busy ? (
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-zinc-500">{t('imageStudio.loading')}</p>
          </div>
        ) : image ? (
          <div className="w-full flex flex-col items-center gap-5">
            <img src={image} alt="" className="max-w-full max-h-[60vh] object-contain rounded-2xl" />
            <div className="flex gap-2 flex-wrap justify-center">
              <button
                onClick={download}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-[#003E99] text-white rounded-full font-bold text-sm transition-all active:scale-95"
              >
                <Download size={15} /> {t('imageStudio.result.download')}
              </button>
              <button
                onClick={run}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 hover:border-primary/40 disabled:text-zinc-300 text-zinc-700 rounded-full font-bold text-sm transition-all active:scale-95"
              >
                <RefreshCw size={15} /> {t('imageStudio.result.regenerate')}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 mx-auto">
              <ImagePlus size={30} />
            </div>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">{t('imageStudio.empty')}</p>
          </div>
        )}
      </section>
    </div>
  );
};
