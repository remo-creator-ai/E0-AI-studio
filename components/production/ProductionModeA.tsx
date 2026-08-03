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
import { generateStudioVideo, videoStudioCreditCost, KLING_PROMPT_MAX, VIDEO_STUDIO_MODEL } from '../../services/videoStudioService';
import { saveVideoHistory } from '../../services/videoHistoryService';
import { composeScenesToGrid, pickGridLayout } from '../../services/storyboardCompose';
import type { Scene } from '../../types';

export type SequencePreset = 'timed' | 'flow' | 'compressed' | 'cinematic';

const PRESET_INFO: Record<SequencePreset, { label: string; hint: string; icon: React.FC<{ size?: number }> }> = {
  timed:      { label: '시간대 명시 (기본)',       hint: '각 씬을 정확한 초 구간에 매핑',                icon: Clock },
  flow:       { label: '시간 없이 스토리 흐름',    hint: 'AI 가 자연스럽게 밀도 조절',                    icon: Waves },
  compressed: { label: '핵심 씬만 축약',           hint: '균등 간격 4~5씬만 사용해 10초 안에 밀도 완화', icon: Scissors },
  cinematic:  { label: '시네마틱 리터치',           hint: '트랜지션·조명·무드 지시문 강화',               icon: FilmIcon },
};

// 참고용: 원래 프로젝트 기본 그리드 (project.grid_images 은 이 배치로 미리 생성됨).
// 실제 모드 A 에서는 선택된 씬 수에 맞춰 pickGridLayout 으로 재산정한다.
function _getOriginalGridLayout(sceneCount: number, aspectRatio?: string) {
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

/** 문자열을 max 이하로 잘라내되 가능하면 문장(마침표) 경계에서 자른다. */
function truncateSmart(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  // 문장 경계(., !, ?) 우선 → 마지막에 콤마 → 공백 → 강제
  const boundaries = [
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  ];
  const best = Math.max(...boundaries);
  if (best > max * 0.6) return cut.slice(0, best + 1).trim();
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.6) return cut.slice(0, lastSpace).trim() + '...';
  return cut.trim() + '...';
}

/** 시퀀스 프롬프트 조립. Kling 2500 자 상한(안전 2400) 을 강제로 지킨다.
 *
 *  전략:
 *  1. 헤더는 짧게 (샘플 스타일 참고). "Visual style" · 후행 anchor 제거 —
 *     스토리보드 이미지 자체가 스타일·정체성 앵커 역할.
 *  2. 씬 설명은 video_motion_en 우선 사용 (짧고 액션 중심). 없으면 image_prompt_en.
 *  3. 남은 예산을 씬 개수로 균등 분배 → 씬당 상한 계산 → 초과분은 truncateSmart.
 *  4. 씬 수가 많을수록(9-18) 씬당 예산이 자동으로 작아짐.
 */
