// =============================================================
//  단건 이미지 제작 (PRD §9.4 / single-image-generation-uiux.md)
//
//  기능:
//   - 텍스트로 생성 / 이미지로 생성(참고 이미지 업로드) 두 모드
//   - 스타일 팝업 (VisualStyle 10종, 프롬프트에 프리픽스로 합성)
//   - 이미지 형태(1:1/16:9/9:16)
//
//  영상 경로와 격리: services/imageStudioService 만 사용하고
//  geminiService(스토리보드·씬 재생성)는 import 하지 않는다.
//  스타일 프리셋(constants.STYLE_PROMPT_GUIDES)은 순수 상수라
//  영상 경로에 부수효과 없이 공유 가능하다.
// =============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ImagePlus, Download, RefreshCw, Sparkles, AlertCircle,
  ChevronRight, X, Upload, Bookmark, BookmarkCheck, Package,
} from 'lucide-react';
import { useCreditStore } from '../store/creditStore';
import { useAuthStore } from '../store/authStore';
import { useStore } from '../store';
import { ProjectStep, VisualStyle } from '../types';
import { STYLE_PROMPT_GUIDES } from '../constants';
import {
  generateStudioImage, isImageApiReady,
  STUDIO_ASPECTS, DEFAULT_ASPECT, IMAGE_STUDIO_CREDIT_COST,
  type StudioAspect, type GenerateFailure,
} from '../services/imageStudioService';
import { createAsset, listAssets, type Asset } from '../services/assetService';
import { listCustomStyles, type CustomStyle } from '../services/customStyleService';

/** 스타일 선택 상태: 프리셋(VisualStyle enum) 또는 사용자 커스텀(id + 즉시 사용할 프롬프트 스냅샷).
 *  커스텀은 스냅샷을 잡아두어 사용자가 설정에서 지운 뒤에도 이 생성 세션 안에서는 계속 유효하다. */
type SelectedStyle =
  | { kind: 'preset'; value: VisualStyle }
  | { kind: 'custom'; id: string; name: string; icon: string; prompt: string };

type Mode = 'text' | 'image';

const ASPECT_LABEL: Record<StudioAspect, string> = {
  '1:1': 'square',
  '16:9': 'landscape',
  '9:16': 'portrait',
};

// VisualizingStep 의 팝업과 같은 아이콘 세트를 재사용해 시각 언어를 통일한다.
const STYLE_ICONS: Record<string, string> = {
  [VisualStyle.CINEMATIC]: '🎬',
  [VisualStyle.REALISTIC]: '📷',
  [VisualStyle.TOSS_3D]: '🧊',
  [VisualStyle.FLAT_2D_PINK]: '🩷',
  [VisualStyle.MOTION_GRAPHICS]: '⚡',
  [VisualStyle.PIXAR_3D]: '🎨',
  [VisualStyle.JAPANESE_ANIME]: '✨',
  [VisualStyle.WATERCOLOR]: '🖌️',
  [VisualStyle.CYBERPUNK]: '🌃',
  [VisualStyle.SIMPLE_LINE_ART]: '✏️',
};

// 참고 이미지 제한 — assetService(10MB) 와 동일 정책. 장수는 프롬프트 안정성 고려해 3장 상한.
const MAX_REFS = 3;
const MAX_REF_MB = 10;
const ACCEPT_MIME = ['image/png', 'image/jpeg', 'image/webp'];

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

interface RefItem {
  id: string;
  dataUrl: string;   // Gemini 로 그대로 전달되고, 미리보기에도 재사용된다.
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** 자산 보관함의 signed URL 을 fetch 해 base64 dataUrl 로 바꾼다.
 *  Gemini 는 참고 이미지를 inlineData(base64) 로만 받기 때문에 URL 그대로 넘길 수 없다. */
const urlToDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

/** 결과 이미지를 캔버스로 재렌더링해 PNG File 로 변환한다.
 *  - 실제(Gemini): data:image/png;base64,... → 그대로 PNG
 *  - MOCK: data:image/svg+xml;base64,... → PNG 로 변환되어 assetService 검증(PNG/JPEG/WebP) 통과
 *  캔버스 draw 를 거치므로 두 경로 모두 동일 파이프라인으로 저장된다. */
const dataUrlToPngFile = async (dataUrl: string, filename: string): Promise<File> => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 512;
  canvas.height = img.naturalHeight || 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not supported');
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
  return new File([blob], filename, { type: 'image/png' });
};

