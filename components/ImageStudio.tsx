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
  Clock, Trash2, History as HistoryIcon, User, ShoppingBag, Type, Grid3x3,
} from 'lucide-react';
import { useModal } from './ui/ModalProvider';
import { useCreditStore } from '../store/creditStore';
import { useAuthStore } from '../store/authStore';
import { useStore } from '../store';
import { ProjectStep, VisualStyle } from '../types';
import { STYLE_PROMPT_GUIDES } from '../constants';
import {
  generateStudioImage, isImageApiReady,
  STUDIO_ASPECTS, DEFAULT_ASPECT,
  IMAGE_STUDIO_MODELS, DEFAULT_IMAGE_STUDIO_MODEL, imageStudioCreditCost,
  MULTISHOT_PACKS, DEFAULT_MULTISHOT_PACK, IMAGE_STUDIO_MULTISHOT_SHOTS,
  type StudioAspect, type GenerateFailure, type MultishotPack,
} from '../services/imageStudioService';
import { createAsset, type Asset, type AssetType, ASSET_TYPES } from '../services/assetService';
import { AssetLibraryPicker } from './AssetLibraryPicker';
import { listCustomStyles, type CustomStyle } from '../services/customStyleService';
import {
  saveHistory, markHistorySaved, listHistory, deleteHistoryItem,
  type HistoryItem,
} from '../services/imageHistoryService';

/** 스타일 선택 상태: 프리셋(VisualStyle enum) 또는 사용자 커스텀(id + 즉시 사용할 프롬프트 스냅샷).
 *  커스텀은 스냅샷을 잡아두어 사용자가 설정에서 지운 뒤에도 이 생성 세션 안에서는 계속 유효하다. */
type SelectedStyle =
  | { kind: 'preset'; value: VisualStyle }
  | { kind: 'custom'; id: string; name: string; icon: string; prompt: string };

type Mode = 'text' | 'image' | 'multishot';

/** 멀티샷 개별 샷의 상태.
 *  status: idle(대기) / busy(생성중) / done(성공) / error(실패)
 *  imageUrl 은 성공 시만, historyId 는 히스토리 적재 성공 시만 존재. */
