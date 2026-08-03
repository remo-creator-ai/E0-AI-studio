// =============================================================
//  단건 동영상 제작 (사이드바 "동영상 생성" 도구)
//
//  ImageStudio 의 대칭 도구.
//   - 프롬프트 입력
//   - 시작 프레임 (선택) — 드롭 또는 자산 보관함
//   - 끝 프레임 (선택) — 드롭 또는 자산 보관함
//   - 종횡비 (16:9 · 9:16 · 1:1)
//   - 길이 (5초 · 10초)
//   - Kling 호출 → 결과 재생/다운로드
//   - 오른쪽 히스토리 스트립 (30일 · 100편 · Remix)
//
//  격리 원칙: services/videoStudioService 만 사용. 씬 재생성 경로(geminiService,
//  klingService.generateKlingVideo)는 건드리지 않는다.
// =============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Video, Download, RefreshCw, AlertCircle, X, Upload, Package,
  Clock, Trash2, History as HistoryIcon, Play, Loader2, ChevronRight, ArrowRightLeft,
} from 'lucide-react';
import { useModal } from './ui/ModalProvider';
import { useCreditStore } from '../store/creditStore';
import { useAuthStore } from '../store/authStore';
import {
  generateStudioVideo, detectAspectFromImage,
  VIDEO_ASPECTS, DEFAULT_VIDEO_ASPECT, VIDEO_DURATIONS, DEFAULT_VIDEO_DURATION,
  VIDEO_STUDIO_MODEL, videoStudioCreditCost,
  type VideoAspect, type ConcreteAspect, type VideoDuration, type GenerateVideoFailure,
} from '../services/videoStudioService';
import {
  saveVideoHistory, listVideoHistory, deleteVideoHistoryItem,
  type VideoHistoryItem,
} from '../services/videoHistoryService';
import { AssetLibraryPicker } from './AssetLibraryPicker';

