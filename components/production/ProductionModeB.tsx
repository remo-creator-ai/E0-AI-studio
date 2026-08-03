// =============================================================
//  모드 B · 개별 영상 정밀 제작 — 세로 타임라인 (Phase 5)
//
//  기존 ProductionStep(씬 카드 그리드) 을 대체하는 신규 구현.
//  project.scenes 를 세로로 나열하고 각 씬을 아코디언 카드로 편집·생성한다.
//
//  씬 하나 = Kling I2V 1회 호출.
//    - 시작 프레임: scene.image_url (필수)
//    - 끝 프레임:   다음 씬의 image_url 을 버튼으로 채워 넣을 수 있다 (선택, +5cr)
//    - 프롬프트:    scene.video_motion_en 기본값, 카드에서 직접 편집
//
//  결과는 store 의 updateScene 으로 scene.video_url 에 반영되고,
//  App 레벨 autosave 가 프로젝트에 영속화한다.
//  Kling 원본 링크는 24시간 만료라 모드 A 와 동일하게 videoHistory 로 재업로드한다.
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ChevronDown, CheckCircle2, Clock, Download, ImageOff,
  Loader2, Play, RefreshCw, Rocket, Sparkles, StopCircle, Wand2, XCircle,
} from 'lucide-react';
import { useStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useCreditStore } from '../../store/creditStore';
import { useModal } from '../ui/ModalProvider';
import {
  detectAspectFromImage,
  generateStudioVideo,
  videoStudioCreditCost,
  KLING_PROMPT_MAX,
  VIDEO_STUDIO_MODEL,
  type ConcreteAspect,
  type VideoDuration,
} from '../../services/videoStudioService';
import { saveVideoHistory } from '../../services/videoHistoryService';
import type { Scene } from '../../types';

type JobStatus = 'idle' | 'generating' | 'failed';

interface SceneJob {
  status: JobStatus;
  startedAt?: number;
  error?: string;
}

interface SceneSettings {
  /** 사용자가 직접 편집한 프롬프트. null 이면 씬에서 자동 조립. */
  prompt: string | null;
  duration: VideoDuration;
  /** 끝 프레임 이미지 (선택). 다음 씬 이미지를 채우는 용도. */
  endImage?: string;
}

/** Kling 은 std(720p) 만 프록시에 열려 있다. 1080p 는 VIP 요금제와 함께 오픈 예정. */
type Resolution = '720p' | '1080p';

/** 생성 소요 시간 체감용 추정 진행률 — Kling 은 실제 progress 를 주지 않는다. */
const ESTIMATED_JOB_MS = 150_000;

const DEFAULT_SETTINGS: SceneSettings = { prompt: null, duration: 5 };

function autoPrompt(scene: Scene): string {
  const motion = scene.video_motion_en?.trim() ?? '';
  if (motion) return motion;
  return scene.image_prompt_en?.trim() ?? '';
}

interface ModeBProps {
  onBack: () => void;
}

