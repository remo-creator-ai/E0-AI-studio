// =============================================================
//  자산 보관함 참고 이미지 선택 팝업 — 공용 컴포넌트
//
//  두 곳에서 재사용:
//   - ImageStudio (단건 이미지 생성) — 참고 이미지에 자산 보관함 사진 추가
//   - VisualizingStep (스토리보드 만들기) — 비주얼 레퍼런스에 자산 보관함 사진 추가
//
//  Caller 는 excludeIds/maxRemaining 으로 중복·상한을 통제한다.
//  onPick 콜백은 Asset 원본과 dataUrl(참고 이미지 API 에 그대로 전달 가능)을 함께 넘긴다.
// =============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ImagePlus, RefreshCw, Package } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { listAssets, type Asset } from '../services/assetService';

export interface AssetLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  /** 자산 클릭 시 호출. dataUrl 은 signed URL 을 fetch 해 base64 로 변환한 결과. */
  onPick: (result: { asset: Asset; dataUrl: string }) => void;
  /** 이미 refs 에 들어간 자산 id — 그리드에서 disabled 처리. */
  excludeIds?: string[];
  /** 남은 자리 (0 이면 모든 자산이 disabled). undefined 는 무제한. */
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
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
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

  const isCapped = maxRemaining !== undefined && maxRemaining <= 0;

  const handlePick = useCallback(async (asset: Asset) => {
    if (!asset.primary_url) return;
    setPickError(null);
    setPendingIds((prev) => new Set(prev).add(asset.id));
    try {
      const dataUrl = await urlToDataUrl(asset.primary_url);
      onPick({ asset, dataUrl });
    } catch {
      setPickError(t('imageStudio.reference.libraryFetchFail'));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  }, [onPick, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
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
              const disabled = excluded || isCapped || !a.primary_url;
              const pending = pendingIds.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handlePick(a)}
                  disabled={disabled || pending}
                  className={`group flex flex-col items-stretch text-left rounded-xl border overflow-hidden transition-all ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed border-zinc-200'
                      : 'border-zinc-200 hover:border-primary hover:shadow-lg'
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
  );
};