const MAX_FRAME_MB = 10;
const ACCEPT_MIME = ['image/png', 'image/jpeg', 'image/webp'];

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** 종횡비 아이콘 — auto 는 "A" 텍스트, 나머지는 실제 비율의 사각형 */
const AspectIcon: React.FC<{ aspect: VideoAspect; active: boolean }> = ({ aspect, active }) => {
  if (aspect === 'auto') {
    return (
      <span
        className={`h-5 w-5 flex items-center justify-center rounded-[4px] text-[10px] font-black transition-colors ${
          active ? 'bg-white text-primary' : 'bg-zinc-200 text-zinc-600'
        }`}
      >
        A
      </span>
    );
  }
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

interface FrameSlotProps {
  label: string;
  dataUrl: string | null;
  onPick: () => void;
  onLibrary: () => void;
  onClear: () => void;
  onDropFile: (file: File) => void;
  disabled?: boolean;
}

const FrameSlot: React.FC<FrameSlotProps> = ({ label, dataUrl, onPick, onLibrary, onClear, onDropFile, disabled }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onDropFile(file);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">{label}</div>
      <div
        onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative aspect-square rounded-2xl border-2 border-dashed transition-all ${
          disabled ? 'border-zinc-200 bg-zinc-50 opacity-60 cursor-not-allowed'
          : dragOver ? 'border-primary bg-primary/5'
          : dataUrl ? 'border-zinc-300 bg-white'
          : 'border-zinc-300 bg-zinc-50 hover:border-primary/40 hover:bg-primary/5'
        }`}
      >
        {dataUrl ? (
          <>
            <img src={dataUrl} alt="" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
            <button
              onClick={onClear}
              disabled={disabled}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
              aria-label="remove"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2">
            <button
              onClick={onPick}
              disabled={disabled}
              className="text-xs font-bold text-zinc-500 hover:text-primary flex items-center gap-1"
            >
              <Upload size={14} /> 파일
            </button>
            <button
              onClick={onLibrary}
              disabled={disabled}
              className="text-xs font-bold text-zinc-500 hover:text-primary flex items-center gap-1"
            >
              <Package size={14} /> 보관함
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const VideoStudio: React.FC = () => {
  const { t } = useTranslation();
  const { alert, confirm } = useModal();
  const balance = useCreditStore((s) => s.balance);
  const deduct = useCreditStore((s) => s.deduct);
  const hasEnough = useCreditStore((s) => s.hasEnough);
  const user = useAuthStore((s) => s.user);

  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<VideoAspect>(DEFAULT_VIDEO_ASPECT);
  const [duration, setDuration] = useState<VideoDuration>(DEFAULT_VIDEO_DURATION);
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [failure, setFailure] = useState<GenerateVideoFailure | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 파일 픽커 참조 (start / end 각각)
  const startFileRef = useRef<HTMLInputElement>(null);
  const endFileRef = useRef<HTMLInputElement>(null);

  // 보관함 픽커 상태 — 'start' | 'end' | null
  const [libraryTarget, setLibraryTarget] = useState<'start' | 'end' | null>(null);

  // 히스토리
  const [history, setHistory] = useState<VideoHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const cost = videoStudioCreditCost({ durationSec: duration, hasEndFrame: !!endFrame });

  const loadHistory = useCallback(async () => {
    if (!user?.id) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const items = await listVideoHistory(user.id);
      setHistory(items);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const validateFrameFile = (file: File): string | null => {
    if (!ACCEPT_MIME.includes(file.type)) return `${file.name}: 지원하지 않는 형식 (PNG/JPEG/WebP)`;
    if (file.size > MAX_FRAME_MB * 1024 * 1024) return `${file.name}: ${MAX_FRAME_MB}MB 초과`;
    return null;
  };

  const handleFrameFile = async (which: 'start' | 'end', file: File) => {
    const err = validateFrameFile(file);
    if (err) { await alert(err, { type: 'warning' }); return; }
    const dataUrl = await readAsDataUrl(file);
    if (which === 'start') setStartFrame(dataUrl); else setEndFrame(dataUrl);
  };

  const handleLibraryPick = ({ dataUrl }: { dataUrl: string }) => {
    if (libraryTarget === 'start') setStartFrame(dataUrl);
    else if (libraryTarget === 'end') setEndFrame(dataUrl);
    setLibraryTarget(null);
  };

  const generate = async () => {
    if (!prompt.trim()) {
      await alert('프롬프트를 입력해 주세요.', { type: 'warning' });
      return;
    }
    if (!hasEnough(cost)) {
      await alert(`크레딧이 부족합니다. (필요 ${cost}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }

    // Auto: 시작 이미지 있으면 그 비율로 해석, 없으면 16:9 fallback.
    // Concrete: 시작 이미지 비율과 다르면 사용자에게 경고 후 강행 여부 확인.
    let resolvedAspect: ConcreteAspect;
    if (aspect === 'auto') {
      resolvedAspect = startFrame ? await detectAspectFromImage(startFrame) : '16:9';
    } else {
      resolvedAspect = aspect;
      if (startFrame) {
        const imgAspect = await detectAspectFromImage(startFrame);
        if (imgAspect !== aspect) {
          const ok = await confirm(
            `시작 이미지와 생성 영상 비율이 맞지 않습니다.\n\n· 시작 이미지: ${imgAspect}\n· 선택한 종횡비: ${aspect}\n\n비율 차이가 크면 이미지가 잘리거나 여백이 생길 수 있습니다.\n그대로 진행하시겠습니까?`,
          );
          if (!ok) return;
        }
      }
    }

    setBusy(true);
    setFailure(null);
    setErrorMessage(null);
    setVideoUrl(null);
    try {
      const result = await generateStudioVideo({
        prompt: prompt.trim(),
        aspect: resolvedAspect,
        durationSec: duration,
        startImage: startFrame ?? undefined,
        endImage: endFrame ?? undefined,
      });
      if (!result.ok || !result.videoUrl) {
        setFailure(result.failure ?? 'error');
        setErrorMessage(result.message ?? null);
        return;
      }
      const promptSnapshot = prompt.trim();
      setVideoUrl(result.videoUrl);
      setVideoPrompt(promptSnapshot);
      await deduct(cost, `동영상 생성 (${duration}s${endFrame ? ' · end frame' : ''})`);

      // 히스토리에 저장 (Kling 링크는 24h 만료라 반드시 Storage 로 복제).
      // aspect 는 resolved 값(concrete)으로 저장 — 나중에 히스토리에서 재열기 시 정확한 비율 복원.
      if (user?.id) {
        const saveResult = await saveVideoHistory({
          ownerId: user.id,
          prompt: promptSnapshot,
          aspect: resolvedAspect,
          durationSec: duration,
          model: VIDEO_STUDIO_MODEL,
          hasStartFrame: !!startFrame,
          hasEndFrame: !!endFrame,
          videoUrl: result.videoUrl,
        });
        if (saveResult.ok && saveResult.item) {
          setVideoUrl(saveResult.item.url);  // signed URL 로 교체
          loadHistory();
        }
      }
    } catch (e) {
      setFailure('error');
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remixFromHistory = (item: VideoHistoryItem) => {
    setPrompt(item.prompt);
    // 히스토리에는 concrete 비율만 저장됨 — 사용자가 명시적으로 auto 로 다시 바꾸도록 유지
    setAspect(item.aspect as VideoAspect);
    setDuration((item.duration_sec === 10 ? 10 : 5) as VideoDuration);
    setVideoUrl(item.url);
    setVideoPrompt(item.prompt);
    // 시작/끝 프레임은 원본 이미지를 갖고있지 않으므로 재적용 불가 — 사용자에게 안내
  };

  const deleteFromHistory = async (item: VideoHistoryItem) => {
    const ok = await confirm('이 히스토리 항목을 삭제할까요? (크레딧은 반환되지 않습니다)');
    if (!ok) return;
    const success = await deleteVideoHistoryItem(item.id, item.storage_path);
    if (success) {
      loadHistory();
      if (videoUrl === item.url) { setVideoUrl(null); setVideoPrompt(''); }
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-4 md:p-8 max-w-[1600px] mr-auto w-full">
      {/* Left: controls */}
      <div className="xl:w-[380px] flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Video className="text-primary" size={22} />
            <h1 className="text-2xl font-black text-zinc-900">동영상 생성</h1>
          </div>
          <p className="text-sm text-zinc-500">텍스트 · 이미지에서 짧은 동영상을 만듭니다.</p>
        </div>

        {/* Frame slots */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <FrameSlot
            label="시작 프레임 (선택)"
            dataUrl={startFrame}
            onPick={() => startFileRef.current?.click()}
            onLibrary={() => setLibraryTarget('start')}
            onClear={() => setStartFrame(null)}
            onDropFile={(f) => handleFrameFile('start', f)}
            disabled={busy}
          />
          <div className="flex items-center justify-center pt-6">
            <ArrowRightLeft size={16} className="text-zinc-400" />
          </div>
          <FrameSlot
            label="끝 프레임 (선택)"
            dataUrl={endFrame}
            onPick={() => endFileRef.current?.click()}
            onLibrary={() => setLibraryTarget('end')}
            onClear={() => setEndFrame(null)}
            onDropFile={(f) => handleFrameFile('end', f)}
            disabled={busy || !startFrame}
          />
        </div>
        {!startFrame && (
          <p className="text-[11px] text-zinc-400 -mt-2">
            시작 프레임을 넣으면 이미지 기반(I2V), 없으면 텍스트 기반(T2V) 으로 생성합니다.
          </p>
        )}
        <input
          ref={startFileRef}
          type="file"
          accept={ACCEPT_MIME.join(',')}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFrameFile('start', e.target.files[0])}
        />
        <input
          ref={endFileRef}
          type="file"
          accept={ACCEPT_MIME.join(',')}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFrameFile('end', e.target.files[0])}
        />

        {/* Prompt */}
        <div>
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">프롬프트</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="원하는 장면·모션·분위기를 자세히 적어주세요. 예) 소녀가 창가에서 미소짓는 슬로우 줌인"
            rows={4}
            className="mt-1.5 w-full px-3 py-2 rounded-xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none"
            disabled={busy}
          />
        </div>

        {/* Aspect */}
        <div>
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">종횡비</label>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {VIDEO_ASPECTS.map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                disabled={busy}
                className={`px-2 py-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  aspect === a
                    ? 'bg-primary text-white shadow-[0_4px_12px_rgba(0,80,191,0.25)]'
                    : 'bg-white border border-zinc-200 text-zinc-500 hover:border-primary/40'
                }`}
              >
                <AspectIcon aspect={a} active={aspect === a} />
                {a === 'auto' ? 'Auto' : a}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-zinc-400 leading-relaxed">
            {aspect === 'auto'
              ? '시작 이미지의 비율에 자동으로 맞춥니다. 시작 이미지가 없으면 16:9.'
              : '시작 이미지와 비율이 다르면 생성 전 경고합니다.'}
          </p>
        </div>

        {/* Duration */}
        <div>
          <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">길이</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {VIDEO_DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                disabled={busy}
                className={`px-3 py-2 rounded-xl font-bold text-xs transition-all ${
                  duration === d
                    ? 'bg-primary text-white shadow-[0_4px_12px_rgba(0,80,191,0.25)]'
                    : 'bg-white border border-zinc-200 text-zinc-500 hover:border-primary/40'
                }`}
              >
                {d}초
              </button>
            ))}
          </div>
        </div>

        {/* Generate */}
        <button
          onClick={generate}
          disabled={busy || !prompt.trim()}
          className="mt-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white font-black shadow-[0_8px_24px_rgba(0,80,191,0.35)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              생성 중... (1~3분)
            </>
          ) : (
            <>
              <Video size={18} />
              🔥 {cost}cr · 동영상 생성
            </>
          )}
        </button>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          {!prompt.trim() ? (
            <span className="text-amber-600 font-bold">💡 프롬프트를 입력하면 생성 버튼이 활성화됩니다.</span>
          ) : (
            <>
              모델: {VIDEO_STUDIO_MODEL} · 시작 프레임 유무에 따라 T2V/I2V 자동 선택.
              {endFrame && ' · 끝 프레임 사용 시 +5cr'}
            </>
          )}
        </p>
      </div>

      {/* Center: preview + actions */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* 빈 상태: 테두리만 · 배경 없음 (사용자 피드백 반영, 검은 큰 영역 제거)
            생성 중 · 결과 · 실패: 진한 배경으로 재생 컨텍스트 강조 */}
        {busy ? (
          <div className="relative w-full bg-zinc-900 rounded-3xl overflow-hidden aspect-video flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-12 h-12 text-white/60 mx-auto animate-spin" />
              <p className="text-white/60 text-sm font-bold">동영상 생성 중...</p>
              <p className="text-white/40 text-xs">Kling API 처리 · 최대 5분</p>
            </div>
          </div>
        ) : videoUrl ? (
          <div className="relative w-full bg-zinc-900 rounded-3xl overflow-hidden aspect-video flex items-center justify-center">
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              className="w-full h-full object-contain"
            />
          </div>
        ) : failure ? (
          <div className="relative w-full rounded-3xl overflow-hidden aspect-video flex items-center justify-center border-2 border-red-200 bg-red-50/50">
            <div className="text-center space-y-2 px-6">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="text-red-700 text-sm font-bold">
                {failure === 'blocked' ? '콘텐츠 정책에 의해 차단되었습니다.'
                  : failure === 'timeout' ? '생성이 시간 초과되었습니다.'
                  : failure === 'no_api_key' ? 'API 키가 설정되지 않았습니다. 관리자에게 문의하세요.'
                  : '생성 실패'}
              </p>
              {errorMessage && <p className="text-red-500/70 text-xs">{errorMessage}</p>}
            </div>
          </div>
        ) : (
          <div className="relative w-full rounded-3xl aspect-video flex items-center justify-center border-2 border-dashed border-zinc-200 bg-transparent">
            <div className="text-center space-y-2">
              <Video className="w-12 h-12 text-zinc-300 mx-auto" />
              <p className="text-zinc-400 text-sm">프롬프트를 입력하고 생성 버튼을 눌러주세요</p>
            </div>
          </div>
        )}

        {videoUrl && (
          <div className="flex flex-wrap gap-2">
            <a
              href={videoUrl}
              download={`sodam-video-${Date.now()}.mp4`}
              className="px-4 py-2.5 rounded-2xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 flex items-center gap-2"
            >
              <Download size={16} /> 다운로드
            </a>
            <button
              onClick={() => { setPrompt(videoPrompt); }}
              className="px-4 py-2.5 rounded-2xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 flex items-center gap-2"
            >
              <RefreshCw size={16} /> 프롬프트 복원
            </button>
          </div>
        )}
      </div>

      {/* Right: history */}
      <div className="xl:w-[240px] flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <HistoryIcon size={16} className="text-zinc-400" />
          <h3 className="text-sm font-black text-zinc-700">히스토리</h3>
          <span className="text-[10px] text-zinc-400 ml-auto">최대 100편 · 30일</span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-1 gap-2 max-h-[70vh] overflow-y-auto">
          {historyLoading && !history && (
            <div className="col-span-full text-center py-6 text-xs text-zinc-400">불러오는 중...</div>
          )}
          {history && history.length === 0 && (
            <div className="col-span-full text-center py-6 text-xs text-zinc-400">
              아직 생성한 동영상이 없어요.
            </div>
          )}
          {history?.map((item) => (
            <div key={item.id} className="group relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-900 aspect-video">
              <video
                src={item.url}
                muted
                playsInline
                onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                <button
                  onClick={() => remixFromHistory(item)}
                  className="px-2 py-1 rounded-md bg-white text-zinc-900 text-[10px] font-bold flex items-center gap-1"
                >
                  <Play size={10} /> 다시 열기
                </button>
                <button
                  onClick={() => deleteFromHistory(item)}
                  className="px-2 py-1 rounded-md bg-red-600 text-white text-[10px] font-bold flex items-center gap-1"
                >
                  <Trash2 size={10} /> 삭제
                </button>
              </div>
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                <span className="text-[9px] text-white/80 bg-black/60 px-1.5 py-0.5 rounded">
                  {item.duration_sec}s
                </span>
                <span className="text-[9px] text-white/80 bg-black/60 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Clock size={8} />
                  {new Date(item.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Library picker */}
      {libraryTarget && (
        <AssetLibraryPicker
          open={true}
          onClose={() => setLibraryTarget(null)}
          onPick={handleLibraryPick}
          maxRemaining={1}
          title={libraryTarget === 'start' ? '시작 프레임 선택' : '끝 프레임 선택'}
          subtitle="보관함에서 이미지 하나를 선택해 주세요."
        />
      )}
    </div>
  );
};

export default VideoStudio;
