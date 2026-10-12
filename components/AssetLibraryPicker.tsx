// =============================================================
//  자산 보관함 참고 이미지 선택 팝업 — 공용 컴포넌트
//
//  두 곳에서 재사용:
//   - ImageStudio (단건 이미지 생성 · 멀티샷) — 참고 이미지에 자산 보관함 사진 추가
//   - VisualizingStep (스토리보드 만들기) — 비주얼 레퍼런스에 자산 보관함 사진 추가
//
//  흐름:
//   - 카드 클릭으로 선택 토글 (파란 테두리 = 선택됨). 즉시 추가되지 않는다.
//     이 방식은 더블클릭 실수로 인한 중복 추가를 원천 차단한다.
//   - 하단 [확인 N장 추가] 버튼을 눌러야 실제 fetch·onPick 이 실행된다.
//   - 다중 선택 지원. maxRemaining 만큼만 켤 수 있다.
//
//  Caller 는 excludeIds/maxRemaining 으로 중복·상한을 통제한다.
//  onPick 콜백은 Asset 원본과 dataUrl(참고 이미지 API 에 그대로 전달 가능)을
//  선택된 자산 수만큼 반복 호출한다.
//
//  ⚠️ 이미지 전용 픽커다 (mediaFilter 기본값 'image').
//     현재 호출부는 모두 "참고 이미지 / 프레임 이미지" 용도라서 동영상 자산
//     (asset_type='video', 037 마이그레이션 이후 보관함에 존재)은 목록에서
//     제외한다. 동영상을 노출하면 <img> 로 그려져 깨진 썸네일이 되고,
//     선택 시 mp4 가 base64 dataUrl 로 변환돼 이미지 생성 API 에 그대로
//     전달되는 QA 이슈가 발생한다.
// =============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ImagePlus, RefreshCw, Package, Check, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { listAssets, type Asset } from '../services/assetService';

export interface AssetLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  /** 선택 확정 시 선택한 자산 수만큼 반복 호출된다. */
  onPick: (result: { asset: Asset; dataUrl: string }) => void;
  /** 이미 refs 에 들어간 자산 id — 그리드에서 disabled 처리. */
  excludeIds?: string[];
  /** 남은 자리 (0 이면 새 선택 불가). undefined 는 무제한. */
  maxRemaining?: number;
  /** 팝업 제목/부제 (i18n 키 대신 이미 번역된 문자열을 받는다). */
  title: string;
  subtitle?: string;
  /**
   * 노출할 자산 종류. 기본 'image' — 동영상 자산은 목록에서 제외한다.
   * 동영상을 참고로 쓰는 화면이 생기면 'all' 로 열되, 그때는 카드 렌더러도
   * <video> 로 분기해야 한다.
   */
  mediaFilter?: 'image' | 'all';
}

/**
 * 동영상 자산 판별.
 * asset_type 이 1차 근거(보관함 저장 경로가 항상 'video' 로 넣는다)이고,
 * signed URL 확장자는 과거 데이터·수기 입력 대비 보조 방어선이다.
 */
const isVideoAsset = (a: Asset): boolean => {
  if (a.asset_type === 'video') return true;
  const path = a.primary_url?.split('?')[0] ?? '';
  return /\.(mp4|webm|mov|m4v)$/i.test(path);
};

/** signed URL → base64 dataUrl. Gemini inlineData 로 그대로 넘길 수 있다. */
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

