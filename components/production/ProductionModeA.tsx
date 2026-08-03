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

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Sparkles, Play, Download, RefreshCw, AlertCircle, Loader2, Info, Wand2,
  Clock, Waves, Scissors, Film as FilmIcon, ChevronDown, X as XIcon, Check,
} from 'lucide-react';
import { useStore } from '../../store';
import { useCreditStore } from '../../store/creditStore';
import { useAuthStore } from '../../store/authStore';
import { useModal } from '../ui/ModalProvider';
import { generateStudioVideo, videoStudioCreditCost } from '../../services/videoStudioService';
import { saveVideoHistory } from '../../services/videoHistoryService';
import type { Scene } from '../../types';

export type SequencePreset = 'timed' | 'flow' | 'compressed' | 'cinematic';

const PRESET_INFO: Record<SequencePreset, { label: string; hint: string; icon: React.FC<{ size?: number }> }> = {
  timed:      { label: '시간대 명시 (기본)',       hint: '각 씬을 정확한 초 구간에 매핑',                icon: Clock },
  flow:       { label: '시간 없이 스토리 흐름',    hint: 'AI 가 자연스럽게 밀도 조절',                    icon: Waves },
  compressed: { label: '핵심 씬만 축약',           hint: '균등 간격 4~5씬만 사용해 10초 안에 밀도 완화', icon: Scissors },
  cinematic:  { label: '시네마틱 리터치',           hint: '트랜지션·조명·무드 지시문 강화',               icon: FilmIcon },
};

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

/** 균등 간격으로 씬 인덱스를 선택 (compressed 프리셋용) — 시작·끝은 반드시 포함. */
function pickEvenlySpaced(total: number, pick: number): number[] {
  if (pick >= total) return Array.from({ length: total }, (_, i) => i);
  if (pick <= 1) return [0];
  const idxs: number[] = [];
  for (let i = 0; i < pick; i++) {
    idxs.push(Math.round((i * (total - 1)) / (pick - 1)));
  }
  return Array.from(new Set(idxs));
}