export interface MultishotShotState {
  presetId: string;
  labelKey: string;
  promptPrefix: string;
  status: 'idle' | 'busy' | 'done' | 'error';
  imageUrl?: string;
  historyId?: string;
  saveState: SaveState;
  errorMessage?: string;
}

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
  // 자산 보관함 상세 '이 자산으로 이미지 생성' 이 세팅한 프리로드 힌트.
  const pendingRef = useStore((s) => s.pendingImageStudioRef);
  const clearPendingRef = useStore((s) => s.setPendingImageStudioRef);

  const [mode, setMode] = useState<Mode>('text');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<StudioAspect>(DEFAULT_ASPECT);
  // 기본값은 가장 저렴한 모델 (imageStudioService 가 단가로 계산해 노출한다).
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_STUDIO_MODEL);
  // 스타일 기본값은 "선택 없음". Cinematic 을 강제하면 로고·라인아트 등의 결과가 왜곡된다.
  const [style, setStyle] = useState<SelectedStyle | null>(null);
  const [isStylePopup, setIsStylePopup] = useState(false);
  // 사용자 커스텀 스타일 목록 (Settings 에서 편집). 팝업 열 때 최신 상태로 로드한다.
  const [customStyles, setCustomStyles] = useState<CustomStyle[] | null>(null);
  const [customStylesLoading, setCustomStylesLoading] = useState(false);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [refError, setRefError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 자산 보관함에서 참고 이미지 불러오기 팝업 (공용 AssetLibraryPicker 사용)
  const [isLibraryPickOpen, setIsLibraryPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  // 저장 시점에 프롬프트가 바뀌어도 흔들리지 않도록, 성공한 생성의 프롬프트를 스냅샷으로 잡는다.
  const [imagePrompt, setImagePrompt] = useState('');
  // 히스토리에 기록된 현재 이미지의 id — '보관함 저장' 후 saved_asset_id 를 채워줄 근거.
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [failure, setFailure] = useState<GenerateFailure | null>(null);
  const [apiReady, setApiReady] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  // 보관함 저장 다이얼로그 — 사용자가 캐릭터/제품/로고/이미지 중 분류를 고르고 이름을 확인한다.
  // source 는 어느 결과를 저장할지 스냅샷 (단일 모드는 현재 이미지, 멀티샷은 해당 셀).
  const [saveDraft, setSaveDraft] = useState<{
    name: string;
    type: AssetType;
    source: { image: string; prompt: string; historyId: string | null };
    // 멀티샷 셀 저장 시 이 인덱스를 채우면 saved 상태를 해당 셀에도 반영한다.
    shotIdx?: number;
  } | null>(null);

  // 멀티샷 상태
  const [multishotPackId, setMultishotPackId] = useState<MultishotPack['id']>(DEFAULT_MULTISHOT_PACK);
  const [multishotShots, setMultishotShots] = useState<MultishotShotState[]>([]);
  // 출력 형식: 개별 6장(false) / 1개 시트(true). 시트는 API 1회 호출, 1cr.
  // 기본값을 1시트(true)로 — 저렴하고 빠름. 사용자가 개별 6장을 원할 때만 토글.
  const [multishotAsSheet, setMultishotAsSheet] = useState(true);
  // 히스토리 상태 — 마운트 시 서버에서 로드, 이후 saveHistory 성공 시 로컬로 prepend.
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const { confirm: modalConfirm } = useModal();

  // model 이 바뀌면 그 모델에 필요한 키(OpenAI 또는 Gemini)로 다시 검사.
  // 실패해도 true 폴백 — 실 판정은 generateStudioImage 가 503 을 리턴하는 것으로.
  // (예전엔 첫 health 실패 시 apiReady 가 영구 false 로 고정되어 관리자에서 키를
  //  나중에 저장해도 화면 재마운트 없인 복구 불가했음)
  useEffect(() => { isImageApiReady(model).then(setApiReady).catch(() => setApiReady(true)); }, [model]);
  // 새 이미지가 뜨면 이전 저장 상태를 초기화한다.
  useEffect(() => { setSaveState({ kind: 'idle' }); }, [image]);

  // 로그인 상태에서 마운트/사용자 변경 시 히스토리를 로드한다.
  // 커스텀 스타일도 함께 로드해 두면 히스토리 Remix 시 style_kind='custom' 을 즉시 해석할 수 있다.
  useEffect(() => {
    if (!user) { setHistory([]); return; }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    (async () => {
      try {
        const [h, cs] = await Promise.all([listHistory(user.id), listCustomStyles(user.id)]);
        if (cancelled) return;
        setHistory(h);
        setCustomStyles(cs);
      } catch (e) {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // 자산 보관함의 '이 자산으로 이미지 생성' 이 세팅한 힌트를 소비한다.
  // primaryUrl(signed) → base64 dataUrl 변환 후 refs 에 추가하고 이미지 모드로 전환.
  // 성공/실패 무관하게 힌트를 즉시 초기화해 재실행 방지.
  useEffect(() => {
    if (!pendingRef) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(pendingRef.primaryUrl);
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        if (cancelled) return;
        setMode('image');
        setRefs((prev) => (
          prev.length >= MAX_REFS
            ? prev
            : [...prev, { id: `pending-${pendingRef.assetId}-${Date.now().toString(36)}`, dataUrl }]
        ));
      } catch {
        // 조용히 무시 — 사용자가 다시 자산 보관함에서 시도할 수 있다.
      } finally {
        if (!cancelled) clearPendingRef(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pendingRef, clearPendingRef]);

  // 단가는 모델별로 다르다 (장당 원가 차이가 커서 단일 단가면 비싼 모델이 적자).
  // 단일: 모델 단가 1장 / 멀티샷 개별: 모델 단가 × 6샷 (성공한 샷만 차감, 잔액 검사는 최대치)
  // 멀티샷 시트: 모델 단가 1장 (API 1회, 2x3 그리드 한 장)
  const unitCost = imageStudioCreditCost(model);
  const cost = mode === 'multishot'
    ? (multishotAsSheet ? unitCost : unitCost * IMAGE_STUDIO_MULTISHOT_SHOTS)
    : unitCost;
  const enoughCredits = hasEnough(cost);
  // 이미지 모드: 참고 이미지 필수. 멀티샷: 참고 이미지 필수, 프롬프트는 선택.
  const needsRef = (mode === 'image' || mode === 'multishot') && refs.length === 0;
  // 텍스트/이미지 모드는 프롬프트 필수. 멀티샷은 프롬프트 선택(참고 이미지가 있으므로).
  const promptOk = mode === 'multishot' ? true : prompt.trim().length > 0;
  // apiReady 는 게이팅에서 제외 · 낙관적으로 시도 · 실 서버 503 응답으로만 판정.
  const canGenerate = promptOk && !busy && enoughCredits && !needsRef;

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

  // 히스토리 클릭 → 결과 캔버스에 이미지 로드 + 폼 되채움 (Remix 준비 상태).
  // 실제 다시 생성은 사용자가 '다시 생성' 을 눌러야 크레딧이 차감된다.
  const pickHistoryItem = useCallback((item: HistoryItem) => {
    setImage(item.url);
    setImagePrompt(item.prompt);
    setPrompt(item.prompt);
    setAspect(item.aspect as StudioAspect);
    // 스타일 복원: preset 은 그대로, custom 은 로컬 customStyles 에서 조회. 없으면 스타일 미적용.
    if (!item.style_kind || !item.style_value) {
      setStyle(null);
    } else if (item.style_kind === 'preset') {
      setStyle({ kind: 'preset', value: item.style_value as VisualStyle });
    } else {
      const cs = customStyles?.find((s) => s.id === item.style_value);
      setStyle(cs
        ? { kind: 'custom', id: cs.id, name: cs.name, icon: cs.icon_emoji, prompt: cs.prompt_guide }
        : null);
    }
    setCurrentHistoryId(item.id);
    setSaveState(item.saved_asset_id ? { kind: 'saved', assetId: item.saved_asset_id } : { kind: 'idle' });
    // 이미지 참고 모드는 참고 이미지가 세션마다 달라져서 자동 복원하지 않는다. 텍스트 모드로 고정.
    setMode('text');
    setIsHistoryDrawerOpen(false);
  }, [customStyles]);

  const removeHistoryItem = useCallback(async (item: HistoryItem) => {
    const ok = await modalConfirm(t('imageStudio.history.deleteConfirm'), { type: 'warning' });
    if (!ok) return;
    const success = await deleteHistoryItem(item.id, item.storage_path);
    if (!success) return;
    setHistory((prev) => prev.filter((h) => h.id !== item.id));
    // 현재 캔버스에 뜬 이미지가 삭제 대상이라면 결과창을 비운다.
    if (currentHistoryId === item.id) {
      setImage(null);
      setCurrentHistoryId(null);
      setSaveState({ kind: 'idle' });
    }
  }, [modalConfirm, t, currentHistoryId]);

  // AssetLibraryPicker onPick 콜백: 팝업이 이미 fetch·dataUrl 변환까지 마쳐서 넘겨준다.
  // 중복 방지는 팝업에 excludeIds 로 전달, 상한 초과는 maxRemaining 으로 전달한다.
  const handleAssetPicked = useCallback((result: { asset: Asset; dataUrl: string }) => {
    setRefError(null);
    setRefs((prev) => [
      ...prev,
      { id: `lib-${result.asset.id}-${Date.now().toString(36)}`, dataUrl: result.dataUrl },
    ]);
  }, []);

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
      model,
    });
    if (res.ok && res.imageUrl) {
      setImage(res.imageUrl);
      setImagePrompt(snapshot);
      // IMAGE-08: 성공한 생성에만 차감한다.
      const styleLabel = style ? (style.kind === 'preset' ? style.value : `custom:${style.id}`) : 'none';
      await deduct(cost, `image_studio:${mode}:${aspect}:${styleLabel}`);

      // 히스토리 적재 — 로그인 사용자에 한해. 실패해도 이미지 결과는 유지한다.
      setCurrentHistoryId(null);
      if (user) {
        const styleKind = style ? style.kind : null;
        const styleValue = style ? (style.kind === 'preset' ? style.value : style.id) : null;
        const hres = await saveHistory({
          ownerId: user.id,
          prompt: snapshot,
          aspect,
          styleKind,
          styleValue,
          model,
          dataUrl: res.imageUrl,
        });
        if (hres.ok && hres.item) {
          setCurrentHistoryId(hres.item.id);
          // 로컬 목록에 prepend 하고, 상한 200 을 넘으면 UI 측도 잘라준다.
          setHistory((prev) => [hres.item!, ...prev].slice(0, 200));
        }
      }
    } else {
      setFailure(res.failure ?? 'error');
    }
    setBusy(false);
  }, [canGenerate, composedPrompt, aspect, mode, refs, cost, style, deduct, prompt, user]);

  // ---------- 멀티샷 ----------
  // 개별 6장 모드에서 샷 하나만 실행하는 헬퍼. Promise.allSettled 안에서 최신 state 를
  // 안전하게 참조하기 어려워 preset 을 직접 인자로 받아 클로저를 최소화한다. UI 재시도(retryOneShot)에서도 재사용.
  const runOneShotDirect = useCallback(async (idx: number, snapshot: string, shotPreset: MultishotPack['shots'][number]) => {
    const guide = style ? (style.kind === 'preset' ? STYLE_PROMPT_GUIDES[style.value] : style.prompt) : '';
    const composed = [guide, shotPreset.promptPrefix, snapshot.trim()].filter(Boolean).join('. ');
    const res = await generateStudioImage({
      prompt: composed,
      aspect,
      references: refs.length > 0 ? refs.map((r) => r.dataUrl) : undefined,
      model,
    });
    if (res.ok && res.imageUrl) {
      const imageUrl = res.imageUrl;
      await deduct(unitCost, `image_studio:multishot:${aspect}:${shotPreset.id}`);
      let historyId: string | undefined;
      if (user) {
        const hres = await saveHistory({
          ownerId: user.id,
          prompt: snapshot,
          aspect,
          styleKind: 'preset',
          styleValue: `multishot:${shotPreset.id}`,
          model,
          dataUrl: imageUrl,
        });
        if (hres.ok && hres.item) {
          historyId = hres.item.id;
          setHistory((prev) => [hres.item!, ...prev].slice(0, 200));
        }
      }
      setMultishotShots((prev) => prev.map((s, i) => i === idx
        ? { ...s, status: 'done', imageUrl, historyId, saveState: { kind: 'idle' } }
        : s));
    } else {
      setMultishotShots((prev) => prev.map((s, i) => i === idx
        ? { ...s, status: 'error', errorMessage: res.message ?? res.failure ?? 'error' }
        : s));
    }
  }, [style, aspect, refs, deduct, user]);

  const runMultishot = useCallback(async () => {
    if (!canGenerate) return;
    setBusy(true);
    setFailure(null);
    const snapshot = prompt;
    const pack = MULTISHOT_PACKS.find((p) => p.id === multishotPackId) ?? MULTISHOT_PACKS[0];
    setImagePrompt(snapshot);

    // ---- 1개 시트 모드: API 1회로 2x3 그리드 이미지 생성 → 단일 결과 UI 재사용 ----
    if (multishotAsSheet) {
      // 기존 개별 결과가 남아 있으면 정리 (모드 전환 흔적 제거)
      setMultishotShots([]);
      const guide = style ? (style.kind === 'preset' ? STYLE_PROMPT_GUIDES[style.value] : style.prompt) : '';
      const panelLines = pack.shots.map((sh, i) => `Panel ${i + 1}: ${sh.promptPrefix}`).join('\n');
      // 프롬프트가 비어있을 수 있으므로(멀티샷은 텍스트 선택) subject 문구를 안전하게 대체.
      const subject = snapshot.trim() || 'the subject in the attached reference image';
      const composedSheet =
        `Create a 2x3 grid sheet with exactly 6 distinct panels showing the same subject.\n` +
        `Subject: ${subject}\n` +
        (guide ? `Style: ${guide}\n` : '') +
        `\nPanel descriptions:\n${panelLines}\n\n` +
        `CRITICAL RULES:\n` +
        `- Exactly 6 panels arranged as 2 rows by 3 columns\n` +
        `- Each panel is a distinct scene/angle as described\n` +
        `- Maintain consistent subject appearance and style across all panels\n` +
        `- Thin white borders between panels\n` +
        `- Absolutely no text, no captions, no watermarks, no brand marks, no letters`;

      const res = await generateStudioImage({
        prompt: composedSheet,
        aspect,
        references: refs.length > 0 ? refs.map((r) => r.dataUrl) : undefined,
        model,
      });

      if (res.ok && res.imageUrl) {
        setImage(res.imageUrl);
        await deduct(unitCost, `image_studio:multishot-sheet:${aspect}:${pack.id}`);
        // 히스토리 적재 — style_value 를 'multishot-sheet:{packId}' 로 남겨 Remix 시 추적 가능.
        setCurrentHistoryId(null);
        if (user) {
          const hres = await saveHistory({
            ownerId: user.id,
            prompt: snapshot,
            aspect,
            styleKind: 'preset',
            styleValue: `multishot-sheet:${pack.id}`,
            model,
            dataUrl: res.imageUrl,
          });
          if (hres.ok && hres.item) {
            setCurrentHistoryId(hres.item.id);
            setHistory((prev) => [hres.item!, ...prev].slice(0, 200));
          }
        }
      } else {
        setFailure(res.failure ?? 'error');
      }
      setBusy(false);
      return;
    }

    // ---- 개별 6장 모드 (기존) ----
    const initial: MultishotShotState[] = pack.shots.map((sh) => ({
      presetId: sh.id,
      labelKey: sh.labelKey,
      promptPrefix: sh.promptPrefix,
      status: 'busy',
      saveState: { kind: 'idle' },
    }));
    setMultishotShots(initial);
    // 병렬 실행. 개별 샷 상태는 setMultishotShots 로 각자 업데이트 → 그리드 UI 가 실시간 반영.
    await Promise.allSettled(initial.map((_, i) => runOneShotDirect(i, snapshot, pack.shots[i])));
    setBusy(false);
  }, [canGenerate, prompt, multishotPackId, multishotAsSheet, style, aspect, refs, deduct, user, runOneShotDirect]);

  const retryOneShot = useCallback(async (idx: number) => {
    const shot = multishotShots[idx];
    if (!shot) return;
    setMultishotShots((prev) => prev.map((s, i) => i === idx ? { ...s, status: 'busy', errorMessage: undefined } : s));
    await runOneShotDirect(idx, imagePrompt, { id: shot.presetId, labelKey: shot.labelKey, promptPrefix: shot.promptPrefix });
  }, [multishotShots, imagePrompt, runOneShotDirect]);

  // 보관함 저장 버튼: 다이얼로그를 열어 사용자가 분류(캐릭터/제품/로고/이미지)와 이름을 확인하게 한다.
  // 자동 이름 후보는 프롬프트 첫 줄. 단일 이미지는 현재 결과를, 멀티샷은 클릭한 셀을 저장한다.
  const openSaveDialog = (override?: { image: string; prompt: string; historyId: string | null; shotIdx?: number }) => {
    if (!user) { setSaveState({ kind: 'error', message: t('imageStudio.result.saveNoUser') }); return; }
    const src = override ?? (image ? { image, prompt: imagePrompt, historyId: currentHistoryId, shotIdx: undefined } : null);
    if (!src) return;
    // 단일 이미지에서 이미 저장 중/완료면 새 다이얼로그를 열지 않는다.
    if (!override && (saveState.kind === 'saving' || saveState.kind === 'saved')) return;
    setSaveDraft({
      name: autoAssetName(src.prompt),
      type: 'image',
      source: { image: src.image, prompt: src.prompt, historyId: src.historyId },
      shotIdx: src.shotIdx,
    });
  };

  const commitSave = useCallback(async () => {
    if (!saveDraft || !user) return;
    const trimmedName = saveDraft.name.trim();
    if (!trimmedName) return;
    const src = saveDraft.source;
    const shotIdx = saveDraft.shotIdx;
    const setSaveStatus = (v: SaveState) => {
      if (shotIdx === undefined) {
        setSaveState(v);
      } else {
        setMultishotShots((prev) => prev.map((s, i) => i === shotIdx ? { ...s, saveState: v } : s));
      }
    };
    setSaveStatus({ kind: 'saving' });
    try {
      const file = await dataUrlToPngFile(src.image, `${trimmedName.replace(/[\\/:*?"<>|]+/g, '_')}.png`);
      const res = await createAsset(
        user.id,
        // source_type 은 assetService 가 기본 'upload' 로 넣는데, 스키마상 'generated' 도 허용된다.
        // 지금 API 시그니처가 source_type 을 받지 않으므로 여기서는 upload 로 저장되지만,
        // 후속 단계에서 시그니처 확장 시 'generated' 로 명시할 것.
        { asset_type: saveDraft.type, name: trimmedName, description: src.prompt },
        [{ file, role: 'primary' }],
      );
      if (res.ok && res.id) {
        const savedId = res.id;
        setSaveStatus({ kind: 'saved', assetId: savedId });
        setSaveDraft(null);
        // 히스토리 뱃지에 반영 — 실패해도 자산 저장 자체는 이미 성공했으니 UI 상태를 되돌리지 않는다.
        if (src.historyId) {
          const hid = src.historyId;
          void markHistorySaved(hid, savedId);
          setHistory((prev) => prev.map((h) => h.id === hid ? { ...h, saved_asset_id: savedId } : h));
        }
      } else {
        setSaveStatus({ kind: 'error', message: res.error ?? 'unknown' });
      }
    } catch (e) {
      setSaveStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [saveDraft, user]);

  const download = useCallback(() => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = `SODAM_Image_${aspect.replace(':', 'x')}.png`;
    link.click();
  }, [image, aspect]);

  // 현재 결과 이미지를 참고 이미지로 담아 멀티샷 모드로 전환.
  // 즉시 실행하지 않고 사용자가 팩·출력형식을 확인 후 [멀티샷 생성] 을 눌러 실행하게 한다.
  const expandToMultishot = useCallback(() => {
    if (!image) return;
    setRefs([{ id: `from-gen-${Date.now().toString(36)}`, dataUrl: image }]);
    setMode('multishot');
    // 이전 개별 결과 잔재 제거 (모드 전환 시 그리드가 남아있으면 혼란)
    setMultishotShots([]);
  }, [image]);

  // 오류가 나도 프롬프트/형태/참고 이미지/스타일은 유지한다 (계획서 §9).
  // 초기 apiReady 판정 실패는 경고에서 제외 · 실 시도의 failure='no_api_key' 만 반영.
  // (관리자 콘솔에 키 저장돼 있어도 캐시/세션 문제로 health false 나오면 오알람 → 이 게이팅 제거)
  const errorMessage = !enoughCredits
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

  // ---- 히스토리 스트립: xl+ 인라인, 그 미만은 서랍(drawer)에 같은 내용을 재사용 ----
  const historyStripContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-primary" />
          <h3 className="text-sm font-black text-zinc-900">{t('imageStudio.history.title')}</h3>
        </div>
        <span className="text-[10px] text-zinc-400 tabular-nums">
          {t('imageStudio.history.counter', { count: history.length })}
        </span>
      </div>
      <p className="text-[10px] text-zinc-400 leading-relaxed mb-3">
        {t('imageStudio.history.retentionNote')}
      </p>

      {!user && (
        <div className="text-xs text-zinc-500 text-center py-8">{t('imageStudio.history.signInRequired')}</div>
      )}
      {user && historyLoading && (
        <div className="text-xs text-zinc-500 text-center py-8 flex items-center justify-center gap-2">
          <RefreshCw size={12} className="animate-spin" /> {t('imageStudio.history.loading')}
        </div>
      )}
      {user && historyError && !historyLoading && (
        <div className="text-xs text-red-600 py-4">{t('imageStudio.history.loadError')}</div>
      )}
      {user && !historyLoading && !historyError && history.length === 0 && (
        <div className="text-xs text-zinc-400 text-center py-8">{t('imageStudio.history.empty')}</div>
      )}

      {user && history.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 -mr-1">
          {history.map((item) => {
            const active = currentHistoryId === item.id;
            const saved = Boolean(item.saved_asset_id);
            return (
              <li key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => pickHistoryItem(item)}
                  title={item.prompt}
                  className={`block w-full aspect-square rounded-xl overflow-hidden border transition-all ${
                    active ? 'border-primary ring-2 ring-primary/30' : 'border-zinc-200 hover:border-primary/40'
                  }`}
                >
                  <img src={item.url} alt="" className="w-full h-full object-contain bg-zinc-100" />
                </button>
                {/* 우상단 뱃지: 저장 여부 */}
                <div
                  className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center shadow ${
                    saved ? 'bg-emerald-500 text-white' : 'bg-white/90 text-zinc-400 border border-zinc-200'
                  }`}
                  title={saved ? t('imageStudio.history.savedBadge') : t('imageStudio.history.unsavedBadge')}
                >
                  {saved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
                </div>
                {/* 좌상단 삭제 (hover) */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeHistoryItem(item); }}
                  aria-label={t('imageStudio.history.delete')}
                  className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ================= 생성 설정 패널 ================= */}
      <aside className="w-full lg:w-[380px] lg:shrink-0 flex flex-col bg-white border border-zinc-200 rounded-3xl p-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <ImagePlus className="text-primary" size={22} />
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">{t('imageStudio.title')}</h1>
          </div>
          <p className="text-xs text-zinc-500">{t('imageStudio.subtitle')}</p>
        </div>

        {/* 생성 방식 — 3세그먼트: 텍스트 / 이미지 / 멀티샷 */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.mode.label')}</label>
        <div data-tour="image-studio-mode" className="mt-1.5 mb-5 flex gap-1 p-1 bg-zinc-100 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex-1 py-2 rounded-lg text-center text-xs font-bold transition-colors ${
              mode === 'text' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('imageStudio.mode.text')}
          </button>
          <button
            type="button"
            onClick={() => setMode('image')}
            className={`flex-1 py-2 rounded-lg text-center text-xs font-bold transition-colors ${
              mode === 'image' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('imageStudio.mode.reference')}
          </button>
          <button
            type="button"
            onClick={() => setMode('multishot')}
            className={`flex-1 py-2 rounded-lg text-center text-xs font-bold transition-colors ${
              mode === 'multishot' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            {t('imageStudio.mode.multishot')}
          </button>
        </div>

        {/* 멀티샷 팩 선택 — 3종 중 하나 */}
        {mode === 'multishot' && (
          <>
            <label className="text-xs font-bold text-zinc-600">{t('imageStudio.multishot.packLabel')}</label>
            <div className="mt-1.5 mb-1.5 grid grid-cols-1 gap-1.5">
              {MULTISHOT_PACKS.map((pk) => {
                const selected = multishotPackId === pk.id;
                return (
                  <button
                    key={pk.id}
                    type="button"
                    onClick={() => setMultishotPackId(pk.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      selected
                        ? 'border-primary bg-[#EEF3FC]'
                        : 'border-zinc-200 hover:border-primary/40 bg-white'
                    }`}
                  >
                    <div className={`text-sm font-black ${selected ? 'text-primary' : 'text-zinc-800'}`}>
                      {t(pk.labelKey)}
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{t(pk.descKey)}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-400 mb-3 leading-relaxed">
              {t('imageStudio.multishot.packHint')}
            </p>

            {/* 출력 형식: 1개 시트(기본·저렴·빠름) vs 개별 6장 — 순서 반전 */}
            <label className="text-xs font-bold text-zinc-600">{t('imageStudio.multishot.outputLabel')}</label>
            <div className="mt-1.5 mb-1.5 flex gap-1 p-1 bg-zinc-100 rounded-xl">
              <button
                type="button"
                onClick={() => setMultishotAsSheet(true)}
                className={`flex-1 py-2 rounded-lg text-center text-xs font-bold transition-colors ${
                  multishotAsSheet ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {t('imageStudio.multishot.outputSheet')}
              </button>
              <button
                type="button"
                onClick={() => setMultishotAsSheet(false)}
                className={`flex-1 py-2 rounded-lg text-center text-xs font-bold transition-colors ${
                  !multishotAsSheet ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {t('imageStudio.multishot.outputIndividual')}
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 mb-5 leading-relaxed">
              {multishotAsSheet
                ? t('imageStudio.multishot.outputSheetDesc')
                : t('imageStudio.multishot.outputIndividualDesc')}
            </p>
          </>
        )}

        {/* 참고 이미지 — 'image' 모드와 'multishot' 모드 모두 필수.
            멀티샷은 참고 이미지 기반으로 6개 앵글을 생성하므로 참고 이미지가 반드시 필요하다. */}
        {(mode === 'image' || mode === 'multishot') && (
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
              onClick={() => setIsLibraryPickOpen(true)}
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
                    <img src={r.dataUrl} alt="" className="w-full h-full object-contain bg-zinc-100" />
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

        {/* 생성 모델 — 기본값은 가장 저렴한 모델. 단가가 모델마다 달라 옆에 함께 보여준다. */}
        <label className="text-xs font-bold text-zinc-600">{t('imageStudio.model.label')}</label>
        <div data-tour="image-studio-model" className="relative mt-1.5 mb-5">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full appearance-none px-4 py-3 pr-10 rounded-2xl border border-zinc-200 bg-white text-sm font-bold text-zinc-900 outline-none focus:border-primary cursor-pointer"
          >
            {IMAGE_STUDIO_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.description} · {m.creditCost}cr
              </option>
            ))}
          </select>
          <ChevronRight size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400" />
        </div>

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
        <div data-tour="image-studio-generate" className="mt-auto pt-2">
          <button
            type="button"
            onClick={mode === 'multishot' ? runMultishot : run}
            disabled={!canGenerate}
            className="w-full py-4 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white rounded-full font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                {mode === 'multishot'
                  ? (multishotAsSheet
                      ? t('imageStudio.multishot.sheetGenerating')
                      : t('imageStudio.multishot.generating', {
                          done: multishotShots.filter((s) => s.status === 'done' || s.status === 'error').length,
                          total: multishotShots.length,
                        }))
                  : t('imageStudio.generate.generating')}
              </>
            ) : (
              <>
                <Sparkles size={15} />
                {mode === 'multishot' ? t('imageStudio.multishot.generateButton') : t('imageStudio.generate.button')}
                <span className="opacity-70">· {t('imageStudio.generate.cost', { count: cost })}</span>
              </>
            )}
          </button>
          {mode === 'multishot' && (
            <p className="text-[10px] text-zinc-400 mt-2 text-center">
              {multishotAsSheet
                ? t('imageStudio.multishot.sheetCostHint', { cost })
                : t('imageStudio.multishot.costHint', { cost })}
            </p>
          )}
        </div>
      </aside>

      {/* ================= 결과 작업영역 ================= */}
      <section className="flex-1 min-h-[70vh] bg-white border border-zinc-200 rounded-3xl flex items-center justify-center p-6">
        {mode === 'multishot' && multishotShots.length > 0 ? (
          <div className="w-full">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {multishotShots.map((shot, idx) => (
                <div key={shot.presetId} className="flex flex-col">
                  <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 truncate">
                    {t(shot.labelKey)}
                  </div>
                  <div className="relative bg-zinc-100 rounded-xl overflow-hidden aspect-square flex items-center justify-center">
                    {shot.status === 'busy' && (
                      <div className="flex flex-col items-center gap-2 text-zinc-400">
                        <RefreshCw size={20} className="animate-spin" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{t('imageStudio.multishot.shotBusy')}</span>
                      </div>
                    )}
                    {shot.status === 'error' && (
                      <div className="flex flex-col items-center gap-2 p-3 text-center">
                        <AlertCircle size={18} className="text-red-500" />
                        <span className="text-[10px] font-bold text-red-600 leading-tight break-words">{t('imageStudio.multishot.shotFailed')}</span>
                        <button
                          type="button"
                          onClick={() => retryOneShot(idx)}
                          className="flex items-center gap-1 mt-1 px-3 py-1 rounded-full bg-white border border-zinc-200 hover:border-primary/40 text-[10px] font-bold text-zinc-700 transition-colors"
                        >
                          <RefreshCw size={10} /> {t('imageStudio.multishot.retryShot')}
                        </button>
                      </div>
                    )}
                    {shot.status === 'done' && shot.imageUrl && (
                      <img src={shot.imageUrl} alt={t(shot.labelKey)} className="w-full h-full object-cover" />
                    )}
                    {/* hover 액션: 저장 · 다운로드 (done 상태만) */}
                    {shot.status === 'done' && shot.imageUrl && (
                      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity bg-black/60 flex items-center justify-center gap-2">
                        {shot.saveState.kind === 'saved' ? (
                          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                            <BookmarkCheck size={12} /> {t('imageStudio.result.saved')}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openSaveDialog({
                              image: shot.imageUrl!,
                              prompt: imagePrompt,
                              historyId: shot.historyId ?? null,
                              shotIdx: idx,
                            })}
                            disabled={shot.saveState.kind === 'saving'}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary hover:bg-[#003E99] disabled:bg-primary/60 text-white text-[10px] font-bold"
                            title={t('imageStudio.result.saveToLibrary')}
                          >
                            {shot.saveState.kind === 'saving'
                              ? <RefreshCw size={12} className="animate-spin" />
                              : <Bookmark size={12} />}
                          </button>
                        )}
                        <a
                          href={shot.imageUrl}
                          download={`SODAM_${shot.presetId}_${aspect.replace(':', 'x')}.png`}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-700 text-[10px] font-bold"
                          title={t('imageStudio.result.download')}
                        >
                          <Download size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : busy ? (
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
                  onClick={() => openSaveDialog()}
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

              {/* 3) 멀티샷으로 확장 — 현재 이미지를 참고 이미지로 넘겨 멀티샷 모드로 이동 */}
              <button
                type="button"
                onClick={expandToMultishot}
                className="flex flex-col items-center gap-0.5 px-5 py-2.5 bg-white border border-primary/30 hover:border-primary text-primary rounded-full font-bold text-sm transition-all active:scale-95"
              >
                <span className="flex items-center gap-2">
                  <Grid3x3 size={15} /> {t('imageStudio.result.tryMultishot')}
                </span>
                <span className="text-[10px] font-normal text-primary/70">{t('imageStudio.result.tryMultishotHint')}</span>
              </button>

              {/* 4) 다시 생성 — text 버튼 (덜 강조) */}
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

      {/* ================= 히스토리 스트립 (xl+ 인라인) ================= */}
      <aside
        aria-label={t('imageStudio.history.title')}
        className="hidden xl:flex xl:w-[240px] xl:shrink-0 bg-white border border-zinc-200 rounded-3xl p-4 max-h-[80vh]"
      >
        {historyStripContent}
      </aside>

      {/* ================= 히스토리 열기 버튼 (xl 미만) ================= */}
      <button
        type="button"
        onClick={() => setIsHistoryDrawerOpen(true)}
        aria-label={t('imageStudio.history.openDrawer')}
        className="xl:hidden fixed right-4 bottom-4 z-40 w-12 h-12 rounded-full bg-primary hover:bg-[#003E99] text-white shadow-lg flex items-center justify-center"
      >
        <HistoryIcon size={18} />
      </button>

      {/* ================= 히스토리 서랍 (xl 미만) ================= */}
      {isHistoryDrawerOpen && (
        <div
          className="xl:hidden fixed inset-0 z-[190] flex justify-end"
          onClick={() => setIsHistoryDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" />
          <aside
            role="dialog"
            aria-label={t('imageStudio.history.title')}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white w-full sm:w-[340px] h-full overflow-hidden p-4 shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col"
          >
            <button
              type="button"
              onClick={() => setIsHistoryDrawerOpen(false)}
              aria-label={t('imageStudio.history.closeDrawer')}
              className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-zinc-100 z-10"
            >
              <X size={16} />
            </button>
            <div className="flex-1 min-h-0 mt-6">
              {historyStripContent}
            </div>
          </aside>
        </div>
      )}

      {/* ================= 자산 보관함 참고 이미지 선택 팝업 (공용 컴포넌트) ================= */}
      <AssetLibraryPicker
        open={isLibraryPickOpen}
        onClose={() => setIsLibraryPickOpen(false)}
        onPick={handleAssetPicked}
        maxRemaining={MAX_REFS - refs.length}
        title={t('imageStudio.reference.libraryTitle')}
        subtitle={`${t('imageStudio.reference.librarySubtitle', { count: MAX_REFS })} · ${refs.length}/${MAX_REFS}`}
      />

      {/* ================= 보관함 저장 다이얼로그 (분류·이름 확인) ================= */}
      {saveDraft && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5 max-w-md w-full">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-black tracking-tight text-zinc-900">
                  {t('imageStudio.saveDialog.title')}
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">{t('imageStudio.saveDialog.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setSaveDraft(null)}
                disabled={saveState.kind === 'saving'}
                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                aria-label={t('imageStudio.saveDialog.cancel')}
              >
                <X size={18} />
              </button>
            </div>

            {/* 분류 선택 — 4종 grid */}
            <div>
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">
                {t('imageStudio.saveDialog.typeLabel')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {ASSET_TYPES.map((tp) => {
                  const selected = saveDraft.type === tp;
                  const Icon = tp === 'character' ? User
                    : tp === 'product' ? ShoppingBag
                    : tp === 'logo' ? Type
                    : ImagePlus;
                  return (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setSaveDraft((d) => (d ? { ...d, type: tp } : d))}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border font-bold transition-all active:scale-95 ${
                        selected
                          ? 'bg-primary border-primary text-white'
                          : 'bg-white border-zinc-200 text-zinc-600 hover:border-primary/40'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-[11px]">{t(`assets.types.${tp}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 이름 입력 */}
            <div>
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">
                {t('imageStudio.saveDialog.nameLabel')}
              </label>
              <input
                type="text"
                value={saveDraft.name}
                onChange={(e) => setSaveDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:border-primary"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSaveDraft(null)}
                disabled={saveState.kind === 'saving'}
                className="px-4 py-2 rounded-full text-zinc-500 hover:bg-zinc-100 text-sm font-bold transition-colors disabled:opacity-50"
              >
                {t('imageStudio.saveDialog.cancel')}
              </button>
              <button
                type="button"
                onClick={commitSave}
                disabled={saveState.kind === 'saving' || !saveDraft.name.trim()}
                className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-sm font-bold transition-colors"
              >
                {saveState.kind === 'saving' ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    {t('imageStudio.saveDialog.confirming')}
                  </>
                ) : (
                  <>
                    <Bookmark size={14} />
                    {t('imageStudio.saveDialog.confirm')}
                  </>
                )}
              </button>
            </div>
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