export const ProductionModeB: React.FC<ModeBProps> = ({ onBack }) => {
  const project = useStore((s) => s.project);
  const updateScene = useStore((s) => s.updateScene);
  const balance = useCreditStore((s) => s.balance);
  const deduct = useCreditStore((s) => s.deduct);
  const hasEnough = useCreditStore((s) => s.hasEnough);
  const user = useAuthStore((s) => s.user);
  const { alert, confirm } = useModal();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, SceneSettings>>({});
  const [jobs, setJobs] = useState<Record<string, SceneJob>>({});
  const [resolution, setResolution] = useState<Record<string, Resolution>>({});
  const [batchActive, setBatchActive] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const batchAbort = useRef(false);

  const scenes = useMemo(() => project?.scenes ?? [], [project?.scenes]);
  const anyRunning = useMemo(
    () => Object.values(jobs).some((j) => j.status === 'generating'),
    [jobs],
  );

  // 추정 진행률 표시를 위한 1초 타이머 — 실행 중일 때만 돈다.
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const settingsFor = useCallback(
    (sceneId: string): SceneSettings => settings[sceneId] ?? DEFAULT_SETTINGS,
    [settings],
  );

  const patchSettings = (sceneId: string, patch: Partial<SceneSettings>) => {
    setSettings((cur) => ({ ...cur, [sceneId]: { ...(cur[sceneId] ?? DEFAULT_SETTINGS), ...patch } }));
  };

  const costFor = useCallback(
    (sceneId: string) => {
      const s = settingsFor(sceneId);
      return videoStudioCreditCost({ durationSec: s.duration, hasEndFrame: !!s.endImage });
    },
    [settingsFor],
  );

  const doneScenes = scenes.filter((s) => !!s.video_url);
  const pendingScenes = scenes.filter((s) => !s.video_url && !!s.image_url);
  const totalDoneSec = doneScenes.reduce((sum, s) => sum + settingsFor(s.id).duration, 0);
  const batchCost = pendingScenes.reduce((sum, s) => sum + costFor(s.id), 0);

  /**
   * 씬 하나를 생성한다. 배치에서도 재사용하므로 크레딧 확인·차감을 여기서 모두 처리하고
   * 성공 여부만 돌려준다 (배치는 실패 시 중단 판단에 쓴다).
   */
  const runScene = useCallback(
    async (scene: Scene): Promise<boolean> => {
      if (!project) return false;
      if (!scene.image_url) {
        setJobs((c) => ({ ...c, [scene.id]: { status: 'failed', error: '씬 이미지가 없습니다. 3단계에서 먼저 생성해 주세요.' } }));
        return false;
      }

      const cfg = settingsFor(scene.id);
      const prompt = (cfg.prompt ?? autoPrompt(scene)).trim();
      if (!prompt) {
        setJobs((c) => ({ ...c, [scene.id]: { status: 'failed', error: '프롬프트가 비어 있습니다.' } }));
        return false;
      }

      const cost = costFor(scene.id);
      if (!hasEnough(cost)) {
        setJobs((c) => ({ ...c, [scene.id]: { status: 'failed', error: `크레딧 부족 (필요 ${cost}cr / 잔액 ${balance}cr)` } }));
        return false;
      }

      setJobs((c) => ({ ...c, [scene.id]: { status: 'generating', startedAt: Date.now() } }));

      try {
        const aspect: ConcreteAspect = await detectAspectFromImage(scene.image_url);
        const result = await generateStudioVideo({
          prompt,
          aspect,
          durationSec: cfg.duration,
          startImage: scene.image_url,
          endImage: cfg.endImage,
        });

        if (!result.ok || !result.videoUrl) {
          setJobs((c) => ({ ...c, [scene.id]: { status: 'failed', error: result.message ?? '생성 실패' } }));
          return false;
        }

        await deduct(cost, `씬 영상 (${scene.order + 1}번 · ${cfg.duration}s)`);

        let finalUrl = result.videoUrl;
        if (user?.id) {
          const saved = await saveVideoHistory({
            ownerId: user.id,
            prompt: `[씬 ${scene.order + 1}] ${project.title}`,
            aspect,
            durationSec: cfg.duration,
            model: VIDEO_STUDIO_MODEL,
            hasStartFrame: true,
            hasEndFrame: !!cfg.endImage,
            videoUrl: result.videoUrl,
          });
          if (saved.ok && saved.item) finalUrl = saved.item.url;
        }

        updateScene(scene.id, { video_url: finalUrl });
        setJobs((c) => ({ ...c, [scene.id]: { status: 'idle' } }));
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setJobs((c) => ({ ...c, [scene.id]: { status: 'failed', error: msg } }));
        return false;
      }
    },
    [project, settingsFor, costFor, hasEnough, balance, deduct, user?.id, updateScene],
  );

  const handleGenerateOne = async (scene: Scene) => {
    const cost = costFor(scene.id);
    if (!hasEnough(cost)) {
      await alert(`크레딧이 부족합니다. (필요 ${cost}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }
    await runScene(scene);
  };

  const handleGenerateAll = async () => {
    if (pendingScenes.length === 0) return;
    if (!hasEnough(batchCost)) {
      await alert(`크레딧이 부족합니다. (필요 ${batchCost}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }
    const ok = await confirm(
      `미완료 씬 ${pendingScenes.length}개를 순서대로 생성합니다.\n\n` +
      `• 크레딧 ${batchCost}cr 차감\n` +
      `• 씬당 1~3분 · 총 ${pendingScenes.length * 2}분 내외 예상\n\n` +
      `계속할까요?`,
    );
    if (!ok) return;

    batchAbort.current = false;
    setBatchActive(true);
    try {
      for (const scene of pendingScenes) {
        if (batchAbort.current) break;
        await runScene(scene);
      }
    } finally {
      setBatchActive(false);
    }
  };

  if (!project) return null;

  if (scenes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 mx-auto flex items-center justify-center">
          <AlertCircle className="text-zinc-400" size={28} />
        </div>
        <h3 className="text-lg font-black text-zinc-900">씬이 아직 없어요</h3>
        <p className="text-sm text-zinc-500">먼저 2·3단계에서 씬과 이미지를 완성해 주세요.</p>
        <button
          onClick={onBack}
          className="mt-2 px-5 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} /> 모드 선택으로
        </button>
      </div>
    );
  }

  const progressPct = Math.round((doneScenes.length / scenes.length) * 100);

  return (
    <div className="space-y-5">
      {/* ===== 헤더: 진행률 + 전체 생성 ===== */}
      <div className="p-5 rounded-2xl bg-white border border-zinc-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-zinc-900">
                {doneScenes.length}/{scenes.length}
              </span>
              <span className="text-sm font-bold text-zinc-500">완료</span>
              {totalDoneSec > 0 && (
                <span className="text-xs text-zinc-400">
                  · 합계 {totalDoneSec}초
                </span>
              )}
            </div>
            <div className="mt-2 h-2 w-full md:w-80 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-[#1E6FD9] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right mr-1">
              <div className="text-[11px] text-zinc-400">잔액</div>
              <div className="text-sm font-black text-zinc-700">{balance}cr</div>
            </div>
            {batchActive ? (
              <button
                onClick={() => { batchAbort.current = true; }}
                className="px-5 py-3 rounded-2xl bg-white border-2 border-red-200 text-red-600 font-black text-sm flex items-center gap-2 hover:bg-red-50"
              >
                <StopCircle size={16} /> 남은 씬 중단
              </button>
            ) : (
              <button
                onClick={handleGenerateAll}
                disabled={pendingScenes.length === 0 || anyRunning}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white font-black text-sm shadow-[0_8px_24px_rgba(0,80,191,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Rocket size={16} />
                {pendingScenes.length === 0
                  ? '모든 씬 완료'
                  : `전체 씬 생성 (남은 ${pendingScenes.length}개 · ${batchCost}cr)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== 세로 타임라인 ===== */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden divide-y divide-zinc-100">
        {scenes.map((scene, idx) => (
          <SceneRow
            key={scene.id}
            scene={scene}
            index={idx}
            nextImage={scenes[idx + 1]?.image_url}
            job={jobs[scene.id]}
            settings={settingsFor(scene.id)}
            resolution={resolution[scene.id] ?? '720p'}
            cost={costFor(scene.id)}
            expanded={expandedId === scene.id}
            playing={playingId === scene.id}
            tick={tick}
            busy={batchActive || anyRunning}
            onToggle={() => setExpandedId((c) => (c === scene.id ? null : scene.id))}
            onPatch={(patch) => patchSettings(scene.id, patch)}
            onResolution={(r) => setResolution((c) => ({ ...c, [scene.id]: r }))}
            onPlay={() => setPlayingId((c) => (c === scene.id ? null : scene.id))}
            onGenerate={() => handleGenerateOne(scene)}
          />
        ))}
      </div>
    </div>
  );
};

// =============================================================
//  씬 한 줄 (아코디언 카드)
// =============================================================

interface SceneRowProps {
  scene: Scene;
  index: number;
  nextImage?: string;
  job?: SceneJob;
  settings: SceneSettings;
  resolution: Resolution;
  cost: number;
  expanded: boolean;
  playing: boolean;
  tick: number;
  busy: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<SceneSettings>) => void;
  onResolution: (r: Resolution) => void;
  onPlay: () => void;
  onGenerate: () => void;
}

const SceneRow: React.FC<SceneRowProps> = ({
  scene, index, nextImage, job, settings, resolution, cost,
  expanded, playing, tick, busy,
  onToggle, onPatch, onResolution, onPlay, onGenerate,
}) => {
  const generating = job?.status === 'generating';
  const failed = job?.status === 'failed';
  const done = !!scene.video_url;
  const prompt = settings.prompt ?? autoPrompt(scene);

  // tick 은 1초마다 바뀌며 추정 진행률을 다시 계산시키는 용도로만 참조한다.
  void tick;
  const elapsed = generating && job?.startedAt ? Date.now() - job.startedAt : 0;
  const estPct = Math.min(95, Math.round((elapsed / ESTIMATED_JOB_MS) * 100));

  return (
    <div className={generating ? 'bg-primary/[0.03]' : ''}>
      {/* --- 접힘 헤더 --- */}
      <div className="flex items-center gap-3 p-3 md:p-4">
        <div className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-black ${
          done ? 'bg-emerald-500 text-white'
          : generating ? 'bg-primary text-white'
          : failed ? 'bg-red-100 text-red-600'
          : 'bg-zinc-100 text-zinc-500'
        }`}>
          {index + 1}
        </div>

        <div className="w-20 h-12 shrink-0 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 flex items-center justify-center">
          {scene.image_url ? (
            <img src={scene.image_url} alt={`씬 ${index + 1}`} className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={16} className="text-zinc-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-zinc-900 truncate">
            씬 {index + 1}
            <span className="ml-2 text-xs font-normal text-zinc-400">{scene.content_kr}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
            {generating ? (
              <span className="flex items-center gap-1 text-primary font-bold">
                <Loader2 size={11} className="animate-spin" /> 생성중 {estPct}%
              </span>
            ) : done ? (
              <span className="flex items-center gap-1 text-emerald-600 font-bold">
                <CheckCircle2 size={11} /> 생성완료
              </span>
            ) : failed ? (
              <span className="flex items-center gap-1 text-red-600 font-bold truncate">
                <XCircle size={11} className="shrink-0" />
                <span className="truncate">{job?.error ?? '실패'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-zinc-400 font-bold">
                <Clock size={11} /> 대기
              </span>
            )}
            <span className="text-zinc-300">·</span>
            <span className="text-zinc-400">{settings.duration}초 · {resolution}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {done && (
            <button
              onClick={onPlay}
              className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-zinc-800"
            >
              <Play size={13} /> {playing ? '닫기' : '재생'}
            </button>
          )}
          <button
            onClick={onToggle}
            className="px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs font-bold text-zinc-600 flex items-center gap-1 hover:bg-zinc-50"
          >
            편집
            <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* --- 생성 진행 바 --- */}
      {generating && (
        <div className="px-4 pb-3">
          <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${estPct}%` }} />
          </div>
        </div>
      )}

      {/* --- 재생 --- */}
      {playing && scene.video_url && (
        <div className="px-4 pb-4">
          <div className="rounded-xl overflow-hidden bg-black">
            <video src={scene.video_url} controls autoPlay loop className="w-full max-h-[420px]" />
          </div>
        </div>
      )}

      {/* --- 펼침 편집기 --- */}
      {expanded && (
        <div className="px-4 pb-5 pt-1 bg-zinc-50/60 border-t border-zinc-100">
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 pt-4">
            {/* 프레임 */}
            <div className="flex items-start gap-3">
              <div className="space-y-1.5">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">시작</div>
                <div className="w-32 h-20 rounded-xl overflow-hidden bg-zinc-100 border-2 border-primary/30 flex items-center justify-center">
                  {scene.image_url ? (
                    <img src={scene.image_url} alt="start" className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={18} className="text-zinc-400" />
                  )}
                </div>
                <div className="text-[10px] text-zinc-500 text-center">씬 {index + 1}</div>
              </div>

              <div className="pt-7 text-zinc-300 font-black">→</div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">끝 (선택)</div>
                <div className="w-32 h-20 rounded-xl overflow-hidden bg-white border-2 border-dashed border-zinc-200 flex items-center justify-center">
                  {settings.endImage ? (
                    <img src={settings.endImage} alt="end" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-zinc-400 px-2 text-center">없음</span>
                  )}
                </div>
                {settings.endImage ? (
                  <button
                    onClick={() => onPatch({ endImage: undefined })}
                    className="w-32 text-[10px] font-bold text-zinc-500 hover:text-red-600"
                  >
                    끝 프레임 제거
                  </button>
                ) : (
                  <button
                    onClick={() => nextImage && onPatch({ endImage: nextImage })}
                    disabled={!nextImage}
                    className="w-32 text-[10px] font-bold text-primary hover:underline disabled:text-zinc-300 disabled:no-underline"
                  >
                    {nextImage ? `씬 ${index + 2} 이미지 사용 (+5cr)` : '다음 씬 없음'}
                  </button>
                )}
              </div>
            </div>

            {/* 설정 */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    영상 프롬프트
                  </label>
                  {settings.prompt !== null && (
                    <button
                      onClick={() => onPatch({ prompt: null })}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <RefreshCw size={10} /> 기본값 복원
                    </button>
                  )}
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => onPatch({ prompt: e.target.value })}
                  rows={4}
                  disabled={generating}
                  placeholder="카메라 움직임·모션·무드를 영어로 적어주세요."
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-xs font-mono resize-none leading-relaxed bg-white"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <Wand2 size={10} /> 기본값은 씬의 모션 지시문
                  </span>
                  <span className={`text-[10px] font-mono ${
                    prompt.length > KLING_PROMPT_MAX ? 'text-red-600 font-black' : 'text-zinc-400'
                  }`}>
                    {prompt.length} / {KLING_PROMPT_MAX}자
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">길이</label>
                  <div className="mt-1 flex gap-1.5">
                    {([5, 10] as VideoDuration[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => onPatch({ duration: d })}
                        disabled={generating}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          settings.duration === d
                            ? 'bg-primary text-white'
                            : 'bg-white border border-zinc-200 text-zinc-500 hover:border-primary/40'
                        }`}
                      >
                        {d}초
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">해상도</label>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      onClick={() => onResolution('720p')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        resolution === '720p'
                          ? 'bg-primary text-white'
                          : 'bg-white border border-zinc-200 text-zinc-500'
                      }`}
                    >
                      720p
                    </button>
                    <button
                      disabled
                      title="VIP 요금제와 함께 오픈 예정"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-zinc-200 text-zinc-300 cursor-not-allowed"
                    >
                      1080p VIP
                    </button>
                  </div>
                </div>
              </div>

              {failed && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-800 leading-relaxed">
                  {job?.error}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={onGenerate}
                  disabled={generating || busy || !scene.image_url}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white text-xs font-black shadow-[0_6px_18px_rgba(0,80,191,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {generating ? (
                    <><Loader2 size={14} className="animate-spin" /> 생성 중...</>
                  ) : done ? (
                    <><RefreshCw size={14} /> 재생성 ({cost}cr)</>
                  ) : (
                    <><Sparkles size={14} /> 이 씬 생성 ({cost}cr)</>
                  )}
                </button>
                {scene.video_url && (
                  <a
                    href={scene.video_url}
                    download={`sodam-scene-${index + 1}.mp4`}
                    className="px-4 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-xs font-bold text-zinc-700 flex items-center gap-2"
                  >
                    <Download size={14} /> 다운로드
                  </a>
                )}
                {!scene.image_url && (
                  <span className="text-[11px] text-amber-700 font-bold">
                    3단계에서 씬 이미지를 먼저 생성해 주세요.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionModeB;