/** 시퀀스 프롬프트 조립. preset 과 활성 씬 인덱스 배열에 따라 분기. */
function buildSequencePrompt(opts: {
  scenes: Scene[];
  activeIdxs: number[];         // 사용할 씬 인덱스 (오름차순)
  durationSec: number;
  rows: number;
  cols: number;
  language: 'ko' | 'en';
  style: string;
  preset: SequencePreset;
}): string {
  const { scenes, activeIdxs, durationSec, rows, cols, language, style, preset } = opts;
  const used = activeIdxs.map((i) => scenes[i]).filter(Boolean);
  const n = used.length;

  const langHint = language === 'ko'
    ? 'IMPORTANT: All spoken dialogue, on-screen text (if any), and character speech must be KOREAN. Use quotation marks for dialogue.\n'
    : '';

  const header =
    `Create one complete ${durationSec}-second animated short based on the provided ${rows}x${cols} storyboard.\n` +
    langHint +
    `The storyboard is only a visual sequence reference. Do not show the ${rows}x${cols} grid, panel borders, split screens, or collage layout in the final video.\n` +
    `Create a full-screen cinematic animation with smooth, fast transitions between the story moments.\n` +
    `Visual style: ${style}.\n`;

  const cinematicExtra = preset === 'cinematic'
    ? '\nCinematic direction: Use smooth match cuts, subtle motion blur, warm cinematic color grading, ' +
      'and gentle camera movements (dolly-in, pan, tilt) to enhance emotional flow. ' +
      'Prioritize visual continuity and atmospheric depth between transitions.\n'
    : '';

  const anchor =
    `\nMaintain identical characters, outfits, and product appearance across all moments — treat the storyboard panels as canonical identity references.`;

  let body: string;

  if (preset === 'flow' || preset === 'cinematic') {
    // 시간 없이 씬 흐름만 나열. cinematic 은 헤더에 지시문이 추가됐다.
    const lines = used.map((s, i) => {
      const motion = s.video_motion_en?.trim() || '';
      const prompt = s.image_prompt_en?.trim() || '';
      const combined = motion ? `${prompt}. Motion: ${motion}` : prompt;
      return `${i + 1}. ${combined}`;
    }).join('\n');
    body = `Scene flow (natural pacing, no strict timing — AI distributes across the ${durationSec}s):\n${lines}`;
  } else {
    // timed / compressed — 균등 시간 분배
    const segLen = durationSec / Math.max(n, 1);
    const lines = used.map((s, i) => {
      const start = (i * segLen).toFixed(1).replace(/\.0$/, '');
      const end = ((i + 1) * segLen).toFixed(1).replace(/\.0$/, '');
      const motion = s.video_motion_en?.trim() || '';
      const prompt = s.image_prompt_en?.trim() || '';
      const combined = motion ? `${prompt}. Motion: ${motion}` : prompt;
      return `${start}-${end}s: ${combined}`;
    }).join('\n');
    body = lines;
  }

  return `${header}${cinematicExtra}\n${body}${anchor}`;
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
  const [preset, setPreset] = useState<SequencePreset>('timed');
  const [presetOpen, setPresetOpen] = useState(false);
  // 활성 씬 인덱스 (사용자가 체크박스로 조정). 최초에는 프로젝트 씬 전체.
  const [activeIdxs, setActiveIdxs] = useState<number[]>(
    () => (project?.scenes ?? []).map((_, i) => i),
  );

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
      activeIdxs,
      durationSec: duration,
      rows: gridLayout.rows,
      cols: gridLayout.cols,
      language,
      style: project.style,
      preset,
    });
  }, [project, activeIdxs, duration, gridLayout, language, preset]);

  // preset / activeIdxs / duration 변경 시 수동 편집을 초기화 (사용자가 명시적으로 편집한 게 아니면 새 자동값 표시)
  useEffect(() => { setManualPrompt(null); }, [preset, activeIdxs, duration]);

  const applyPreset = (p: SequencePreset) => {
    setPreset(p);
    setPresetOpen(false);
    if (!project) return;
    // compressed 는 씬 자동 축약 (10s 안에 밀도 완화)
    if (p === 'compressed') {
      const total = project.scenes.length;
      const target = Math.min(5, Math.max(3, Math.floor(duration / 2)));
      setActiveIdxs(pickEvenlySpaced(total, target));
    } else {
      // 나머지는 전체 씬 사용
      setActiveIdxs(project.scenes.map((_, i) => i));
    }
  };

  const toggleScene = (idx: number) => {
    setActiveIdxs((cur) => {
      if (cur.includes(idx)) return cur.filter((i) => i !== idx);
      return [...cur, idx].sort((a, b) => a - b);
    });
  };

  const resetActive = () => {
    if (!project) return;
    setActiveIdxs(project.scenes.map((_, i) => i));
  };

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

          {/* Preset selector */}
          <div>
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              프롬프트 방식
            </label>
            <div className="mt-1.5 relative">
              <button
                onClick={() => setPresetOpen((v) => !v)}
                disabled={busy}
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-left flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2 font-bold text-zinc-800">
                  {React.createElement(PRESET_INFO[preset].icon, { size: 14 })}
                  {PRESET_INFO[preset].label}
                </span>
                <ChevronDown size={16} className={`text-zinc-400 transition-transform ${presetOpen ? 'rotate-180' : ''}`} />
              </button>
              {presetOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
                  {(Object.keys(PRESET_INFO) as SequencePreset[]).map((k) => {
                    const info = PRESET_INFO[k];
                    return (
                      <button
                        key={k}
                        onClick={() => applyPreset(k)}
                        className={`w-full text-left px-3 py-2.5 hover:bg-primary/5 flex items-start gap-2 border-b border-zinc-100 last:border-b-0 ${
                          k === preset ? 'bg-primary/5' : ''
                        }`}
                      >
                        {React.createElement(info.icon, { size: 14 })}
                        <div className="flex-1">
                          <div className="text-xs font-bold text-zinc-800">{info.label}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">{info.hint}</div>
                        </div>
                        {k === preset && <Check size={12} className="text-primary mt-1" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-1 text-[10px] text-zinc-400 leading-relaxed">
              {preset === 'compressed' && '핵심 씬만 자동 선택돼 밀도가 낮아집니다. 아래 씬 목록에서 세밀 조정 가능.'}
              {preset === 'flow' && '시간 세그먼트 없이 씬 흐름만 전달 — AI 가 밀도를 배분합니다.'}
              {preset === 'cinematic' && '전문 영상 느낌의 트랜지션·조명·무드 지시문이 프롬프트 상단에 추가됩니다.'}
              {preset === 'timed' && '각 씬을 정확한 초 구간에 매핑 — 씬 수가 많으면 씬당 시간이 짧아집니다.'}
            </p>
          </div>

          {/* Scene selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                포함할 씬 ({activeIdxs.length}/{project.scenes.length})
              </label>
              <button
                onClick={resetActive}
                disabled={busy || activeIdxs.length === project.scenes.length}
                className="text-[11px] font-bold text-primary hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
              >
                <RefreshCw size={11} /> 전체 선택
              </button>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-9 gap-1.5">
              {project.scenes.map((s, i) => {
                const active = activeIdxs.includes(i);
                return (
                  <button
                    key={s.id ?? i}
                    onClick={() => toggleScene(i)}
                    disabled={busy}
                    title={s.image_prompt_en?.slice(0, 80) ?? `씬 ${i + 1}`}
                    className={`aspect-square rounded-lg text-xs font-black border-2 transition-all relative ${
                      active
                        ? 'border-primary bg-primary text-white shadow-[0_2px_8px_rgba(0,80,191,0.25)]'
                        : 'border-zinc-200 bg-white text-zinc-400 hover:border-primary/40'
                    }`}
                  >
                    {i + 1}
                    {!active && (
                      <XIcon size={10} className="absolute top-0.5 right-0.5 text-zinc-400" />
                    )}
                  </button>
                );
              })}
            </div>
            {activeIdxs.length === 0 && (
              <p className="mt-1.5 text-[11px] text-red-600 font-bold">최소 1개 씬은 선택해야 합니다.</p>
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
              <Wand2 size={10} /> 프리셋을 바꾸거나 씬을 토글하면 자동 재생성 · 수동 편집도 가능
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
              disabled={busy || !prompt.trim() || activeIdxs.length === 0}
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