/** 프롬프트 첫 줄을 잘라 자산 이름 후보로 만든다. 비어있으면 시각 포함 기본명. */
const autoAssetName = (prompt: string): string => {
  const first = prompt.trim().split(/\r?\n/)[0]?.trim() ?? '';
  if (first) return first.slice(0, 40);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `이미지 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; assetId: string }
  | { kind: 'error'; message: string };

export const ImageStudio: React.FC = () => {
  const { t } = useTranslation();
  const balance = useCreditStore((s) => s.balance);
  const deduct = useCreditStore((s) => s.deduct);
  const hasEnough = useCreditStore((s) => s.hasEnough);
  const user = useAuthStore((s) => s.user);
  const goTo = useStore((s) => s.setStep);

  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<StudioAspect>(DEFAULT_ASPECT);
  // 스타일 기본값은 "선택 없음". Cinematic 을 강제하면 로고·라인아트 등의 결과가 왜곡된다.
  const [style, setStyle] = useState<SelectedStyle | null>(null);
  const [isStylePopup, setIsStylePopup] = useState(false);
  // 사용자 커스텀 스타일 목록 (Settings 에서 편집). 팝업 열 때 최신 상태로 로드한다.
  const [customStyles, setCustomStyles] = useState<CustomStyle[] | null>(null);
  const [customStylesLoading, setCustomStylesLoading] = useState(false);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [refError, setRefError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 자산 보관함에서 참고 이미지 불러오기 팝업
  const [isLibraryPickOpen, setIsLibraryPickOpen] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<Asset[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryPending, setLibraryPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  // 저장 시점에 프롬프트가 바뀌어도 흔들리지 않도록, 성공한 생성의 프롬프트를 스냅샷으로 잡는다.
  const [imagePrompt, setImagePrompt] = useState('');
  const [failure, setFailure] = useState<GenerateFailure | null>(null);
  const [apiReady, setApiReady] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  useEffect(() => { isImageApiReady().then(setApiReady); }, []);
  // 새 이미지가 뜨면 이전 저장 상태를 초기화한다.
  useEffect(() => { setSaveState({ kind: 'idle' }); }, [image]);

  const cost = IMAGE_STUDIO_CREDIT_COST;
  const enoughCredits = hasEnough(cost);
  const needsRef = mode === 'image' && refs.length === 0;
  const canGenerate = prompt.trim().length > 0 && !busy && apiReady && enoughCredits && !needsRef;

  const addRefFiles = useCallback(async (files: File[]) => {
    setRefError(null);
    if (files.length === 0) return;
    const remaining = MAX_REFS - refs.length;
    if (remaining <= 0) {
      setRefError(t('imageStudio.reference.maxCount', { count: MAX_REFS }));
      return;
    }
    const overflow = files.length > remaining;
    const accepted: RefItem[] = [];
    for (const f of files.slice(0, remaining)) {
      if (!ACCEPT_MIME.includes(f.type)) {
        setRefError(t('imageStudio.reference.badType'));
        continue;
      }
      if (f.size > MAX_REF_MB * 1024 * 1024) {
        setRefError(t('imageStudio.reference.tooLarge', { mb: MAX_REF_MB }));
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(f);
        accepted.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dataUrl });
      } catch {
        setRefError(t('imageStudio.reference.badType'));
      }
    }
    if (accepted.length) setRefs((prev) => [...prev, ...accepted]);
    if (overflow && accepted.length) setRefError(t('imageStudio.reference.maxCount', { count: MAX_REFS }));
  }, [refs.length, t]);

  const removeRef = useCallback((id: string) => {
    setRefs((prev) => prev.filter((r) => r.id !== id));
    setRefError(null);
  }, []);

  // 스타일 팝업을 열 때마다 커스텀 스타일을 다시 로드한다.
  // 사용자가 방금 Settings 에서 추가했을 수도 있으므로 캐시하지 않는다.
  const openStylePicker = useCallback(async () => {
    setIsStylePopup(true);
    if (!user) { setCustomStyles([]); return; }
    setCustomStylesLoading(true);
    try {
      setCustomStyles(await listCustomStyles(user.id));
    } catch {
      setCustomStyles([]);
    } finally {
      setCustomStylesLoading(false);
    }
  }, [user]);

  const openLibraryPicker = useCallback(async () => {
    setIsLibraryPickOpen(true);
    if (!user) return;
    // 이미 로드했으면 재사용 — 팝업을 껐다 켜도 매번 목록을 다시 가져오지 않는다.
    if (libraryAssets !== null) return;
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const rows = await listAssets(user.id);
      setLibraryAssets(rows);
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setLibraryLoading(false);
    }
  }, [user, libraryAssets]);

  const pickFromLibrary = useCallback(async (asset: Asset) => {
    if (!asset.primary_url) return;
    if (refs.length >= MAX_REFS) {
      setRefError(t('imageStudio.reference.maxCount', { count: MAX_REFS }));
      return;
    }
    setLibraryPending((prev) => new Set(prev).add(asset.id));
    setRefError(null);
    try {
      const dataUrl = await urlToDataUrl(asset.primary_url);
      setRefs((prev) => [
        ...prev,
        { id: `lib-${asset.id}-${Date.now().toString(36)}`, dataUrl },
      ]);
    } catch {
      setRefError(t('imageStudio.reference.libraryFetchFail'));
    } finally {
      setLibraryPending((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  }, [refs.length, t]);

  // 스타일 프리셋을 앞에 붙여 톤을 맞춘다. 프롬프트가 비어있을 때는 원본을 그대로 둔다.
  const composedPrompt = useCallback(() => {
    const base = prompt.trim();
    if (!style) return base;
    const guide = style.kind === 'preset' ? STYLE_PROMPT_GUIDES[style.value] : style.prompt;
    return guide ? `${guide}. ${base}` : base;
  }, [prompt, style]);

  const run = useCallback(async () => {
    if (!canGenerate) return;
    setBusy(true);
    setFailure(null);
    const snapshot = prompt;
    const res = await generateStudioImage({
      prompt: composedPrompt(),
      aspect,
      references: mode === 'image' ? refs.map((r) => r.dataUrl) : undefined,
    });
    if (res.ok && res.imageUrl) {
      setImage(res.imageUrl);
      setImagePrompt(snapshot);
      // IMAGE-08: 성공한 생성에만 차감한다.
      const styleLabel = style ? (style.kind === 'preset' ? style.value : `custom:${style.id}`) : 'none';
      await deduct(cost, `image_studio:${mode}:${aspect}:${styleLabel}`);
    } else {
      setFailure(res.failure ?? 'error');
    }
    setBusy(false);
  }, [canGenerate, composedPrompt, aspect, mode, refs, cost, style, deduct, prompt]);

  const save = useCallback(async () => {
    if (!image || saveState.kind === 'saving' || saveState.kind === 'saved') return;
    if (!user) { setSaveState({ kind: 'error', message: t('imageStudio.result.saveNoUser') }); return; }
    setSaveState({ kind: 'saving' });
    try {
      const name = autoAssetName(imagePrompt);
      const file = await dataUrlToPngFile(image, `${name.replace(/[\\/:*?"<>|]+/g, '_')}.png`);
      const res = await createAsset(
        user.id,
        // asset_type: 'image' — 로고/캐릭터/제품 분류는 사용자가 자산 보관함에서 직접 정리한다.
        // source_type 은 assetService 가 기본 'upload' 로 넣는데, 스키마상 'generated' 도 허용된다.
        // 지금 API 시그니처가 source_type 을 받지 않으므로 여기서는 upload 로 저장되지만,
        // 후속 단계에서 시그니처 확장 시 'generated' 로 명시할 것.
        { asset_type: 'image', name, description: imagePrompt },
        [{ file, role: 'primary' }],
      );
      if (res.ok && res.id) setSaveState({ kind: 'saved', assetId: res.id });
      else setSaveState({ kind: 'error', message: res.error ?? 'unknown' });
    } catch (e) {
      setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [image, imagePrompt, user, saveState.kind, t]);

  const download = useCallback(() => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = `SODAM_Image_${aspect.replace(':', 'x')}.png`;
    link.click();
  }, [image, aspect]);

  // 오류가 나도 프롬프트/형태/참고 이미지/스타일은 유지한다 (계획서 §9).
  const errorMessage = !apiReady
    ? t('imageStudio.error.noApiKey')
    : !enoughCredits
      ? t('imageStudio.error.notEnoughCredits', { cost, balance })
      : needsRef
        ? t('imageStudio.error.needReference')
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

        {/* 생성 방식 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.mode.label')}</label>
        <div className="mt-1.5 mb-5 flex gap-1 p-1 bg-zinc-100 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex-1 py-2 rounded-lg text-center text-sm font-bold transition-colors ${
              mode === 'text' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('imageStudio.mode.text')}
          </button>
          <button
            type="button"
            onClick={() => setMode('image')}
            className={`flex-1 py-2 rounded-lg text-center text-sm font-bold transition-colors ${
              mode === 'image' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('imageStudio.mode.reference')}
          </button>
        </div>

        {/* 참고 이미지 — mode === 'image' 일 때만 노출 (계획서 §5.3) */}
        {mode === 'image' && (
          <>
            <label className="text-xs font-bold text-zinc-600">
              {t('imageStudio.reference.label')}
              <span className="text-zinc-400 font-normal ml-1">({refs.length}/{MAX_REFS})</span>
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                addRefFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 mb-2 border-2 border-dashed border-zinc-200 hover:border-primary/40 rounded-2xl px-4 py-5 text-center cursor-pointer transition-colors"
            >
              <Upload size={18} className="text-zinc-400 mx-auto mb-1.5" />
              <p className="text-xs text-zinc-500">{t('imageStudio.reference.dropHere')}</p>
              <p className="text-[10px] text-zinc-400 mt-1">
                {t('imageStudio.reference.hint', { mb: MAX_REF_MB, count: MAX_REFS })}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_MIME.join(',')}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addRefFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
            {/* 자산 보관함에서 불러오기 — 드롭존 대비 secondary. 두 경로가 함께 있음을 명확히 보인다. */}
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-px bg-zinc-200" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                {t('imageStudio.reference.orDivider')}
              </span>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>
            <button
              type="button"
              onClick={openLibraryPicker}
              disabled={refs.length >= MAX_REFS}
              className="mb-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-zinc-200 hover:border-primary/40 disabled:border-zinc-100 disabled:text-zinc-300 text-zinc-700 text-xs font-bold transition-colors"
            >
              <Package size={14} />
              {t('imageStudio.reference.fromLibrary')}
            </button>
            {refs.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {refs.map((r) => (
                  <div key={r.id} className="relative aspect-square rounded-xl overflow-hidden border border-zinc-200 group">
                    <img src={r.dataUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeRef(r.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {refError && <p className="text-[11px] text-red-600 mb-2">{refError}</p>}
            <div className="mb-3" />
          </>
        )}

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

        {/* 스타일 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.style.label')}</label>
        <button
          type="button"
          onClick={openStylePicker}
          className="mt-1.5 mb-5 w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-zinc-200 hover:border-primary/40 text-left transition-colors"
        >
          <span className="text-lg leading-none">
            {style ? (style.kind === 'preset' ? (STYLE_ICONS[style.value] ?? '🎨') : (style.icon || '🎨')) : '🎨'}
          </span>
          <span className={`text-sm font-bold ${style ? 'text-zinc-900' : 'text-zinc-500'}`}>
            {style ? (style.kind === 'preset' ? style.value : style.name) : t('imageStudio.style.none')}
          </span>
          <ChevronRight size={16} className="text-zinc-400 ml-auto" />
        </button>

        {/* 이미지 형태 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.aspect.label')}</label>
        <div className="mt-1.5 mb-5 grid grid-cols-3 gap-2">
          {STUDIO_ASPECTS.map((a) => {
            const active = aspect === a;
            return (
              <button
                key={a}
                type="button"
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
            type="button"
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
            {/* 액션 3종 — 시각 우선순위: 보관함 저장(primary) > 다운로드(secondary) > 다시 생성(text)
                아이콘/색/문구를 완전히 다르게 두어 두 저장 개념(앱 내 vs 로컬 파일)을 구분한다. */}
            <div className="flex gap-3 flex-wrap justify-center items-start">
              {/* 1) 보관함 저장 — primary */}
              {saveState.kind === 'saved' ? (
                <button
                  type="button"
                  onClick={() => goTo(ProjectStep.ASSETS)}
                  className="flex flex-col items-center gap-0.5 px-5 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full font-bold text-sm transition-all active:scale-95"
                >
                  <span className="flex items-center gap-2">
                    <BookmarkCheck size={15} /> {t('imageStudio.result.saved')}
                    <span className="text-emerald-500">· {t('imageStudio.result.viewInLibrary')} →</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={save}
                  disabled={saveState.kind === 'saving'}
                  className="flex flex-col items-center gap-0.5 px-5 py-2.5 bg-primary hover:bg-[#003E99] disabled:bg-primary/60 text-white rounded-full font-bold text-sm transition-all active:scale-95"
                >
                  <span className="flex items-center gap-2">
                    {saveState.kind === 'saving' ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        {t('imageStudio.result.saving')}
                      </>
                    ) : (
                      <>
                        <Bookmark size={15} />
                        {t('imageStudio.result.saveToLibrary')}
                      </>
                    )}
                  </span>
                  <span className="text-[10px] font-normal text-white/70">{t('imageStudio.result.saveToLibraryHint')}</span>
                </button>
              )}

              {/* 2) 다운로드 — secondary (아웃라인, 완전히 다른 시각) */}
              <button
                type="button"
                onClick={download}
                className="flex flex-col items-center gap-0.5 px-5 py-2.5 bg-white border border-zinc-200 hover:border-zinc-400 text-zinc-700 rounded-full font-bold text-sm transition-all active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Download size={15} /> {t('imageStudio.result.download')}
                </span>
                <span className="text-[10px] font-normal text-zinc-400">{t('imageStudio.result.downloadHint')}</span>
              </button>

              {/* 3) 다시 생성 — text 버튼 (덜 강조) */}
              <button
                type="button"
                onClick={run}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-100 disabled:text-zinc-300 text-zinc-500 rounded-full font-bold text-sm transition-all active:scale-95 self-center"
              >
                <RefreshCw size={15} /> {t('imageStudio.result.regenerate')}
              </button>
            </div>
            {saveState.kind === 'error' && (
              <p className="text-xs text-red-600 -mt-2">
                {t('imageStudio.result.saveError', { message: saveState.message })}
              </p>
            )}
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

      {/* ================= 자산 보관함 참고 이미지 선택 팝업 ================= */}
      {isLibraryPickOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-black tracking-tight text-zinc-900">
                  {t('imageStudio.reference.libraryTitle')}
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {t('imageStudio.reference.librarySubtitle', { count: MAX_REFS })}
                  <span className="ml-2 text-zinc-400">· {refs.length}/{MAX_REFS}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLibraryPickOpen(false)}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors shrink-0"
                aria-label={t('imageStudio.reference.libraryClose')}
              >
                <X size={18} />
              </button>
            </div>

            {libraryLoading && (
              <div className="py-16 text-center text-sm text-zinc-500">
                {t('imageStudio.reference.libraryLoading')}
              </div>
            )}
            {libraryError && !libraryLoading && (
              <div className="py-16 text-center text-sm text-red-600">
                {libraryError}
              </div>
            )}
            {!libraryLoading && !libraryError && libraryAssets && libraryAssets.length === 0 && (
              <div className="py-16 text-center">
                <Package size={28} className="mx-auto text-zinc-300 mb-2" />
                <p className="text-sm text-zinc-500">{t('imageStudio.reference.libraryEmpty')}</p>
              </div>
            )}
            {!libraryLoading && libraryAssets && libraryAssets.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {libraryAssets.map((a) => {
                  const disabled = !a.primary_url || refs.length >= MAX_REFS;
                  const pending = libraryPending.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pickFromLibrary(a)}
                      disabled={disabled || pending}
                      className={`group flex flex-col items-stretch text-left rounded-xl border overflow-hidden transition-all ${
                        disabled ? 'opacity-40 cursor-not-allowed border-zinc-200' : 'border-zinc-200 hover:border-primary hover:shadow-lg'
                      }`}
                    >
                      <div className="aspect-square bg-zinc-50 relative">
                        {a.primary_url ? (
                          <img src={a.primary_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-300">
                            <ImagePlus size={24} />
                          </div>
                        )}
                        {pending && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <RefreshCw size={18} className="animate-spin text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-2">
                        <div className="text-[11px] font-bold text-zinc-900 truncate">{a.name}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{a.asset_type}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 스타일 선택 팝업 ================= */}
      {isStylePopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black tracking-tight text-zinc-900">{t('imageStudio.style.popupTitle')}</h4>
              <button type="button" onClick={() => setIsStylePopup(false)} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* 스타일 미적용(None) — 로고·라인아트 등 스타일 프리셋이 오히려 방해가 되는 경우 */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => { setStyle(null); setIsStylePopup(false); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${
                  style === null
                    ? 'border-primary bg-[#EEF3FC] shadow-[0_0_20px_rgba(0,80,191,0.2)]'
                    : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100'
                }`}
              >
                <span className="text-3xl">🎨</span>
                <div className={`text-sm font-bold ${style === null ? 'text-primary' : 'text-zinc-600'}`}>
                  {t('imageStudio.style.none')}
                </div>
              </button>
            </div>

            {/* 나만의 스타일 — 사용자가 Settings 에서 등록한 프리셋 */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {t('imageStudio.style.customGroup')}
                </div>
                <button
                  type="button"
                  onClick={() => { setIsStylePopup(false); goTo(ProjectStep.SETTINGS); }}
                  className="text-[11px] text-primary font-bold hover:underline"
                >
                  {t('imageStudio.style.manageInSettings')} →
                </button>
              </div>
              {customStylesLoading ? (
                <div className="py-6 text-center text-xs text-zinc-400">
                  {t('settings.customStyles.loading')}
                </div>
              ) : customStyles && customStyles.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {customStyles.map((s) => {
                    const selected = style?.kind === 'custom' && style.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setStyle({ kind: 'custom', id: s.id, name: s.name, icon: s.icon_emoji, prompt: s.prompt_guide });
                          setIsStylePopup(false);
                        }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${
                          selected
                            ? 'border-primary bg-[#EEF3FC] shadow-[0_0_20px_rgba(0,80,191,0.2)]'
                            : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100'
                        }`}
                      >
                        <span className="text-3xl">{s.icon_emoji || '🎨'}</span>
                        <div className={`text-sm font-bold truncate w-full ${selected ? 'text-primary' : 'text-zinc-700'}`}>
                          {s.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-xl">
                  {t('settings.customStyles.empty')}
                </div>
              )}
            </div>

            {/* 기본 스타일 — VisualStyle 10종 */}
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">
                {t('imageStudio.style.presetGroup')}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.values(VisualStyle).map((s) => {
                  const selected = style?.kind === 'preset' && style.value === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setStyle({ kind: 'preset', value: s }); setIsStylePopup(false); }}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${
                        selected
                          ? 'border-primary bg-[#EEF3FC] shadow-[0_0_20px_rgba(0,80,191,0.2)]'
                          : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100'
                      }`}
                    >
                      <span className="text-3xl">{STYLE_ICONS[s] || '🎨'}</span>
                      <div className={`text-sm font-bold ${selected ? 'text-primary' : 'text-zinc-600'}`}>{s}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