function buildSequencePrompt(opts: {
  scenes: Scene[];
  activeIdxs: number[];
  durationSec: number;
  rows: number;
  cols: number;
  language: 'ko' | 'en';
  style: string;
  preset: SequencePreset;
}): string {
  const { scenes, activeIdxs, durationSec, rows, cols, language, preset } = opts;
  const used = activeIdxs.map((i) => scenes[i]).filter(Boolean);
  const n = used.length;
  if (n === 0) return '';

  // 안전 마진(2400) 안에서만 조립. Kling 실측 상한은 2500 자.
  const HARD_CAP = 2400;

  // ── 헤더 (샘플 스타일 참고, 간결) ──
  const langLine = language === 'ko'
    ? 'IMPORTANT: KOREAN — all dialogue and on-screen text must be in Korean.\n'
    : '';
  const cinematicLine = preset === 'cinematic'
    ? 'Direction: smooth match cuts, warm cinematic grading, gentle camera moves (dolly-in, pan, tilt).\n'
    : '';
  const header =
    `Create one complete ${durationSec}-second animated short based on the provided ${rows}x${cols} storyboard.\n` +
    langLine +
    `The storyboard is only a visual sequence reference. Do not show the ${rows}x${cols} grid, panel borders, split screens, or collage layout in the final video.\n` +
    `Create a full-screen cinematic animation with smooth, fast transitions between the story moments.\n` +
    cinematicLine;

  // ── 각 씬 라벨(0-2s: 또는 "1.") 오버헤드 예상 ──
  const isTimed = !(preset === 'flow' || preset === 'cinematic');
  const flowIntro = isTimed ? '' : `Scene flow (natural pacing across ${durationSec}s):\n`;
  const perLineLabel = isTimed ? 8 : 4; // "10-15s: " 정도 or "10. "
  const separatorPad = n; // 각 라인 뒤 \n

  const overhead = header.length + flowIntro.length + n * perLineLabel + separatorPad + 20;
  // 씬당 실제 사용 가능한 문자 수 (최소 80자 보장)
  const perSceneBudget = Math.max(80, Math.floor((HARD_CAP - overhead) / Math.max(n, 1)));

  const buildSegment = (s: Scene): string => {
    // 우선 video_motion_en (짧고 액션 중심) → 없으면 image_prompt_en 요약
    const motion = (s.video_motion_en ?? '').trim();
    const scene = (s.image_prompt_en ?? '').trim();

    if (motion && motion.length <= perSceneBudget) {
      // 예산에 여유가 있으면 짧은 씬 컨텍스트 앞에 붙이기
      const roomLeft = perSceneBudget - motion.length - 2;
      if (scene && roomLeft > 40) {
        return `${truncateSmart(scene, roomLeft)} ${motion}`.trim();
      }
      return motion;
    }
    // motion 이 너무 길거나 없으면: 짧게 요약
    if (motion) return truncateSmart(motion, perSceneBudget);
    return truncateSmart(scene, perSceneBudget);
  };

  const lines = used.map((s, i) => {
    const seg = buildSegment(s);
    if (isTimed) {
      const segLen = durationSec / n;
      const start = (i * segLen).toFixed(1).replace(/\.0$/, '');
      const end = ((i + 1) * segLen).toFixed(1).replace(/\.0$/, '');
      return `${start}-${end}s: ${seg}`;
    }
    return `${i + 1}. ${seg}`;
  }).join('\n');

  const combined = `${header}\n${flowIntro}${lines}`;
  // 예상치 못한 초과 시(예: 헤더가 길어졌을 때) 최종 안전 절단
  if (combined.length > HARD_CAP) return truncateSmart(combined, HARD_CAP);
  return combined;
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

  const aspect = (project?.aspect_ratio ?? '16:9') as '16:9' | '9:16' | '1:1';
  const language = (project?.generation_language ?? 'ko') as 'ko' | 'en';

  // 선택된 씬 수에 맞춰 그리드 레이아웃 산정 (프로젝트 원본과 무관)
  const gridLayout = useMemo(
    () => pickGridLayout(activeIdxs.length || 1, aspect),
    [activeIdxs.length, aspect],
  );

  // 스토리보드 다듬기(3단계) 에서 편집된 씬 이미지들을 합성해 새로운 그리드를 만든다.
  // - source: project.scenes[i].image_url (Assembly 에서 수정됐다면 최신 값)
  // - fallback: 이미지가 없는 씬은 스킵되지 않고 에러 (사용자에게 어느 씬이 빠졌는지 알림)
  const [composedImage, setComposedImage] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  // 이 상태를 만든 시점의 activeIdxs 를 기록 → 활성 씬이 바뀌면 재합성 유도
  const [composedFor, setComposedFor] = useState<string>('');

  const currentSelectionKey = useMemo(
    () => `${aspect}|${activeIdxs.join(',')}`,
    [aspect, activeIdxs],
  );
  const composeStale = composedImage != null && composedFor !== currentSelectionKey;

  const compose = async () => {
    if (!project) return;
    const urls = activeIdxs
      .map((i) => project.scenes[i]?.image_url)
      .filter((u): u is string => !!u);
    if (urls.length === 0) {
      setComposeError('선택된 씬 중 이미지가 없어 합성할 수 없습니다. 먼저 스토리보드를 만들어 주세요.');
      setComposedImage(null);
      return;
    }
    if (urls.length !== activeIdxs.length) {
      setComposeError(
        `이미지가 없는 씬이 있습니다. ${urls.length}/${activeIdxs.length}개만 사용됩니다. 스토리보드 다듬기에서 누락 씬을 채워 주세요.`,
      );
    } else {
      setComposeError(null);
    }
    setComposing(true);
    try {
      const result = await composeScenesToGrid({
        imageUrls: urls,
        aspect,
      });
      setComposedImage(result.dataUrl);
      setComposedFor(currentSelectionKey);
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : String(e));
    } finally {
      setComposing(false);
    }
  };

  // 진입 시 · 활성 씬이 바뀔 때 한 번 자동 합성 (사용자가 별도 버튼 안 눌러도 대체로 최신)
  useEffect(() => {
    if (!project) return;
    compose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSelectionKey]);

  const gridImage = composedImage;

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

  // 씬 자체가 하나도 없거나 이미지 하나도 없으면 진행 불가.
  const hasAnySceneImage = (project?.scenes ?? []).some((s) => !!s.image_url);
  if (!project || !hasAnySceneImage) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 mx-auto flex items-center justify-center">
          <AlertCircle className="text-zinc-400" size={28} />
        </div>
        <h3 className="text-lg font-black text-zinc-900">스토리보드가 아직 없어요</h3>
        <p className="text-sm text-zinc-500">
          먼저 2·3단계에서 씬 이미지를 완성해 주세요.
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
    if (!gridImage) {
      await alert('먼저 스토리보드 합치기를 완료해 주세요. "다시 합치기" 버튼을 눌러 재시도할 수 있습니다.', { type: 'warning' });
      return;
    }
    if (composeStale) {
      const ok = await confirm('활성 씬이 바뀐 뒤 아직 합치기를 갱신하지 않았습니다. 그대로 진행할까요?');
      if (!ok) return;
    }
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
          model: VIDEO_STUDIO_MODEL,
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
        {/* Left: 재조합된 스토리보드 (스토리보드 다듬기의 최신 씬 이미지 기반) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
              스토리보드 (선택 씬 {activeIdxs.length}개 · {gridLayout.rows}×{gridLayout.cols})
            </div>
            <button
              onClick={compose}
              disabled={composing || !project}
              className="text-[11px] font-bold text-primary hover:underline disabled:opacity-40 flex items-center gap-1"
            >
              {composing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              다시 합치기
            </button>
          </div>
          <div className="rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-100 aspect-video flex items-center justify-center">
            {composing ? (
              <div className="text-center space-y-2">
                <Loader2 className="w-8 h-8 text-zinc-400 mx-auto animate-spin" />
                <p className="text-xs text-zinc-500">씬 이미지 합치는 중...</p>
              </div>
            ) : gridImage ? (
              <img src={gridImage} alt="composed storyboard" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center space-y-2 px-6">
                <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="text-xs text-zinc-500">합치기 대기 중</p>
              </div>
            )}
          </div>
          {composeStale && (
            <p className="text-[11px] text-amber-700 font-bold">
              ⚠️ 활성 씬이 변경되었습니다. "다시 합치기" 를 눌러 갱신하세요.
            </p>
          )}
          {composeError && (
            <p className="text-[11px] text-orange-700 leading-relaxed">{composeError}</p>
          )}
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <Info size={14} className="text-amber-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-900 leading-relaxed">
              <strong>첫 씬(좌측 상단)이 영상의 시작 프레임</strong>이 됩니다.
              씬 1은 정적 오프닝으로 구성돼 있는 것이 이상적입니다.
              <br />
              <span className="opacity-80">
                이 미리보기는 <strong>3. 스토리보드 다듬기</strong>의 최신 씬 이미지들을
                합쳐 만든 것입니다.
              </span>
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
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Wand2 size={10} /> 프리셋을 바꾸거나 씬을 토글하면 자동 재생성 · 수동 편집도 가능
              </div>
              <div className={`text-[10px] font-mono ${
                prompt.length > KLING_PROMPT_MAX ? 'text-red-600 font-black'
                : prompt.length > KLING_PROMPT_MAX * 0.9 ? 'text-amber-600 font-bold'
                : 'text-zinc-400'
              }`}>
                {prompt.length.toLocaleString()} / {KLING_PROMPT_MAX.toLocaleString()}자
              </div>
            </div>
            {prompt.length > KLING_PROMPT_MAX && (
              <div className="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 space-y-2">
                <p className="text-[11px] text-red-800 leading-relaxed">
                  ⚠️ Kling API 상한 <strong>{KLING_PROMPT_MAX}자</strong> 초과 ({prompt.length.toLocaleString()}자).
                  그대로 생성하면 문장 경계에서 자동으로 잘려 전송돼 씬 후반부가 반영되지 않을 수 있습니다.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => applyPreset('compressed')}
                    disabled={preset === 'compressed'}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-black flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Scissors size={11} />
                    {preset === 'compressed' ? '이미 축약 모드' : '핵심 씬만 자동 축약'}
                  </button>
                  <button
                    onClick={() => applyPreset('flow')}
                    disabled={preset === 'flow'}
                    className="px-3 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-100 text-red-700 text-[11px] font-black flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Waves size={11} />
                    시간 없이 흐름만
                  </button>
                  <span className="text-[10px] text-red-500">← 클릭하면 즉시 프롬프트 재구성</span>
                </div>
              </div>
            )}
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
