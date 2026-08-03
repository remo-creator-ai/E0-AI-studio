// =============================================================
//  모드 A · 스토리보드 통합 영상 (Phase 3)
//
//  스토리보드 이미지 1장(project.grid_images[0])을 Kling I2V 시작 프레임으로 사용하고,
//  씬별 image_prompt_en + video_motion_en 을 시간 세그먼트로 조립한 시퀀스 프롬프트를
//  1회 호출로 넘겨 통합 영상 1편을 만든다.
//
//  Kling 상한 10s. 프로젝트 duration 이 그 이상이면 압축 안내.
//  씬 1(좌측 상단) 이 반드시 영상 시작 프레임이 되는 Kling I2V 특성 안내.
//
//  Phase 4 에서 재생성 프리셋(시간대명시/시간없이흐름/핵심씬축약/시네마틱리터치) +
//  씬별 편집기 UI 추가 예정. 이번 커밋은 기본 프리셋(시간대 명시) 만 노출.
// =============================================================

import React, { useMemo, useState } from 'react';
import { ArrowLeft, Sparkles, Play, Download, RefreshCw, AlertCircle, Loader2, Info, Wand2 } from 'lucide-react';
import { useStore } from '../../store';
import { useCreditStore } from '../../store/creditStore';
import { useAuthStore } from '../../store/authStore';
import { useModal } from '../ui/ModalProvider';
import { generateStudioVideo, videoStudioCreditCost } from '../../services/videoStudioService';
import { saveVideoHistory } from '../../services/videoHistoryService';
import type { Scene } from '../../types';

function getGridLayout(sceneCount: number, aspectRatio?: string) {
  const isPortrait = aspectRatio === '9:16';
  switch (sceneCount) {
    case 4: return { rows: 2, cols: 2 };
    case 8: return isPortrait ? { rows: 2, cols: 2 } : { rows: 2, cols: 4 };
    case 18: return { rows: 3, cols: 3 };
    case 9:
    default: return { rows: 3, cols: 3 };
  }
}

/** 시간 세그먼트를 균등 분배해서 씬별 프롬프트 조립. Kling 최대 duration=10s 기준. */
function buildSequencePrompt(opts: {
  scenes: Scene[];
  durationSec: number;
  rows: number;
  cols: number;
  language: 'ko' | 'en';
  style: string;
}): string {
  const { scenes, durationSec, rows, cols, language, style } = opts;
  const n = Math.min(scenes.length, rows * cols);
  const usedScenes = scenes.slice(0, n);
  const segLen = durationSec / n;

  const langHint = language === 'ko'
    ? 'IMPORTANT: All spoken dialogue, on-screen text (if any), and character speech must be KOREAN. Use quotation marks for dialogue.\n'
    : '';

  const header =
    `Create one complete ${durationSec}-second animated short based on the provided ${rows}x${cols} storyboard.\n` +
    langHint +
    `The storyboard is only a visual sequence reference. Do not show the ${rows}x${cols} grid, panel borders, split screens, or collage layout in the final video.\n` +
    `Create a full-screen cinematic animation with smooth, fast transitions between the story moments.\n` +
    `Visual style: ${style}.\n`;

  const segments = usedScenes.map((s, i) => {
    const start = (i * segLen).toFixed(1).replace(/\.0$/, '');
    const end = ((i + 1) * segLen).toFixed(1).replace(/\.0$/, '');
    const motion = s.video_motion_en?.trim() || '';
    const prompt = s.image_prompt_en?.trim() || '';
    const body = motion ? `${prompt}. Motion: ${motion}` : prompt;
    return `${start}-${end}s: ${body}`;
  }).join('\n');

  const anchor = `\nMaintain identical characters, outfits, and product appearance across all moments — treat the storyboard panels as canonical identity references.`;

  return `${header}\n${segments}${anchor}`;
}

interface ModeAProps {
  onBack: () => void;
}