export const AssetLibraryPicker: React.FC<AssetLibraryPickerProps> = ({
  open, onClose, onPick, excludeIds, maxRemaining, title, subtitle, mediaFilter = 'image',
}) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    // 팝업 닫힘 시 선택 초기화. 다시 열 때 이전 선택이 남아있지 않도록.
    if (!open) {
      setSelectedIds(new Set());
      setPickError(null);
      return;
    }
    if (!user) { setAssets([]); return; }
    // 팝업이 열릴 때마다 새로 로드해 사용자가 방금 추가한 자산이 즉시 보이도록 한다.
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await listAssets(user.id);
        if (!cancelled) setAssets(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  // 이미지 전용 모드에서는 동영상 자산을 목록에서 제외한다.
  // 숨긴 개수는 하단 안내로 알려준다 — "보관함에 저장한 동영상이 왜 안 보이지?" 혼란 방지.
  const visibleAssets = useMemo(() => {
    if (!assets) return null;
    return mediaFilter === 'all' ? assets : assets.filter((a) => !isVideoAsset(a));
  }, [assets, mediaFilter]);
  const hiddenVideoCount = (assets?.length ?? 0) - (visibleAssets?.length ?? 0);

  const remaining = maxRemaining === undefined ? Infinity : maxRemaining;
  const isCapped = remaining <= 0;

  const toggleSelect = useCallback((asset: Asset) => {
    if (!asset.primary_url) return;
    // 방어선: 이미지 전용 모드에서 동영상은 절대 선택되지 않는다.
    if (mediaFilter !== 'all' && isVideoAsset(asset)) return;
    setPickError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        // 상한 도달 시 새 선택 무시 (알림 없이 조용히 차단 — UI 에서 disabled 로 이미 표시)
        if (next.size >= remaining) return prev;
        next.add(asset.id);
      }
      return next;
    });
  }, [remaining, mediaFilter]);

  const handleConfirm = useCallback(async () => {
    if (selectedIds.size === 0 || !visibleAssets || confirming) return;
    setConfirming(true);
    setPickError(null);
    try {
      // visibleAssets 순서를 유지해 사용자가 클릭한 대략적 순서를 반영. (Set 순서는 삽입 순)
      // visibleAssets 기준이라 이미지 전용 모드에서 동영상은 여기까지 오지 않는다.
      const selectedAssets = visibleAssets.filter((a) => selectedIds.has(a.id));
      const results = await Promise.all(selectedAssets.map(async (asset) => {
        try {
          if (!asset.primary_url) return { asset, dataUrl: null as string | null };
          const dataUrl = await urlToDataUrl(asset.primary_url);
          return { asset, dataUrl };
        } catch {
          return { asset, dataUrl: null as string | null };
        }
      }));
      let anyErr = false;
      for (const r of results) {
        if (r.dataUrl) onPick({ asset: r.asset, dataUrl: r.dataUrl });
        else anyErr = true;
      }
      if (anyErr) {
        setPickError(t('imageStudio.reference.libraryFetchFail'));
      } else {
        onClose();
      }
    } finally {
      setConfirming(false);
    }
  }, [selectedIds, visibleAssets, confirming, onPick, onClose, t]);

  if (!open) return null;

  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-3 shrink-0">
          <div className="min-w-0">
            <h4 className="text-lg font-black tracking-tight text-zinc-900 truncate">{title}</h4>
            {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors shrink-0"
            aria-label={t('imageStudio.reference.libraryClose')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 pb-3 space-y-3">
          {loading && (
            <div className="py-16 text-center text-sm text-zinc-500">
              {t('imageStudio.reference.libraryLoading')}
            </div>
          )}
          {error && !loading && (
            <div className="py-16 text-center text-sm text-red-600">{error}</div>
          )}
          {pickError && (
            <div className="text-xs text-red-600">{pickError}</div>
          )}
          {!loading && !error && visibleAssets && visibleAssets.length === 0 && (
            <div className="py-16 text-center">
              <Package size={28} className="mx-auto text-zinc-300 mb-2" />
              <p className="text-sm text-zinc-500">
                {hiddenVideoCount > 0
                  ? t('imageStudio.reference.libraryOnlyVideos')
                  : t('imageStudio.reference.libraryEmpty')}
              </p>
            </div>
          )}

          {!loading && !error && visibleAssets && visibleAssets.length > 0 && hiddenVideoCount > 0 && (
            <div className="flex items-start gap-1.5 text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-2">
              <Info size={13} className="shrink-0 mt-px" />
              <span>{t('imageStudio.reference.libraryVideoHidden', { count: hiddenVideoCount })}</span>
            </div>
          )}

          {!loading && visibleAssets && visibleAssets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visibleAssets.map((a) => {
                const excluded = excludeIds?.includes(a.id);
                const selected = selectedIds.has(a.id);
                const capReached = !selected && selectedCount >= remaining;
                const disabled = excluded || isCapped || !a.primary_url || (capReached && !selected);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleSelect(a)}
                    disabled={disabled}
                    aria-pressed={selected}
                    className={`group relative flex flex-col items-stretch text-left rounded-xl border-2 overflow-hidden transition-all ${
                      selected
                        ? 'border-primary shadow-[0_0_0_2px_rgba(0,117,104,0.15)]'
                        : disabled
                          ? 'opacity-40 cursor-not-allowed border-zinc-200'
                          : 'border-zinc-200 hover:border-primary/40 hover:shadow-lg'
                    }`}
                  >
                    <div className="aspect-square bg-zinc-100 relative">
                      {a.primary_url ? (
                        <img src={a.primary_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <ImagePlus size={24} />
                        </div>
                      )}
                      {selected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow">
                          <Check size={14} />
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

        {/* Footer — confirm / cancel */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-zinc-100 shrink-0">
          <div className="text-xs text-zinc-500">
            {selectedCount > 0
              ? t('imageStudio.reference.librarySelectedCount', { count: selectedCount })
              : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="px-4 py-2 rounded-full text-zinc-600 hover:bg-zinc-100 text-sm font-bold transition-colors disabled:opacity-50"
            >
              {t('imageStudio.reference.libraryCancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCount === 0 || confirming}
              className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary hover:bg-[#005D53] disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-sm font-bold transition-colors"
            >
              {confirming ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  {t('imageStudio.reference.libraryAdding')}
                </>
              ) : (
                <>
                  <Check size={14} />
                  {selectedCount > 0
                    ? t('imageStudio.reference.libraryConfirm', { count: selectedCount })
                    : t('imageStudio.reference.libraryConfirmEmpty')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
