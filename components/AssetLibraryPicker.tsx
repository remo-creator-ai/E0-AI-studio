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
// =============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ImagePlus, RefreshCw, Package, Check } from 'lucide-react';
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
}

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
  open, onClose, onPick, excludeIds, maxRemaining, title, subtitle,
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

  const remaining = maxRemaining === undefined ? Infinity : maxRemaining;
  const isCapped = remaining <= 0;

  const toggleSelect = useCallback((asset: Asset) => {
    if (!asset.primary_url) return;
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
  }, [remaining]);

  const handleConfirm = useCallback(async () => {
    if (selectedIds.size === 0 || !assets || confirming) return;
    setConfirming(true);
    setPickError(null);
    try {
      // assets 순서를 유지해 사용자가 클릭한 대략적 순서를 반영. (Set 순서는 삽입 순)
      const selectedAssets = assets.filter((a) => selectedIds.has(a.id));
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
  }, [selectedIds, assets, confirming, onPick, onClose, t]);

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
          {!loading && !error && assets && assets.length === 0 && (
            <div className="py-16 text-center">
              <Package size={28} className="mx-auto text-zinc-300 mb-2" />
              <p className="text-sm text-zinc-500">{t('imageStudio.reference.libraryEmpty')}</p>
            </div>
          )}

          {!loading && assets && assets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {assets.map((a) => {
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
                        ? 'border-primary shadow-[0_0_0_2px_rgba(0,80,191,0.15)]'
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
              className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-sm font-bold transition-colors"
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