export const ProductionModeA: React.FC<ModeAProps> = ({ onBack }) => {
  const project = useStore((s) => s.project);
  const balance = useCreditStore((s) => s.balance);
  const deduct = useCreditStore((s) => s.deduct);
  const hasEnough = useCreditStore((s) => s.hasEnough);
  const user = useAuthStore((s) => s.user);
  const { alert, confirm } = useModal();

  const [duration, setDuration] = useState<5 | 10>(10);
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);

  const gridLayout = useMemo(
    () => getGridLayout(project?.scene_count || 9, project?.aspect_ratio),
    [project?.scene_count, project?.aspect_ratio],
  );

  const gridImage = project?.grid_images?.[0] ?? null;
  const aspect = (project?.aspect_ratio ?? '16:9') as '16:9' | '9:16' | '1:1';
  const language = (project?.generation_language ?? 'ko') as 'ko' | 'en';

  const autoPrompt = useMemo(() => {
    if (!project) return '';
    return buildSequencePrompt({
      scenes: project.scenes,
      durationSec: duration,
      rows: gridLayout.rows,
      cols: gridLayout.cols,
      language,
      style: project.style,
    });
  }, [project, duration, gridLayout, language]);

  const prompt = manualPrompt ?? autoPrompt;
  const cost = videoStudioCreditCost({ durationSec: duration });
  const projectDuration = project?.duration ?? 0;
  const overCap = projectDuration > 10;

  if (!project || !gridImage) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 mx-auto flex items-center justify-center">
          <AlertCircle className="text-zinc-400" size={28} />
        </div>
        <h3 className="text-lg font-black text-zinc-900">스토리보드가 아직 없어요</h3>
        <p className="text-sm text-zinc-500">
          먼저 2·3단계에서 스토리보드를 완성해 주세요.
        </p>
        <button
          onClick={onBack}
          className="mt-2 px-5 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} /> 모드 선택으로
        </button>
      </div>
    );
  }

  const generate = async () => {
    if (!hasEnough(cost)) {
      await alert(`크레딧이 부족합니다. (필요 ${cost}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }
    const ok = await confirm(
      `통합 영상을 만듭니다.\n\n• 길이 ${duration}초 · ${aspect}\n• 크레딧 ${cost}cr 차감\n• 시간 1~3분 소요\n\n계속할까요?`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    setVideoUrl(null);
    try {
      const result = await generateStudioVideo({
        prompt,
        aspect,
        durationSec: duration,
        startImage: gridImage,
      });
      if (!result.ok || !result.videoUrl) {
        setError(result.message ?? '생성 실패');
        return;
      }
      setVideoUrl(result.videoUrl);
      await deduct(cost, `통합 영상 (${duration}s)`);

      if (user?.id) {
        const saved = await saveVideoHistory({
          ownerId: user.id,
          prompt: `[통합영상] ${project.title}`,
          aspect,
          durationSec: duration,
          model: 'kling-v1',
          hasStartFrame: true,
          hasEndFrame: false,
          videoUrl: result.videoUrl,
        });
        if (saved.ok && saved.item) setVideoUrl(saved.item.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Left: storyboard preview */}
        <div className="space-y-3">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
            원본 스토리보드
          </div>
          <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-50 aspect-video">
            <img src={gridImage} alt="storyboard" className="w-full h-full object-contain" />
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <Info size={14} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-900 leading-relaxed">
              <strong>첫 씬(좌측 상단)이 영상의 시작 프레임</strong>이 됩니다.
              씬 1은 정적 오프닝으로 구성돼 있는 것이 이상적입니다.
            </div>
          </div>
        </div>

        {/* Right: config */}
        <div className="space-y-5">
          {/* Duration */}
          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              총 길이
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 max-w-xs">
              {[5, 10].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d as 5 | 10)}
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
            {overCap && (
              <div className="mt-2 p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-start gap-2">
                <AlertCircle size={14} className="text-orange-700 shrink-0 mt-0.5" />
                <div className="text-[11px] text-orange-900 leading-relaxed">
                  이 프로젝트는 <strong>{projectDuration}초</strong>로 기획됐지만
                  Kling 은 최대 <strong>10초</strong>까지만 지원합니다.
                  씬 밀도가 높아질 수 있으니 하단 프롬프트를 확인·조정해 주세요.
                  <br />
                  <span className="opacity-80">
                    (10초 단위 분할 제작은 다음 업데이트 예정)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sequence prompt */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                시퀀스 프롬프트 (자동 생성 · 편집 가능)
              </label>
              {manualPrompt !== null && (
                <button
                  onClick={() => setManualPrompt(null)}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={11} /> 기본값 복원
                </button>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setManualPrompt(e.target.value)}
              rows={10}
              disabled={busy}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-xs font-mono resize-none leading-relaxed"
            />
            <div className="mt-1 text-[10px] text-zinc-400 flex items-center gap-1">
              <Wand2 size={10} /> Phase 4 에서 재생성 프리셋(시간대명시 / 시간없이흐름 / 핵심씬축약 / 시네마틱) 추가 예정
            </div>
          </div>

          {/* Cost + generate */}
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-black text-zinc-900">
                🔥 {cost}cr · {duration}초 영상 1개
              </div>
              <div className="text-xs text-zinc-500">잔액 {balance}cr</div>
            </div>
            <p className="text-[11px] text-emerald-700 font-bold">
              💡 개별 방식({project.scenes.length}씬 × 10cr) 대비 최대 {Math.round((1 - cost / (project.scenes.length * 10)) * 100)}% 절감
            </p>
            <button
              onClick={generate}
              disabled={busy || !prompt.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white font-black shadow-[0_8px_24px_rgba(0,80,191,0.35)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" size={18} /> 통합 영상 생성 중... (최대 5분)
                </>
              ) : (
                <>
                  <Sparkles size={18} /> 통합 영상 생성
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Result */}
      {(videoUrl || error) && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-zinc-700 uppercase tracking-widest">결과 영상</h3>
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
              <div className="text-sm text-red-900">
                <div className="font-bold mb-1">생성 실패</div>
                <div className="text-xs">{error}</div>
              </div>
            </div>
          )}
          {videoUrl && (
            <>
              <div className="rounded-2xl overflow-hidden bg-black aspect-video">
                <video src={videoUrl} controls autoPlay loop className="w-full h-full" />
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={videoUrl}
                  download={`sodam-integrated-${Date.now()}.mp4`}
                  className="px-4 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 flex items-center gap-2"
                >
                  <Download size={16} /> 다운로드
                </a>
                <button
                  onClick={generate}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={16} /> 재생성 ({cost}cr)
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductionModeA;
