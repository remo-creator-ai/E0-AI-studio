// =============================================================
//  모드 B · 개별 영상 정밀 제작 (Phase 1 재작성)
//
//  docs/mockups/mode-b-with-upscale.html 의 구조를 따른다:
//    - 상단 sticky 헤더: 진행률 · 전체 생성 · 씬 레일
//    - 씬마다 카드 하나 (3상태: idle · editor · done)
//    - 업스케일 → AI 생성 → 결과 흐름을 카드 안에서 완결
//    - 씬 선택 체크박스로 합치기 포함/제외 (opacity dim)
//    - 씬 간 이동 4경로 (레일 · 카드 헤더 · 플로팅 · 키보드 J/K)
//
//  Phase 1 스코프 = UI 배선만.
//  Phase 2 (테이크 스택, video_url → video_takes[]) 는 별개 커밋. 문서 참조.
//
//  주의:
//   - 씬 추가/삭제/순서 이동 UI 는 여기 넣지 않음 (기획 단계 전용).
//   - Kling 에 보내는 프롬프트는 기본 영문(video_motion_en). 사용자가
//     한국어 프롬프트를 명시 편집한 경우에만 편집한 텍스트를 보냄.
//     (Korean-only 전환은 별도 리팩터로 계획됨)
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, Clock, Download,
  DownloadCloud, ImageUp, Loader2, Package, Play, Rocket, Sparkles, Trash2,
  Upload, Video, X, AlertCircle, Wand2, Film as FilmIcon, Pencil,
} from 'lucide-react';
import JSZip from 'jszip';
import { useStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useCreditStore } from '../../store/creditStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useModal } from '../ui/ModalProvider';
import { useTranslation } from 'react-i18next';
import { genErrorSummary } from '../../lib/genErrorMessages';
import { useGenErrorAlert } from '../../hooks/useGenErrorAlert';
import {
  generateStudioVideo, videoStudioCreditCost, detectAspectFromImage,
  suggestVideoPromptFromImage, SUGGEST_PROMPT_COST,
  VIDEO_STUDIO_MODEL, KLING_PROMPT_MAX, clampKlingPrompt,
  type ConcreteAspect, type VideoDuration, type VideoResolution,
} from '../../services/videoStudioService';
import { upscaleSceneImage, IMAGE_UPSCALE_COST } from '../../services/imageUpscaleService';
import { saveVideoHistory, refreshVideoSignedUrl } from '../../services/videoHistoryService';
import { useVideoGenStore, type VideoJob } from '../../store/videoGenStore';
import {
  useModeBState, DEFAULT_SCENE_SETTINGS,
  type SceneSettings, type CardMode, type UpscaleStatus, type SceneTake,
} from '../../store/modeBStateStore';
import { generateNarration, narrationCreditCost, NARRATION_MAX_CHARS, type NarrationCue } from '../../services/narrationService';
import { VOICE_PRESETS, DEFAULT_VOICE } from '../../services/ttsService';
import { buildSrt, buildCutList, buildScriptText, buildTimeline, buildReadme } from '../../lib/editorPackage';
import { AssetLibraryPicker } from '../AssetLibraryPicker';
import { SelfHealingVideo } from '../ui/SelfHealingVideo';
import type { Scene } from '../../types';
import { UPSCALE_CREDIT_COST } from '../../types';

// ── 모델 라벨 파생 (하드코딩 금지, VIDEO_STUDIO_MODEL 상수에서 파생) ──
// 'kling-v2-6' → 'Kling 2.6'
const MODEL_LABEL_BASE = 'Kling ' + VIDEO_STUDIO_MODEL.replace(/^kling-v/, '').replace('-', '.');
const MODEL_LABEL_STD = MODEL_LABEL_BASE;               // 'Kling 2.6'
const MODEL_LABEL_PRO = `${MODEL_LABEL_BASE} pro`;      // 'Kling 2.6 pro'

// ── 파일명 규칙 (Phase 2 대비) ──
// 지금: 씬당 결과 1개 → 'scene-01.mp4' (order 는 1-based)
// 향후: 씬당 여러 테이크 → main_take 만 파일명에 '-main' 붙임 · 나머지 테이크는 zip 미포함
//       예: 'scene-01-main.mp4' (main), 'scene-01-take-2.mp4' (추가 다운로드 옵션)
function sceneFilename(scene: Scene, isMain = true): string {
  const num = String(scene.order).padStart(2, '0');
  const tag = isMain ? '' : ''; // Phase 1: 항상 main. 향후 '-main' 태그 여기서 결정.
  return `scene-${num}${tag}.mp4`;
}

/** 프로젝트 제목 → 파일명 안전 슬러그 */
function slugifyForFile(title: string, fallback = 'sodam'): string {
  const s = title.trim()
    .replace(/[<>:"/\\|?*]+/g, '')  // 파일명 금지 문자
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return s || fallback;
}

/**
 * 내려받은 mp4 의 실제 재생 길이(초).
 *
 * 자막·타임라인이 이 값을 쓴다. 요청 길이(5초/10초)를 그대로 믿으면 Kling 이
 * 4.9초를 돌려줬을 때 뒤 씬부터 자막이 조금씩 밀린다. 못 재면 null 을 주고
 * 호출부가 요청 길이로 폴백한다.
 */
function measureVideoDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    const done = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const d = video.duration;
      done(Number.isFinite(d) && d > 0 ? d : null);
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

// ── 로컬 타입 (재-export 목적 · 실 정의는 modeBStateStore) ──
// SceneSettings · CardMode · UpscaleStatus 는 store 에서 import.

interface ModeBProps {
  onBack: () => void;
}

// =============================================================
//  Main Component
// =============================================================
export const ProductionModeB: React.FC<ModeBProps> = ({ onBack }) => {
  const project = useStore((s) => s.project);
  const updateScene = useStore((s) => s.updateScene);
  const balance = useCreditStore((s) => s.balance);
  const deduct = useCreditStore((s) => s.deduct);
  const hasEnough = useCreditStore((s) => s.hasEnough);
  const user = useAuthStore((s) => s.user);
  const language = useSettingsStore((s) => s.defaultLanguage);
  const { alert, confirm } = useModal();
  const { t } = useTranslation();
  const showGenError = useGenErrorAlert();

  const scenes = project?.scenes ?? [];
  const projectTag = project ? `mode-b:${project.id}` : '';

  // ── 세션 스토어 (프로젝트 이탈해도 유지) ──
  const settings = useModeBState((s) => s.settings);
  const cardMode = useModeBState((s) => s.cardMode);
  const selected = useModeBState((s) => s.selected);
  const upscaleJobs = useModeBState((s) => s.upscaleJobs);
  const upscaleProgress = useModeBState((s) => s.upscaleProgress);
  const activeSceneId = useModeBState((s) => s.activeSceneId);
  const ensureProject = useModeBState((s) => s.ensureProject);
  const patchSettingsStore = useModeBState((s) => s.patchSettings);
  const setCardModeStore = useModeBState((s) => s.setCardMode);
  const toggleSelectStore = useModeBState((s) => s.toggleSelect);
  const setAllSelectedStore = useModeBState((s) => s.setAllSelected);
  const setUpscaleJobStore = useModeBState((s) => s.setUpscaleJob);
  const setUpscaleProgressStore = useModeBState((s) => s.setUpscaleProgress);
  const setActiveSceneIdStore = useModeBState((s) => s.setActiveSceneId);
  const takesMap = useModeBState((s) => s.takes);
  const mainTakeIdMap = useModeBState((s) => s.mainTakeId);
  const addTakeStore = useModeBState((s) => s.addTake);
  const setMainTakeStore = useModeBState((s) => s.setMainTake);
  const seedTakeFromPersisted = useModeBState((s) => s.seedTakeFromPersisted);
  const healTakeUrl = useModeBState((s) => s.healTakeUrl);

  // 프로젝트 진입 · 전환 시 스토어 초기화
  useEffect(() => {
    if (!project) return;
    const defaultSelected: Record<string, boolean> = {};
    scenes.forEach((s) => { defaultSelected[s.id] = true; });
    ensureProject(project.id, defaultSelected, scenes[0]?.id ?? null);
  }, [project?.id, scenes, project, ensureProject]);

  // 기존 저장된 video_url 있는 씬 → 첫 테이크로 seed (씬당 1회, 중복 방지 store 내부에서)
  // signed URL 은 1시간 만료라 마운트 시점에 재발급 후 seed 한다. 재발급된 URL 은
  // 아래 "대표 테이크 → scene.video_url 동기화" 이펙트가 프로젝트에 반영한다.
  //
  // 씬마다 순차 await 하던 예전 구현은 씬 하나가 느리거나 실패하면 뒤쪽 씬이 통째로
  // 건너뛰어졌고(그 씬만 검은 화면), 언마운트/의존성 변화로 cancelled 가 서면 남은 씬의
  // 재발급이 아예 사라졌다. 씬별로 독립 실행 + allSettled 로 서로 영향을 주지 않게 한다.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    const targets = scenes.filter((s) => !!s.video_url);
    if (targets.length === 0) return;
    void Promise.allSettled(
      targets.map(async (s) => {
        let refreshed = s.video_url!;
        try {
          refreshed = await refreshVideoSignedUrl(s.video_url!);
        } catch (e) {
          console.warn('[mode-b] signed URL 재발급 실패', s.id, e);
        }
        if (cancelled) return;
        seedTakeFromPersisted(s.id, {
          id: `persisted-${s.id}`,
          videoUrl: refreshed,
          durationSec: 5,
          resolution: '720p',
          hasEndFrame: false,
          createdAt: 0,
        });
        // 이미 seed 된 씬(재진입)이라도 갓 재발급한 URL 로 갈아끼워 만료본이 남지 않게 한다.
        healTakeUrl(s.id, s.video_url!, refreshed);
      }),
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length, project?.id]);

  // ── 대표 테이크 → scene.video_url 단일 진실원천 동기화 ──
  //
  // "대표" 뱃지가 붙은 테이크와 실제로 재생·다운로드·합치기에 쓰이는 scene.video_url 이
  // 갈라지면 사용자는 대표로 지정돼 있는데 검은 화면을 보게 된다(테이크 썸네일만 정상).
  // 렌더 시점에 항상 대표 테이크를 우선하고, 다르면 프로젝트에도 밀어넣어 zip 다운로드·
  // 합치기까지 같은 URL 을 쓰게 만든다. 값이 같아지면 더 이상 set 하지 않으므로 수렴한다.
  const resolveVideoUrl = useCallback((sceneId: string, fallback?: string | null): string => {
    const list = takesMap[sceneId];
    if (list && list.length > 0) {
      const mainId = mainTakeIdMap[sceneId];
      const take = (mainId ? list.find((t) => t.id === mainId) : undefined) ?? list[list.length - 1];
      if (take?.videoUrl) return take.videoUrl;
    }
    return fallback ?? '';
  }, [takesMap, mainTakeIdMap]);

  useEffect(() => {
    scenes.forEach((s) => {
      const url = resolveVideoUrl(s.id, null);
      if (url && url !== s.video_url) updateScene(s.id, { video_url: url });
    });
  }, [scenes, resolveVideoUrl, updateScene]);

  /** <video> 가 만료 URL 로 실패해 스스로 재발급했을 때 — 테이크·씬 양쪽에 반영.
   *  대표가 아닌 테이크가 복구된 경우엔 scene.video_url 을 건드리지 않는다. */
  const handleHealed = useCallback((sceneId: string, freshUrl: string, staleUrl: string) => {
    healTakeUrl(sceneId, staleUrl, freshUrl);
    const current = useStore.getState().project?.scenes.find((s) => s.id === sceneId);
    if (current?.video_url === staleUrl) {
      updateScene(sceneId, { video_url: freshUrl });
    }
  }, [healTakeUrl, updateScene]);

  // ── 헬퍼 (스토어 래퍼) ──
  const getSettings = useCallback((sceneId: string): SceneSettings => {
    return settings[sceneId] ?? DEFAULT_SCENE_SETTINGS;
  }, [settings]);

  const patchSettings = patchSettingsStore;

  const isUpscaled = (scene: Scene) => !!scene.upscale_level;
  const upscaleStatus = (sceneId: string): UpscaleStatus => upscaleJobs[sceneId] ?? 'idle';

  // 언어별 표시 프롬프트 (편집 대상은 아님, 참조용)
  const getDisplayPrompts = (s: Scene) => {
    if (language === 'ko') {
      return { image: s.content_kr || s.image_prompt_en, video: s.video_motion_kr || s.video_motion_en };
    }
    return { image: s.image_prompt_en, video: s.video_motion_en };
  };

  // Kling 으로 실제 보낼 프롬프트.
  //
  // 폴백을 getDisplayPrompts 와 같은 규칙으로 맞춘다. 예전에는 화면에는
  // video_motion_kr 을 보여주면서 실제로는 항상 video_motion_en 을 보냈다 —
  // "이 내용 그대로 전송" 이라고 써 놓고 다른 걸 보내고 있었던 셈이다.
  const buildKlingPrompt = (s: Scene, sceneSettings: SceneSettings): string => {
    const edited = sceneSettings.prompt !== null && sceneSettings.prompt.trim()
      ? sceneSettings.prompt
      : '';
    const raw = edited || getDisplayPrompts(s).video || (s.video_motion_en ?? '');
    return clampKlingPrompt(raw.trim());
  };

  /** 지금 언어에 대응하는 씬의 모션 필드 */
  const motionField = language === 'ko' ? 'video_motion_kr' : 'video_motion_en';

  /**
   * 모션 프롬프트 변경을 두 곳에 반영한다.
   *
   *  1) SceneSettings.prompt — 이번 세션에서 실제로 전송될 값
   *  2) Scene.video_motion_* — 프로젝트 JSON. 자동저장을 타고 스토리보드에 남는다
   *
   * 예전에는 (1)만 갱신했다. 세션 상태라 새로고침하면 사라졌고, 1cr 주고 얻은
   * AI 상상 결과도 스토리보드에는 흔적조차 남지 않았다.
   */
  const setVideoMotion = useCallback((sceneId: string, text: string) => {
    patchSettings(sceneId, { prompt: text });
    updateScene(sceneId, { [motionField]: text } as Partial<Scene>);
  }, [patchSettings, updateScene, motionField]);

  // ── 비디오 생성 큐 (전역, 이탈해도 지속) ──
  const jobs = useVideoGenStore((s) => s.jobs);
  const addJob = useVideoGenStore((s) => s.addJob);
  const updateJob = useVideoGenStore((s) => s.updateJob);
  const removeJob = useVideoGenStore((s) => s.removeJob);

  // 씬별로 가장 최근 잡을 매핑
  const sceneJobs = useMemo(() => {
    const map: Record<string, VideoJob> = {};
    jobs.forEach((j) => {
      if (!j.tag?.startsWith(`${projectTag}:`)) return;
      const sceneId = j.tag.slice(projectTag.length + 1);
      if (!map[sceneId] || j.createdAt > map[sceneId].createdAt) {
        map[sceneId] = j;
      }
    });
    return map;
  }, [jobs, projectTag]);

  const isGenerating = (sceneId: string) => sceneJobs[sceneId]?.status === 'generating';
  const anyGenerating = Object.values(sceneJobs).some((j) => j.status === 'generating');

  /**
   * 업스케일 실행. 성공 여부를 돌려준다.
   *
   * 배치(전체 생성)에서는 실패한 씬의 영상 생성을 건너뛰어야 한다. 예전에는
   * 반환값이 없어서 실패해도 그대로 Kling 으로 넘어갔는데, 저해상도 컷은
   * 애초에 Kling 이 거부하는 입력이라 영상 크레딧만 날렸다.
   * silent 는 배치용 — 27컷이면 실패 모달이 27번 뜨는 걸 막고 마지막에 요약한다.
   */
  const runUpscale = useCallback(async (scene: Scene, options?: { silent?: boolean }): Promise<boolean> => {
    const silent = options?.silent === true;
    const report = async (payload: unknown) => { if (!silent) await showGenError(payload, 'upscale'); };

    if (!scene.image_url) {
      if (!silent) await alert('업스케일할 원본 이미지가 없습니다. 스토리보드에서 씬 이미지를 먼저 만들어주세요.', { type: 'warning' });
      return false;
    }
    if (!hasEnough(IMAGE_UPSCALE_COST)) {
      if (!silent) await alert(`크레딧이 부족합니다. (필요 ${IMAGE_UPSCALE_COST}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return false;
    }
    setUpscaleJobStore(scene.id, 'running');
    setUpscaleProgressStore(scene.id, 0);

    // Kling 실제 진행률이 없으므로 추정 진행률 (rAF 대신 interval)
    const progressTimer = window.setInterval(() => {
      const cur = useModeBState.getState().upscaleProgress[scene.id] ?? 0;
      setUpscaleProgressStore(scene.id, Math.min(90, cur + 4));
    }, 400);

    try {
      const aspect = await detectAspectFromImage(scene.image_url);
      // 업스케일 모델은 서비스가 Nano Banana 2 로 고정한다 (프로젝트 이미지 모델과 무관).
      const result = await upscaleSceneImage({
        imageUrl: scene.image_url,
        aspect,
        targetSize: '2K',
      });
      window.clearInterval(progressTimer);
      if (!result.ok || !result.dataUrl) {
        setUpscaleJobStore(scene.id, 'failed');
        console.error('[ModeB] 업스케일 실패:', result.message);
        await report(result);
        return false;
      }
      // 실제 적용된 해상도로 과금·기록한다 (모델이 요청 해상도를 거부하면 낮아질 수 있다).
      const applied = result.appliedSize ?? '2K';
      await deduct(UPSCALE_CREDIT_COST[applied], `${applied} 업스케일 (씬 ${scene.order})`);
      updateScene(scene.id, { image_url: result.dataUrl, upscale_level: applied });
      setUpscaleJobStore(scene.id, 'done');
      setUpscaleProgressStore(scene.id, 100);
      return true;
    } catch (e) {
      window.clearInterval(progressTimer);
      setUpscaleJobStore(scene.id, 'failed');
      console.error('[ModeB] 업스케일 예외:', e);
      await report(e);
      return false;
    }
  }, [alert, showGenError, balance, deduct, hasEnough, updateScene, setUpscaleJobStore, setUpscaleProgressStore]);

  // ── 씬 영상 생성 실행 (fire-and-forget) ──
  const runGenerate = useCallback(async (scene: Scene, options?: { skipConfirm?: boolean }) => {
    const s = getSettings(scene.id);
    const cost = videoStudioCreditCost({
      durationSec: s.duration,
      resolution: s.resolution,
      hasEndFrame: !!s.endImage,
    });
    if (!scene.image_url) {
      await alert('씬 이미지가 없어 생성할 수 없습니다.', { type: 'warning' });
      return;
    }
    if (!isUpscaled(scene)) {
      await alert('먼저 업스케일을 해주세요. Kling 이 저해상도 이미지를 거부합니다.', { type: 'warning' });
      return;
    }
    if (!hasEnough(cost)) {
      await alert(`크레딧이 부족합니다. (필요 ${cost}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }
    if (!options?.skipConfirm) {
      const label = s.resolution === '1080p' || s.endImage ? MODEL_LABEL_PRO : MODEL_LABEL_STD;
      // 이미 결과가 있는 씬이면 "덮어쓰나?" 가 첫 질문이다. 테이크로 쌓인다는 걸 알린다.
      const retakeNote = scene.video_url
        ? '\n· 기존 영상은 테이크로 보관되고 새 영상이 대표가 됩니다'
        : '';
      const ok = await confirm(
        `씬 ${scene.order} 영상을 만듭니다.\n\n· ${label} · ${s.duration}초 · ${s.resolution}\n· 크레딧 ${cost}cr 차감\n· 소요 1~3분${retakeNote}\n\n계속할까요?`,
      );
      if (!ok) return;
    }

    const jobId = crypto.randomUUID();
    const prompt = buildKlingPrompt(scene, s);
    const startImage = scene.image_url;
    const endImage = s.endImage;

    // aspect 는 실제 씬 이미지에서 감지
    const aspect = await detectAspectFromImage(startImage);

    addJob({
      id: jobId,
      prompt,
      aspect,
      durationSec: s.duration,
      hasStartFrame: true,
      hasEndFrame: !!endImage,
      tag: `${projectTag}:${scene.id}`,
    });

    (async () => {
      try {
        const result = await generateStudioVideo({
          prompt,
          aspect,
          durationSec: s.duration,
          resolution: s.resolution,
          startImage,
          endImage,
        });
        if (!result.ok || !result.videoUrl) {
          // 씬 카드에 한 줄로 들어가므로 원문 대신 요약 문구를 저장한다.
          // (원문은 아래 console.error 로만 남긴다)
          console.error('[ModeB] 씬 영상 생성 실패:', result.failure, result.message);
          updateJob(jobId, { status: 'failed', error: genErrorSummary(result, t) });
          return;
        }
        await deduct(cost, `씬 영상 (${scene.order})`);

        // Kling URL 24h 만료 방지 → history 로 재업로드
        let finalUrl = result.videoUrl;
        let historyId: string | undefined;
        if (user?.id) {
          const saved = await saveVideoHistory({
            ownerId: user.id,
            prompt: `[씬${scene.order}] ${project?.title ?? ''}`,
            aspect,
            durationSec: s.duration,
            model: VIDEO_STUDIO_MODEL,
            hasStartFrame: true,
            hasEndFrame: !!endImage,
            videoUrl: result.videoUrl,
          });
          if (saved.ok && saved.item) {
            finalUrl = saved.item.url;
            historyId = saved.item.id;
          }
        }
        updateJob(jobId, { status: 'done', videoUrl: finalUrl, historyId });
        // 세션 테이크 스택에 추가 (자동으로 대표 지정 · 브라우저 재로딩 시엔 최신 것만 살아남음)
        addTakeStore(scene.id, {
          id: jobId,
          videoUrl: finalUrl,
          durationSec: s.duration,
          resolution: s.resolution,
          hasEndFrame: !!endImage,
          createdAt: Date.now(),
          historyId,
        });
        // project.scenes[].video_url 은 최신(대표) 을 가리킴 → 새로고침 후에도 이 하나는 남음
        updateScene(scene.id, { video_url: finalUrl });
        // 완료 후 편집기 자동 접기 → done 뷰로 자동 전환
        setCardModeStore(scene.id, 'idle');
      } catch (e) {
        console.error('[ModeB] 씬 영상 생성 예외:', e);
        updateJob(jobId, { status: 'failed', error: genErrorSummary(e, t) });
      }
    })();
  }, [addJob, alert, balance, buildKlingPrompt, confirm, deduct, getSettings, hasEnough, project?.title, projectTag, updateJob, updateScene, user?.id, addTakeStore, setCardModeStore, t]);

  // ── 프롬프트 상상하기 (AI 제안) ──
  //
  // 스토리보드의 모션 문구("천천히 줌인")는 이미지 기획용이라 그대로 영상에
  // 넣으면 의도한 씬이 거의 안 나온다. 실제 시작 프레임(있으면 끝 프레임까지)을
  // 보고 영상용 프롬프트를 새로 쓰게 한다.
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);

  const suggestPrompt = useCallback(async (scene: Scene) => {
    if (!scene.image_url) {
      await alert('시작 프레임 이미지가 없습니다. 스토리보드에서 씬 이미지를 먼저 만들어주세요.', { type: 'warning' });
      return;
    }
    if (!hasEnough(SUGGEST_PROMPT_COST)) {
      await alert(`크레딧이 부족합니다. (필요 ${SUGGEST_PROMPT_COST}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }
    setSuggestingFor(scene.id);
    try {
      const s = getSettings(scene.id);
      const result = await suggestVideoPromptFromImage(scene.image_url, {
        language,
        priorDescription: getDisplayPrompts(scene).video,
        endImage: s.endImage,
      });
      if (!result.ok || !result.prompt) {
        await showGenError(result.error ?? 'no_response', 'video');
        return;
      }
      await deduct(SUGGEST_PROMPT_COST, `영상 프롬프트 상상 (씬 ${scene.order})`);
      // 스토리보드(JSON)에도 함께 반영한다 — 새로고침해도 남고, 스토리보드
      // 화면에서도 같은 모션 문구를 보게 된다.
      setVideoMotion(scene.id, clampKlingPrompt(result.prompt));
    } catch (e) {
      console.error('[ModeB] 프롬프트 상상 실패:', e);
      await showGenError(e, 'video');
    } finally {
      setSuggestingFor(null);
    }
  }, [alert, showGenError, balance, deduct, hasEnough, getSettings, setVideoMotion, language]);

  // ── 네비게이션: 씬 스크롤 이동 ──
  const scrollToScene = useCallback((sceneId: string) => {
    const el = document.getElementById(`scene-card-${sceneId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSceneIdStore(sceneId);
  }, []);

  const moveActive = useCallback((delta: -1 | 1) => {
    const idx = scenes.findIndex((s) => s.id === activeSceneId);
    if (idx === -1) return;
    const next = idx + delta;
    if (next < 0 || next >= scenes.length) return;
    scrollToScene(scenes[next].id);
  }, [scenes, activeSceneId, scrollToScene]);

  // 키보드 ↑↓/J/K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moveActive]);

  // ── 씬 선택 관리 (스토어 위임) ──
  const toggleSelect = (sceneId: string) => toggleSelectStore(sceneId);
  const selectAll = () => setAllSelectedStore(Object.fromEntries(scenes.map((s) => [s.id, true])));
  const clearAll = () => setAllSelectedStore(Object.fromEntries(scenes.map((s) => [s.id, false])));
  const selectCompleted = () => setAllSelectedStore(Object.fromEntries(scenes.map((s) => [s.id, !!s.video_url])));

  const selectedScenes = scenes.filter((s) => selected[s.id]);
  const doneScenes = scenes.filter((s) => !!s.video_url);
  const doneSelectedScenes = selectedScenes.filter((s) => !!s.video_url);
  const progressPct = scenes.length === 0 ? 0 : Math.round((doneScenes.length / scenes.length) * 100);

  // 선택된 씬 합계 초·비용
  const totalSelectedSec = selectedScenes.reduce((sum, s) => sum + getSettings(s.id).duration, 0);
  const totalSelectedCost = selectedScenes.reduce((sum, s) => {
    const ss = getSettings(s.id);
    return sum + videoStudioCreditCost({ durationSec: ss.duration, resolution: ss.resolution, hasEndFrame: !!ss.endImage });
  }, 0);

  // ── 선택된 씬 중 아직 업스케일 안 된 것들 (배치 업스케일 대상) ──
  const scenesNeedingUpscale = selectedScenes.filter((s) => !isUpscaled(s) && !!s.image_url);
  const upscaleBatchCost = scenesNeedingUpscale.length * IMAGE_UPSCALE_COST;

  // ── 완료된 씬 영상 배치 다운로드 (zip) ──
  const [batchDownloading, setBatchDownloading] = useState(false);
  const downloadAllVideos = useCallback(async () => {
    // "선택된 씬" 중 완료된 것만 대상 (사용자가 최종 영상에 넣기로 한 씬 기준)
    const targets = selectedScenes.filter((s) => !!s.video_url);
    if (targets.length === 0) {
      await alert('다운로드할 완료된 씬 영상이 없습니다.', { type: 'warning' });
      return;
    }
    setBatchDownloading(true);
    try {
      const zip = new JSZip();
      // 각 씬 mp4 를 병렬로 fetch 해 zip 에 담기
      await Promise.all(
        targets.map(async (s) => {
          try {
            let res = await fetch(s.video_url!);
            if (!res.ok) {
              // signed URL 만료(403) 가능성 → 1회 재발급 후 재시도
              const fresh = await refreshVideoSignedUrl(s.video_url!);
              if (fresh !== s.video_url) {
                updateScene(s.id, { video_url: fresh });
                res = await fetch(fresh);
              }
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            zip.file(sceneFilename(s), blob);
          } catch (e) {
            // 개별 실패는 스킵 · 나머지는 계속
            console.warn('scene download failed:', s.order, e);
          }
        }),
      );
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifyForFile(project?.title ?? 'sodam')}-scenes.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[ModeB] 배치 다운로드 실패:', e);
      await alert(`배치 다운로드에 실패했습니다.\n${genErrorSummary(e, t)}`, { type: 'error' });
    } finally {
      setBatchDownloading(false);
    }
  }, [selectedScenes, alert, project?.title, updateScene]);

  // ── CapCut 편집 패키지 내보내기 ──
  //
  // 앱 안에서 영상을 합치지 않고, 편집자가 CapCut 에서 바로 이어붙일 수 있는
  // 재료 한 벌을 ZIP 으로 내려준다. 파일명 순서가 곧 편집 순서라 CapCut 에
  // 통째로 끌어다 놓으면 순서대로 배치된다.
  //
  // 나레이션은 통짜로 한 번에 합성한다 — 씬별로 나눠 만들면 같은 목소리라도
  // 톤이 갈린다. 대신 합성 응답의 타임포인트로 "자르는 지점" 을 같이 준다.
  const [exporting, setExporting] = useState(false);
  const [exportStep, setExportStep] = useState<string>('');
  const [exportOpen, setExportOpen] = useState(false);

  const exportEditorPackage = useCallback(async (options: { voiceId: string; withNarration: boolean }) => {
    const targets = selectedScenes.filter((s) => !!s.video_url);
    if (targets.length === 0) {
      await alert('내보낼 완료된 씬 영상이 없습니다.', { type: 'warning' });
      return;
    }

    setExporting(true);
    try {
      const zip = new JSZip();

      // 1) 씬 영상 — 실제 재생 길이를 같이 재둔다. 자막·타임라인이 이 값을 쓴다.
      setExportStep(`씬 영상 ${targets.length}개 받는 중...`);
      const packed = await Promise.all(targets.map(async (s, idx) => {
        const filename = `scene-${String(idx + 1).padStart(2, '0')}.mp4`;
        let durationSeconds = getSettings(s.id).duration as number;
        try {
          let res = await fetch(s.video_url!);
          if (!res.ok) {
            const fresh = await refreshVideoSignedUrl(s.video_url!);
            if (fresh !== s.video_url) {
              updateScene(s.id, { video_url: fresh });
              res = await fetch(fresh);
            }
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          zip.file(filename, blob);
          const measured = await measureVideoDuration(blob);
          if (measured) durationSeconds = measured;
        } catch (e) {
          console.warn('[ModeB] 패키지 씬 다운로드 실패:', s.order, e);
          return null;
        }
        return {
          order: idx + 1,
          durationSeconds,
          script: (language === 'ko' ? s.script_kr : s.script_en) || s.script_kr || s.script_en || '',
          filename,
        };
      }));

      const scenes = packed.filter((p): p is NonNullable<typeof p> => p !== null);
      if (scenes.length === 0) throw new Error('씬 영상을 하나도 받지 못했습니다.');
      const missing = targets.length - scenes.length;

      // 2) 나레이션 (통짜) + 자르는 지점
      let cues: NarrationCue[] = [];
      let narrationIncluded = false;
      if (options.withNarration) {
        const cost = narrationCreditCost(scenes.map((s) => ({ order: s.order, script: s.script })));
        if (!hasEnough(cost)) {
          await alert(`나레이션 크레딧이 부족합니다. (필요 ${cost}cr / 잔액 ${balance}cr)\n\n영상과 문서만 담아 계속합니다.`, { type: 'warning' });
        } else {
          setExportStep('나레이션 합성 중...');
          const result = await generateNarration({
            scenes: scenes.map((s) => ({ order: s.order, script: s.script })),
            voiceId: options.voiceId,
          });
          if (result.ok && result.audioUrl) {
            await deduct(cost, `나레이션 합성 (${scenes.length}씬)`);
            const b64 = result.audioUrl.split(',')[1] ?? '';
            zip.file('narration.mp3', b64, { base64: true });
            cues = result.cues ?? [];
            narrationIncluded = true;
          } else {
            // 나레이션 실패가 패키지 전체를 막지는 않는다. 영상·문서는 그대로 쓸모가 있다.
            await alert(`나레이션을 만들지 못했습니다.\n${result.message ?? ''}\n\n영상과 문서만 담아 계속합니다.`, { type: 'warning' });
          }
        }
      }

      // 3) 문서
      setExportStep('문서 만드는 중...');
      const totalSeconds = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      zip.file('subtitles.srt', buildSrt(scenes));
      zip.file('timeline.txt', buildTimeline(scenes));
      zip.file('script.txt', buildScriptText(scenes));
      if (narrationIncluded) zip.file('cut-list.txt', buildCutList(scenes, cues));
      zip.file('README.txt', buildReadme({
        projectTitle: project?.title ?? '소담 프로젝트',
        sceneCount: scenes.length,
        totalSeconds,
        hasNarration: narrationIncluded,
      }));

      setExportStep('압축하는 중...');
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifyForFile(project?.title ?? 'sodam')}-capcut.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const notes = [
        `씬 ${scenes.length}개 · 총 ${Math.round(totalSeconds)}초`,
        narrationIncluded ? '나레이션 포함 · cut-list.txt 의 시각에서 자르세요' : '나레이션 미포함',
      ];
      if (missing > 0) notes.push(`⚠️ ${missing}개 씬은 영상을 받지 못해 빠졌습니다`);
      await alert(`편집 패키지를 내려받았습니다.\n\n${notes.join('\n')}\n\n압축을 풀고 README.txt 부터 보세요.`, { type: 'success' });
    } catch (e) {
      console.error('[ModeB] 편집 패키지 내보내기 실패:', e);
      await alert(`편집 패키지를 만들지 못했습니다.\n${genErrorSummary(e, t)}`, { type: 'error' });
    } finally {
      setExporting(false);
      setExportStep('');
    }
  }, [selectedScenes, alert, project?.title, updateScene, getSettings, language, hasEnough, balance, deduct, t]);

  const runUpscaleSelected = useCallback(async () => {
    if (scenesNeedingUpscale.length === 0) return;
    if (!hasEnough(upscaleBatchCost)) {
      await alert(`크레딧이 부족합니다. (필요 ${upscaleBatchCost}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
    }
    const ok = await confirm(
      `선택된 씬 중 아직 업스케일 안 된 ${scenesNeedingUpscale.length}개 씬을 업스케일합니다.\n\n크레딧 ${upscaleBatchCost}cr 차감 · 순차 실행.`,
    );
    if (!ok) return;
    // runUpscale 내부에서 hasEnough 재검사, upscale_level 갱신.
    // 실패 모달은 씬마다 띄우지 않고 마지막에 한 번 요약한다.
    const failed: number[] = [];
    for (const s of scenesNeedingUpscale) {
      if (!(await runUpscale(s, { silent: true }))) failed.push(s.order);
    }
    if (failed.length > 0) {
      await alert(
        `${scenesNeedingUpscale.length - failed.length}/${scenesNeedingUpscale.length} 업스케일 완료.\n` +
        `실패: ${failed.map((o) => `#${o}`).join(', ')}\n\n실패한 씬은 크레딧이 차감되지 않았습니다.`,
        { type: failed.length === scenesNeedingUpscale.length ? 'error' : 'warning' }
      );
    }
  }, [scenesNeedingUpscale, upscaleBatchCost, hasEnough, balance, alert, confirm, runUpscale]);

  // ── AssetLibraryPicker (END 소스) ──
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // ── 전체 생성 모달 ──
  const [showBatchModal, setShowBatchModal] = useState(false);

  // ── 조기 리턴 ──
  if (!project || scenes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 mx-auto flex items-center justify-center">
          <AlertCircle className="text-zinc-400" size={28} />
        </div>
        <h3 className="text-lg font-black text-zinc-900">씬이 없습니다</h3>
        <p className="text-sm text-zinc-500">먼저 2·3단계에서 스토리보드와 씬 이미지를 만들어 주세요.</p>
        <button
          onClick={onBack}
          className="mt-2 px-5 py-2.5 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700 inline-flex items-center gap-2"
        >
          <ArrowLeft size={16} /> 모드 선택으로
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ══════════ 상단 sticky 헤더: 진행률 · 전체생성 · 씬 레일 ══════════ */}
      <div className="sticky top-16 z-30 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-[#F5F7FA]/95 backdrop-blur-md border-b border-zinc-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-zinc-900">{doneScenes.length}/{scenes.length}</span>
              <span className="text-sm font-bold text-zinc-500">완료</span>
              {totalSelectedSec > 0 && (
                <span className="text-xs text-zinc-400">
                  · 선택 {selectedScenes.length}개 · 합계 {totalSelectedSec}초
                </span>
              )}
            </div>
            <div className="mt-2 h-2 w-full md:w-72 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-[#1E6FD9] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <div className="text-right mr-1">
              <div className="text-[11px] text-zinc-400">잔액</div>
              <div className="text-sm font-black text-zinc-700">{balance}cr</div>
            </div>
            {/* 선택된 씬 중 아직 업스케일 안 된 것들만 배치 처리 */}
            {scenesNeedingUpscale.length > 0 && (
              <button
                onClick={runUpscaleSelected}
                className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm shadow-[0_6px_16px_rgba(245,158,11,0.28)] flex items-center gap-2"
                title="이미 업스케일된 씬은 자동 제외"
              >
                <ImageUp size={16} />
                선택 업스케일 ({scenesNeedingUpscale.length}개 · {upscaleBatchCost}cr)
              </button>
            )}
            {/* CapCut 편집 패키지 — 씬 영상 + 나레이션 + 자막/컷리스트 한 벌 */}
            {doneSelectedScenes.length > 0 && (
              <button
                onClick={() => setExportOpen(true)}
                disabled={exporting}
                className="px-4 py-3 rounded-2xl bg-primary hover:bg-[#003E99] text-white font-black text-sm shadow-[0_6px_16px_rgba(0,80,191,0.28)] flex items-center gap-2 disabled:opacity-60"
                title="CapCut 에 바로 끌어다 놓을 수 있는 편집 패키지를 만듭니다"
              >
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <FilmIcon size={16} />}
                {exporting ? (exportStep || '만드는 중...') : 'CapCut 편집 패키지'}
              </button>
            )}
            {/* 완료된 씬 배치 다운로드 (zip) */}
            {doneSelectedScenes.length > 0 && (
              <button
                onClick={downloadAllVideos}
                disabled={batchDownloading}
                className="px-4 py-3 rounded-2xl bg-white border-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 font-black text-sm flex items-center gap-2 disabled:opacity-60"
                title="선택된 씬 중 완료된 영상을 zip 으로 묶어 다운로드 (파일명: scene-01.mp4, scene-02.mp4 …)"
              >
                {batchDownloading ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
                {batchDownloading ? '묶는 중...' : `zip 다운로드 (${doneSelectedScenes.length}개)`}
              </button>
            )}
            <button
              onClick={() => setShowBatchModal(true)}
              disabled={selectedScenes.length === 0}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white font-black text-sm shadow-[0_8px_24px_rgba(0,80,191,0.3)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Rocket size={16} />
              선택한 씬 생성 ({selectedScenes.length}개 · {totalSelectedCost}cr)
            </button>
          </div>
        </div>

        {/* 씬 레일 — 가로 스크롤 칩 */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {scenes.map((s, idx) => (
            <SceneRailChip
              key={s.id}
              scene={s}
              videoUrl={resolveVideoUrl(s.id, s.video_url)}
              onHealed={(fresh, stale) => handleHealed(s.id, fresh, stale)}
              index={idx}
              active={activeSceneId === s.id}
              selected={!!selected[s.id]}
              upscaleStatus={upscaleStatus(s.id)}
              generating={isGenerating(s.id)}
              onClick={() => scrollToScene(s.id)}
            />
          ))}
        </div>

        {/* 빠른 선택 · 기획으로 이동 */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-zinc-400">빠른 선택:</span>
          <button onClick={selectAll} className="px-2.5 py-1 rounded-full bg-white border border-zinc-200 hover:bg-zinc-50 font-bold text-zinc-600">전체</button>
          <button onClick={clearAll} className="px-2.5 py-1 rounded-full bg-white border border-zinc-200 hover:bg-zinc-50 font-bold text-zinc-600">해제</button>
          <button onClick={selectCompleted} className="px-2.5 py-1 rounded-full bg-white border border-zinc-200 hover:bg-zinc-50 font-bold text-zinc-600">완성만</button>
          <div className="ml-auto text-zinc-400">
            씬 편집이 필요하면 <button onClick={onBack} className="text-primary font-bold hover:underline">모드 선택 ›</button>
          </div>
        </div>
      </div>

      {/* ══════════ 씬 카드 목록 ══════════ */}
      <div className="space-y-5">
        {scenes.map((scene, idx) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            videoUrl={resolveVideoUrl(scene.id, scene.video_url)}
            onHealed={(fresh, stale) => handleHealed(scene.id, fresh, stale)}
            index={idx}
            total={scenes.length}
            selected={!!selected[scene.id]}
            cardMode={cardMode[scene.id] ?? 'idle'}
            settings={getSettings(scene.id)}
            upscaleStatus={upscaleStatus(scene.id)}
            upscaleProgress={upscaleProgress[scene.id] ?? 0}
            job={sceneJobs[scene.id]}
            nextSceneImage={scenes[idx + 1]?.image_url}
            language={language}
            displayPrompts={getDisplayPrompts(scene)}
            onToggleSelect={() => toggleSelect(scene.id)}
            onSetMode={(m) => setCardModeStore(scene.id, m)}
            onPatchSettings={(patch) => patchSettings(scene.id, patch)}
            onPromptChange={(text) => setVideoMotion(scene.id, text)}
            onPatchScene={(patch) => updateScene(scene.id, patch)}
            takes={takesMap[scene.id] ?? []}
            mainTakeId={mainTakeIdMap[scene.id]}
            onSelectMainTake={(takeId) => {
              setMainTakeStore(scene.id, takeId);
              const take = (takesMap[scene.id] ?? []).find((t) => t.id === takeId);
              if (take) updateScene(scene.id, { video_url: take.videoUrl });
            }}
            onUpscale={() => runUpscale(scene)}
            onGenerate={() => runGenerate(scene)}
            // 예전에는 여기서 바로 재생성했다 — 같은 프롬프트로 다시 뽑으니
            // 결과도 거의 같았다. 영상에서 결과를 가르는 건 프롬프트라,
            // 먼저 프롬프트를 고칠 수 있는 편집 화면으로 보낸다. 과금은 거기서만.
            onRegenerate={() => setCardModeStore(scene.id, 'editor')}
            suggesting={suggestingFor === scene.id}
            onSuggestPrompt={() => suggestPrompt(scene)}
            onOpenLibraryForEnd={() => setPickerFor(scene.id)}
            onPrev={idx > 0 ? () => scrollToScene(scenes[idx - 1].id) : undefined}
            onNext={idx < scenes.length - 1 ? () => scrollToScene(scenes[idx + 1].id) : undefined}
          />
        ))}
      </div>

      {/* ══════════ 우하단 플로팅 네비 ══════════ */}
      <FloatingSceneNav
        currentIndex={scenes.findIndex((s) => s.id === activeSceneId)}
        total={scenes.length}
        onPrev={() => moveActive(-1)}
        onNext={() => moveActive(1)}
      />

      {/* ══════════ 보관함 픽커 (END 소스) ══════════ */}
      {pickerFor && (
        <AssetLibraryPicker
          open={true}
          onClose={() => setPickerFor(null)}
          onPick={({ dataUrl }) => {
            patchSettings(pickerFor, { endImage: dataUrl });
            setPickerFor(null);
          }}
          maxRemaining={1}
          title="END 프레임 선택"
          subtitle="보관함에서 이미지 하나를 골라주세요."
        />
      )}

      {/* ══════════ CapCut 편집 패키지 모달 ══════════ */}
      {exportOpen && (
        <EditorPackageModal
          scenes={doneSelectedScenes.map((s) => ({
            order: s.order,
            script: (language === 'ko' ? s.script_kr : s.script_en) || s.script_kr || s.script_en || '',
          }))}
          balance={balance}
          onClose={() => setExportOpen(false)}
          onConfirm={(opts) => { setExportOpen(false); exportEditorPackage(opts); }}
        />
      )}

      {/* ══════════ 전체 생성 모달 ══════════ */}
      {showBatchModal && (
        <GenerateAllModal
          scenes={selectedScenes}
          settingsFor={getSettings}
          onClose={() => setShowBatchModal(false)}
          onConfirm={async (targetScenes) => {
            setShowBatchModal(false);
            // 순차 실행 (완전 병렬은 Kling rate limit 문제 소지)
            const upscaleFailed: number[] = [];
            for (const s of targetScenes) {
              if (!isUpscaled(s)) {
                // 자동 업스케일 먼저. 실패하면 영상 생성으로 넘어가지 않는다 —
                // 저해상도 컷은 Kling 이 거부하는 입력이라 영상 크레딧만 날린다.
                const ok = await runUpscale(s, { silent: true });
                if (!ok) {
                  upscaleFailed.push(s.order);
                  continue;
                }
              }
              await runGenerate(s, { skipConfirm: true });
              // 다음 잡 시작 전 짧게 대기 (rate limit 여유)
              await new Promise((r) => setTimeout(r, 200));
            }
            if (upscaleFailed.length > 0) {
              await alert(
                `업스케일에 실패해 영상 생성을 건너뛴 씬이 있습니다: ${upscaleFailed.map((o) => `#${o}`).join(', ')}\n\n` +
                '해당 씬은 개별 업스케일 버튼으로 다시 시도해 주세요. (실패한 씬의 영상 크레딧은 차감되지 않았습니다)',
                { type: 'warning' }
              );
            }
          }}
          balance={balance}
        />
      )}
    </div>
  );
};

// =============================================================
//  씬 레일 칩 (상단 sticky)
// =============================================================
interface SceneRailChipProps {
  scene: Scene;
  /** 대표 테이크 기준으로 해석된 재생 URL (scene.video_url 은 폴백) */
  videoUrl: string;
  onHealed: (freshUrl: string, staleUrl: string) => void;
  index: number;
  active: boolean;
  /** 씬 선택 상태 (합치기 포함 여부) — 카드 dim 과 일관된 시각 동기화. */
  selected: boolean;
  upscaleStatus: UpscaleStatus;
  generating: boolean;
  onClick: () => void;
}
const SceneRailChip: React.FC<SceneRailChipProps> = ({ scene, videoUrl, onHealed, index, active, selected, upscaleStatus, generating, onClick }) => {
  const done = !!videoUrl;
  const statusColor =
    generating ? 'bg-primary animate-pulse'
    : done ? 'bg-emerald-500'
    : upscaleStatus === 'running' ? 'bg-amber-500 animate-pulse'
    : upscaleStatus === 'done' ? 'bg-blue-400'
    : upscaleStatus === 'failed' ? 'bg-red-500'
    : 'bg-zinc-300';

  return (
    <button
      onClick={onClick}
      title={!selected ? '이 씬은 최종 영상에서 제외됨' : undefined}
      className={`flex-none flex flex-col items-center gap-1 px-2 pt-1.5 pb-1 rounded-xl border-2 transition-all ${
        active ? 'border-primary bg-white shadow' : 'border-zinc-200 bg-white hover:border-zinc-300'
      } ${!selected ? 'opacity-40 grayscale-[0.4]' : ''}`}
      style={{ width: 108 }}
    >
      <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-primary' : 'text-zinc-500'}`}>
        씬 {index + 1}
        {!selected && <span className="ml-1 text-zinc-400">·제외</span>}
      </span>
      <div className="w-full aspect-video rounded-md overflow-hidden bg-zinc-900 relative">
        {done ? (
          // poster 를 씬 이미지로 — 영상 로딩·재발급 중에도 검은 사각형 대신 스틸이 보인다.
          <SelfHealingVideo
            src={videoUrl}
            poster={scene.image_url || undefined}
            onHealed={onHealed}
            muted
            loop
            playsInline
            onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
            onMouseLeave={(e) => { const el = e.target as HTMLVideoElement; el.pause(); el.currentTime = 0; }}
            className="w-full h-full object-contain"
          />
        ) : scene.image_url ? (
          <img src={scene.image_url} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-[10px]">없음</div>
        )}
      </div>
      <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
        {done ? '완료' : generating ? '생성중' : upscaleStatus === 'running' ? '업스케일' : upscaleStatus === 'failed' ? '실패' : '대기'}
      </span>
    </button>
  );
};

// =============================================================
//  씬 카드 (3상태)
// =============================================================
interface SceneCardProps {
  scene: Scene;
  /** 대표 테이크 기준으로 해석된 재생 URL (scene.video_url 은 폴백) */
  videoUrl: string;
  onHealed: (freshUrl: string, staleUrl: string) => void;
  index: number;
  total: number;
  selected: boolean;
  cardMode: CardMode;
  settings: SceneSettings;
  upscaleStatus: UpscaleStatus;
  upscaleProgress: number;
  job?: VideoJob;
  nextSceneImage?: string;
  language: 'ko' | 'en';
  displayPrompts: { image: string; video: string };
  onToggleSelect: () => void;
  onSetMode: (m: CardMode) => void;
  onPatchSettings: (patch: Partial<SceneSettings>) => void;
  /** 모션 프롬프트 전용 — 세션 설정과 스토리보드 JSON 양쪽에 반영한다 */
  onPromptChange: (text: string) => void;
  onPatchScene: (patch: Partial<Scene>) => void;
  takes: SceneTake[];
  mainTakeId?: string;
  onSelectMainTake: (takeId: string) => void;
  onUpscale: () => void;
  onGenerate: () => void;
  /** 결과 화면에서 "프롬프트 고쳐서 다시 만들기" — 편집 화면으로 되돌린다 */
  onRegenerate: () => void;
  onOpenLibraryForEnd: () => void;
  /** AI 프롬프트 상상 진행 중 */
  suggesting: boolean;
  onSuggestPrompt: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene, videoUrl, onHealed, index, total, selected, cardMode, settings, upscaleStatus, upscaleProgress,
  job, nextSceneImage, language, displayPrompts, takes, mainTakeId, onSelectMainTake,
  onToggleSelect, onSetMode, onPatchSettings, onPromptChange, onPatchScene, onUpscale, onGenerate, onRegenerate, onOpenLibraryForEnd,
  suggesting, onSuggestPrompt, onPrev, onNext,
}) => {
  const done = !!videoUrl;
  const generating = job?.status === 'generating';
  const failed = job?.status === 'failed';
  const upscaled = !!scene.upscale_level;

  const cost = videoStudioCreditCost({
    durationSec: settings.duration,
    resolution: settings.resolution,
    hasEndFrame: !!settings.endImage,
  });
  const modelLabel = settings.resolution === '1080p' || settings.endImage ? MODEL_LABEL_PRO : MODEL_LABEL_STD;

  return (
    <div
      id={`scene-card-${scene.id}`}
      className={`rounded-3xl border bg-white transition-all ${
        selected ? 'border-zinc-200' : 'border-zinc-200 opacity-40 pointer-events-none'
      }`}
      style={{ scrollMarginTop: 200 }}
    >
      {/* 카드 헤더 */}
      <div className="px-5 py-3 flex items-center gap-3 border-b border-zinc-100 pointer-events-auto">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded"
          />
          <span className="text-lg font-black text-zinc-900">씬 {index + 1}</span>
        </label>
        {!selected && (
          <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold">
            최종 영상에서 제외
          </span>
        )}
        {done && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
            <CheckCircle2 size={11} /> 완료
          </span>
        )}
        {upscaled && !done && (
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
            업스케일 완료
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={!onPrev}
            title="이전 씬"
            className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-500"
          >
            <ChevronUp size={16} />
          </button>
          <button
            onClick={onNext}
            disabled={!onNext}
            title="다음 씬"
            className="p-2 rounded-lg hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-500"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* 카드 본체 */}
      <div className="p-5 pointer-events-auto">
        {/* 편집기가 done 보다 앞선다 — 완료된 씬도 "프롬프트 고쳐서 다시 만들기" 로
            편집 화면에 돌아올 수 있어야 한다. 생성이 끝나면 부모가 mode 를 idle 로
            되돌리므로 평소에는 결과 화면이 보인다. */}
        {cardMode === 'editor' ? (
          // ─── (b) 편집기 전개 ───
          <SceneEditor
            scene={scene}
            settings={settings}
            upscaleStatus={upscaleStatus}
            job={job}
            nextSceneImage={nextSceneImage}
            language={language}
            displayPrompts={displayPrompts}
            modelLabel={modelLabel}
            cost={cost}
            isRetake={done}
            onPromptChange={onPromptChange}
            suggesting={suggesting}
            onSuggestPrompt={onSuggestPrompt}
            onBack={() => onSetMode('idle')}
            onPatch={onPatchSettings}
            onGenerate={onGenerate}
            onOpenLibrary={onOpenLibraryForEnd}
          />
        ) : done ? (
          // ─── (c) 완료 상태: 결과 영상이 주인공 (목업 그대로 · 그리드 분할) ───
          <SceneDoneView
            scene={scene}
            videoUrl={videoUrl}
            onHealed={onHealed}
            settings={settings}
            displayPrompts={displayPrompts}
            nextSceneImage={nextSceneImage}
            takes={takes}
            mainTakeId={mainTakeId}
            onSelectMainTake={onSelectMainTake}
            onRegenerate={onRegenerate}
          />
        ) : (
          // ─── (a) 액션 선택 ───
          <SceneActionPicker
            scene={scene}
            upscaleStatus={upscaleStatus}
            upscaleProgress={upscaleProgress}
            upscaled={upscaled}
            generating={generating}
            failed={failed}
            failedError={job?.error}
            settings={settings}
            fallbackVideoPrompt={displayPrompts.video}
            suggesting={suggesting}
            onSuggestPrompt={onSuggestPrompt}
            onPromptChange={onPromptChange}
            onUpscale={onUpscale}
            onOpenEditor={() => onSetMode('editor')}
            onPatchScene={onPatchScene}
          />
        )}
      </div>
    </div>
  );
};

// =============================================================
//  씬 카드 (c) 완료 상태 — 결과 영상이 주인공
//
//  목업 (mode-b-with-upscale.html · 씬 1) 구조 그대로:
//    · 좌: 큰 video + 하단 pill (해상도)
//    · 우: 세로 액션 [전체화면 재생 · 다운로드 · 다시 만들기] + 안내 카드
//    · 접힘 details "이 영상을 만든 설정 보기" — START/END 프레임 + 프롬프트 2단
//
//  Phase 2 (테이크 스택) 는 아직: 대표/추가 테이크 스트립은 목업엔 있지만
//  types.ts 변경 필요라 이번엔 스킵. 안내 카드 문구로 방향만 남김.
// =============================================================
interface SceneDoneViewProps {
  scene: Scene;
  /** 대표 테이크 기준으로 해석된 재생 URL (scene.video_url 은 폴백) */
  videoUrl: string;
  onHealed: (freshUrl: string, staleUrl: string) => void;
  settings: SceneSettings;
  displayPrompts: { image: string; video: string };
  nextSceneImage?: string;
  takes: SceneTake[];
  mainTakeId?: string;
  onSelectMainTake: (takeId: string) => void;
  onRegenerate: () => void;
}
const SceneDoneView: React.FC<SceneDoneViewProps> = ({ scene, videoUrl, onHealed, settings, displayPrompts, nextSceneImage, takes, mainTakeId, onSelectMainTake, onRegenerate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const regenerateCost = videoStudioCreditCost({
    durationSec: settings.duration,
    resolution: settings.resolution,
    hasEndFrame: !!settings.endImage,
  });

  const openFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    // Safari 대응
    // @ts-expect-error webkit prefix
    else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
    el.play().catch(() => {});
  };

  return (
    <div className="space-y-5">
      {/* 좌: 비디오 · 우: 액션 (목업 minmax(0,1.6fr) minmax(0,1fr)) */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ── 결과 영상 ── */}
        <div className="relative rounded-2xl overflow-hidden bg-black">
          <SelfHealingVideo
            ref={videoRef}
            src={videoUrl}
            poster={scene.image_url || undefined}
            onHealed={onHealed}
            controls
            loop
            playsInline
            className="w-full max-h-[60vh] object-contain"
          />
          <div className="absolute bottom-2 left-2 flex gap-1.5 pointer-events-none">
            <span className="px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-black backdrop-blur">
              {settings.resolution} · {settings.duration}s
            </span>
          </div>
        </div>

        {/* ── 액션 컬럼 ── */}
        <div className="flex flex-col gap-2.5">
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">이 씬 결과물</div>
          <button
            onClick={openFullscreen}
            className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white font-black text-sm shadow-[0_6px_16px_rgba(0,80,191,0.28)] flex items-center justify-center gap-2 hover:shadow-[0_8px_20px_rgba(0,80,191,0.4)] transition-all"
          >
            <Play size={16} /> 전체화면 재생
          </button>
          <a
            href={videoUrl}
            download={sceneFilename(scene)}
            className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-zinc-200 text-zinc-700 font-black text-sm hover:bg-zinc-50 flex items-center justify-center gap-2"
          >
            <Download size={16} /> 대표 영상 다운로드
          </a>
          {/* 결과가 맘에 안 들 때 바꿔야 하는 건 대부분 프롬프트다.
              같은 프롬프트로 다시 뽑으면 비슷한 결과가 나오므로 바로 생성하지 않고
              편집 화면으로 보낸다 (크레딧은 거기서 생성할 때만 빠진다). */}
          <button
            onClick={onRegenerate}
            className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-primary/40 text-primary font-black text-sm hover:bg-primary/5 flex items-center justify-center gap-2"
          >
            <Pencil size={16} /> 프롬프트 고쳐서 다시 만들기
          </button>
          <p className="text-[11px] text-zinc-400 leading-relaxed px-1">
            프롬프트를 그대로 두고 다시 뽑으면 비슷한 결과가 나옵니다. 생성은 {regenerateCost}cr.
          </p>
          <div className="mt-auto p-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-bold text-amber-900 leading-relaxed">
              합치기에는 <strong>완성된 영상 1개</strong>가 들어갑니다. 여러 테이크 지원(대표 지정)은 다음 업데이트 예정.
            </p>
          </div>
        </div>
      </div>

      {/* ── 테이크 스택 (세션 메모리 · 브라우저 재로딩 시 최신 하나만 유지) ── */}
      {takes.length > 0 && (
        <div className="p-3 rounded-2xl border border-zinc-200 bg-zinc-50/70">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-black text-zinc-700">생성된 영상 {takes.length}개</span>
            <span className="text-[11px] font-bold text-zinc-400">· 클릭하면 대표로 지정</span>
            <span className="ml-auto text-[10px] font-bold text-amber-700">
              세션 메모리 · 새로고침 시 대표 하나만 유지
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {takes.map((t, i) => {
              const isMain = mainTakeId ? t.id === mainTakeId : i === takes.length - 1;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectMainTake(t.id)}
                  className={`flex-none flex flex-col gap-1 rounded-xl border-2 overflow-hidden bg-white transition-all ${
                    isMain ? 'border-primary shadow-[0_4px_12px_rgba(0,80,191,0.25)]' : 'border-zinc-200 hover:border-primary/40'
                  }`}
                  style={{ width: 128 }}
                  title={isMain ? '대표 · 클릭해도 그대로' : '클릭하면 대표로 지정'}
                >
                  <div className="relative w-full aspect-video bg-black">
                    <SelfHealingVideo
                      src={t.videoUrl}
                      poster={scene.image_url || undefined}
                      onHealed={onHealed}
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                      onMouseLeave={(e) => { const el = e.target as HTMLVideoElement; el.pause(); el.currentTime = 0; }}
                      className="w-full h-full object-contain"
                    />
                    {isMain && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-primary text-white text-[9px] font-black">
                        대표
                      </span>
                    )}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[9px] font-black">
                      {t.durationSec}s · {t.resolution}
                    </span>
                  </div>
                  <div className="px-2 py-1 text-left">
                    <div className="text-[10px] font-black text-zinc-800">테이크 {i + 1}</div>
                    <div className="text-[9px] text-zinc-400">
                      {t.createdAt === 0 ? '이전 세션' : `${Math.max(1, Math.floor((Date.now() - t.createdAt) / 60000))}분 전`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 접힘 details: 만든 방식 보기 ── */}
      <details className="rounded-2xl border border-zinc-200 bg-zinc-50/70 overflow-hidden">
        <summary className="px-4 py-3 flex items-center gap-2 text-sm font-black text-zinc-600 cursor-pointer hover:bg-zinc-100">
          <ChevronDown size={14} className="transition-transform" />
          이 영상을 만든 설정 보기
        </summary>
        <div className="px-4 pb-4 space-y-4">
          {/* START · END 프레임 시각화 */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_40px_1fr] gap-3 items-center pt-3">
            <div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">START</div>
              <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900 border-2 border-primary/30">
                {scene.image_url ? (
                  <img src={scene.image_url} alt="" className="w-full h-full object-contain" />
                ) : null}
              </div>
            </div>
            <div className="hidden md:flex flex-col items-center justify-center gap-1 text-zinc-400">
              <span className="text-xs font-black">{settings.duration}s</span>
              <span className="text-[10px]">모션</span>
              <span className="text-xs">→</span>
            </div>
            <div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">END</div>
              <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900 border-2 border-zinc-300 flex items-center justify-center">
                {settings.endImage ? (
                  <img src={settings.endImage} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs font-black text-zinc-500">END 프레임 미사용</span>
                )}
              </div>
            </div>
          </div>

          {/* 프롬프트 2단 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">이미지 프롬프트</div>
              <div className="px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-700 leading-relaxed min-h-[3em]">
                {displayPrompts.image || <span className="text-zinc-400 italic">비어있음</span>}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">영상 프롬프트 · 모션</div>
              <div className="px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-700 leading-relaxed min-h-[3em]">
                {settings.prompt !== null && settings.prompt.trim() ? settings.prompt : displayPrompts.video || <span className="text-zinc-400 italic">비어있음</span>}
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">대사 · 자막</div>
              <div className="px-3 py-2 rounded-lg bg-white border border-zinc-200 text-xs text-zinc-700 leading-relaxed min-h-[3em]">
                {scene.script_kr || scene.script_en || <span className="text-zinc-400 italic">비어있음</span>}
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
};

// =============================================================
//  영상(모션) 프롬프트 편집기 — 액션 화면용
//
//  예전엔 이 화면에 이미지 프롬프트만 있었다. 정작 영상 결과를 가르는 모션
//  프롬프트는 보이지도, 고칠 수도 없었고 — "AI로 상상" 을 눌러도 결과가 어디에
//  들어갔는지 화면에 나타나지 않았다. 여기서 바로 보고 고칠 수 있게 한다.
//
//  이미지 프롬프트·대사(SceneTextEditor)는 Scene 필드라 저장/되돌리기로 다루지만,
//  이쪽은 SceneSettings.prompt(세션 상태)라 입력 즉시 반영한다.
// =============================================================
interface VideoPromptEditorProps {
  /** 사용자가 편집한 프롬프트. null 이면 스토리보드 모션 문구를 그대로 쓴다. */
  value: string | null;
  /** 스토리보드 모션 문구 (기본값) */
  fallback: string;
  hasEndFrame: boolean;
  hasImage: boolean;
  suggesting: boolean;
  disabled: boolean;
  onChange: (next: string) => void;
  onSuggest: () => void;
}
const VideoPromptEditor: React.FC<VideoPromptEditorProps> = ({
  value, fallback, hasEndFrame, hasImage, suggesting, disabled, onChange, onSuggest,
}) => {
  const usingDefault = value === null || !value.trim();
  const text = usingDefault ? fallback : value;

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${usingDefault ? 'border-amber-300 bg-amber-50/40' : 'border-primary/30 bg-primary/[0.03]'}`}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-100 bg-white/70">
        <Video size={12} className={usingDefault ? 'text-amber-600' : 'text-primary'} />
        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">영상 프롬프트 · 모션</span>
        <button
          type="button"
          onClick={onSuggest}
          disabled={suggesting || disabled || !hasImage}
          className="ml-auto px-2.5 py-1 rounded-lg bg-white border border-primary/40 text-primary text-[11px] font-black hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-primary transition-colors flex items-center gap-1"
          title={hasEndFrame
            ? `START·END 두 프레임을 보고 전환 프롬프트를 씁니다 (${SUGGEST_PROMPT_COST}cr)`
            : `시작 프레임을 보고 영상 프롬프트를 씁니다 (${SUGGEST_PROMPT_COST}cr)`}
        >
          {suggesting
            ? <><Loader2 size={11} className="animate-spin" /> 상상하는 중...</>
            : <><Wand2 size={11} /> AI로 상상 · {SUGGEST_PROMPT_COST}cr</>}
        </button>
      </div>

      <div className="p-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          disabled={disabled}
          placeholder="예) 카메라가 인물의 눈높이에서 천천히 밀려들어가고, 창밖 햇빛이 얼굴을 스치며 표정이 미소로 풀린다"
          className="w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm leading-relaxed resize-y"
        />
        <p className={`text-[11px] font-bold leading-relaxed flex items-start gap-1 ${usingDefault ? 'text-amber-800' : 'text-emerald-700'}`}>
          {/* 세션 안에서 손댔는지로만 구분한다. 새로고침하면 편집 여부는 잊히고
              문구만 스토리보드에 남으므로, 그때도 틀리지 않을 표현을 쓴다. */}
          {usingDefault ? (
            <>
              <AlertCircle size={12} className="shrink-0 mt-0.5" />
              <span>아직 이 화면에서 손대지 않은 문구입니다. 기획 단계의 모션 문구라면 그대로는 의도한 움직임이 안 나올 수 있어요 — 확인하고 필요하면 고치거나 AI에게 맡기세요.</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
              <span>이 내용 그대로 영상 생성에 전달되고, 스토리보드에도 저장됩니다.</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

// =============================================================
//  씬 텍스트 필드 편집기 (한글/영문 토글)
//
//  같은 모양의 블록을 두 군데서 쓴다:
//    · 이미지 프롬프트 — content_kr / image_prompt_en
//    · 대사 · 자막    — script_kr / script_en
//
//  이미지 프롬프트 쪽은 두 필드의 semantic 이 완벽히 같지 않지만, 사용자
//  관점에서는 "이 씬의 프롬프트" 를 한/영 두 언어로 보고 편집하는 게 자연스럽다.
//  Korean-only 리팩터에서 이 이중구조는 재정리 예정 (메모리 참조).
// =============================================================
interface SceneTextEditorProps {
  scene: Scene;
  title: string;
  koField: 'content_kr' | 'script_kr';
  enField: 'image_prompt_en' | 'script_en';
  placeholderKo: string;
  placeholderEn: string;
  /** 펼쳤을 때 하단에 붙는 안내. 저장 상태 문구를 대체한다. */
  savedHint: string;
  /** 대사처럼 길이가 곧 영상 길이 판단으로 이어지는 필드에서 켠다 */
  showReadingTime?: boolean;
  onPatch: (patch: Partial<Scene>) => void;
}
const SceneTextEditor: React.FC<SceneTextEditorProps> = ({
  scene, title, koField, enField, placeholderKo, placeholderEn, savedHint, showReadingTime, onPatch,
}) => {
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  const field = lang === 'ko' ? koField : enField;
  const current = (scene[field] ?? '') as string;

  // scene 이 바뀌면 draft 리셋
  useEffect(() => {
    setDraft(current);
    setDirty(false);
  }, [scene.id, current]);

  const save = () => {
    onPatch({ [field]: draft.trim() } as Partial<Scene>);
    setDirty(false);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-100 bg-zinc-50">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{title}</span>
        {/* 언어 토글 */}
        <div className="flex gap-0.5 p-0.5 bg-white rounded-lg border border-zinc-200 ml-1">
          {(['ko', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2 py-0.5 rounded text-[10px] font-black transition-colors ${
                lang === l ? 'bg-primary text-white' : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {l === 'ko' ? '한글' : '영문'}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-zinc-400 ml-auto">{field}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-primary font-bold hover:underline"
        >
          {expanded ? '접기' : '펼치기'}
        </button>
      </div>
      {expanded ? (
        <div className="p-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
            rows={4}
            placeholder={lang === 'ko' ? placeholderKo : placeholderEn}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-zinc-400">
              {dirty ? '⚠️ 저장 필요' : savedHint}
              {showReadingTime && draft.trim() && (
                <span className="ml-1.5 text-zinc-500 font-bold">· {readingHint(draft)}</span>
              )}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => { setDraft(current); setDirty(false); }}
                disabled={!dirty}
                className="px-2.5 py-1 rounded-md bg-white border border-zinc-200 hover:bg-zinc-50 text-[11px] font-bold text-zinc-700 disabled:opacity-40"
              >
                되돌리기
              </button>
              <button
                onClick={save}
                disabled={!dirty}
                className="px-3 py-1 rounded-md bg-primary hover:bg-[#003E99] text-white text-[11px] font-black disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3">
          <p className="text-xs text-zinc-600 leading-relaxed line-clamp-3">
            {current || <span className="text-zinc-400 italic">비어있음</span>}
          </p>
          {showReadingTime && current.trim() && (
            <p className="mt-1.5 text-[10px] font-bold text-zinc-400">{readingHint(current)}</p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 대사 길이 → 어림 낭독 시간.
 *
 * 5초/10초 중 무엇을 고를지 판단하는 데만 쓰는 값이라 정밀도는 필요 없다.
 * 한국어 나레이션 기준 초당 5자 안팎으로 잡는다. 어림치임을 문구로 못박는다.
 */
function readingHint(text: string): string {
  const chars = text.trim().length;
  const seconds = Math.max(1, Math.round(chars / 5));
  return `${chars}자 · 낭독 약 ${seconds}초(어림)`;
}

// =============================================================
//  씬 카드 (a) 액션 선택 상태
// =============================================================
interface SceneActionPickerProps {
  scene: Scene;
  upscaleStatus: UpscaleStatus;
  upscaleProgress: number;
  upscaled: boolean;
  generating: boolean;
  failed: boolean;
  failedError?: string;
  settings: SceneSettings;
  /** 스토리보드 모션 문구 (편집값이 없을 때의 기본) */
  fallbackVideoPrompt: string;
  suggesting: boolean;
  onSuggestPrompt: () => void;
  /** 모션 프롬프트 전용 — 세션 설정과 스토리보드 JSON 양쪽에 반영한다 */
  onPromptChange: (text: string) => void;
  onUpscale: () => void;
  onOpenEditor: () => void;
  /** 이미지 프롬프트 편집 반영 (image_prompt_en 또는 content_kr 필드) */
  onPatchScene: (patch: Partial<Scene>) => void;
}
const SceneActionPicker: React.FC<SceneActionPickerProps> = ({
  scene, upscaleStatus, upscaleProgress, upscaled, generating, failed, failedError,
  settings, fallbackVideoPrompt, suggesting, onSuggestPrompt, onPromptChange,
  onUpscale, onOpenEditor, onPatchScene,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-5">
      {/* 좌: START 프레임 + 이미지 프롬프트 (편집 가능 · 언어 토글) */}
      <div className="space-y-3">
        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">START 프레임 (씬 이미지)</div>
        <div className="aspect-video rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center">
          {scene.image_url ? (
            <img src={scene.image_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="text-center space-y-2 text-zinc-500 text-xs">
              <AlertCircle className="w-8 h-8 mx-auto" />
              씬 이미지가 없습니다
            </div>
          )}
        </div>
        <SceneTextEditor
          scene={scene}
          title="이미지 프롬프트"
          koField="content_kr"
          enField="image_prompt_en"
          placeholderKo="이 씬의 한국어 설명"
          placeholderEn="이미지 생성용 영문 프롬프트"
          savedHint="저장됨 · 스토리보드 재생성 시 이 프롬프트 사용"
          onPatch={onPatchScene}
        />
        {/* 대사 — 영상 길이(5초/10초)와 자막·더빙의 기준이라 여기서도 보여야 한다.
            예전에는 정밀 제작 화면 어디에도 대사가 없어서, 대사를 확인하려면
            스토리보드 단계로 되돌아가야 했다. */}
        <SceneTextEditor
          scene={scene}
          title="대사 · 자막"
          koField="script_kr"
          enField="script_en"
          placeholderKo="이 씬에서 나올 대사 또는 자막"
          placeholderEn="Dialogue or subtitle for this scene"
          savedHint="저장됨 · 자막·더빙에 이 대사를 씁니다"
          showReadingTime
          onPatch={onPatchScene}
        />
        {/* 이미지 프롬프트와 나란히 — 영상 결과를 가르는 건 이쪽이다 */}
        <VideoPromptEditor
          value={settings.prompt}
          fallback={fallbackVideoPrompt}
          hasEndFrame={!!settings.endImage}
          hasImage={!!scene.image_url}
          suggesting={suggesting}
          disabled={generating}
          onChange={onPromptChange}
          onSuggest={onSuggestPrompt}
        />
      </div>

      {/* 우: 액션 3개 */}
      <div className="space-y-3">
        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">이 씬으로 무엇을 할까요?</div>

        {/* 1) 업스케일 */}
        <UpscaleActionButton
          status={upscaleStatus}
          upscaled={upscaled}
          progress={upscaleProgress}
          disabled={!scene.image_url}
          onClick={onUpscale}
        />

        {/* 2) 가벼운 편집 (준비중) */}
        <button
          disabled
          title="줌·팬 등 라이트 편집 · 다음 업데이트 예정"
          className="w-full px-4 py-3 rounded-2xl bg-zinc-50 border-2 border-zinc-200 text-zinc-400 font-bold text-sm text-left flex items-center gap-2 cursor-not-allowed"
        >
          <FilmIcon size={16} />
          <span className="flex-1">가벼운 편집</span>
          <span className="text-[10px] font-black">무료 · 준비중</span>
        </button>

        {/* 3) AI 동영상 생성 */}
        <button
          onClick={onOpenEditor}
          disabled={!upscaled || generating}
          className={`w-full px-4 py-3 rounded-2xl border-2 font-bold text-sm text-left flex items-center gap-2 transition-all ${
            !upscaled
              ? 'bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed'
              : generating
                ? 'bg-primary/10 border-primary/30 text-primary cursor-wait'
                : 'bg-primary text-white border-primary hover:bg-[#003E99] cursor-pointer shadow-[0_4px_12px_rgba(0,80,191,0.2)]'
          }`}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
          <span className="flex-1">AI 동영상 생성</span>
          <span className="text-[10px] font-black">
            {!upscaled ? '업스케일 먼저' : generating ? '생성 중' : '30cr~'}
          </span>
        </button>

        {failed && failedError && (
          <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-800">
            생성 실패: {failedError}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================
//  업스케일 액션 버튼 (상태별 표시)
// =============================================================
interface UpscaleActionButtonProps {
  status: UpscaleStatus;
  upscaled: boolean;
  progress: number;
  disabled: boolean;
  onClick: () => void;
}
const UpscaleActionButton: React.FC<UpscaleActionButtonProps> = ({ status, upscaled, progress, disabled, onClick }) => {
  if (upscaled) {
    return (
      <button
        disabled
        className="w-full px-4 py-3 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-bold text-sm text-left flex items-center gap-2 cursor-default"
      >
        <CheckCircle2 size={16} />
        <span className="flex-1">이미지 업스케일 (완료)</span>
        <span className="text-[10px] font-black">2K · 3cr 사용됨</span>
      </button>
    );
  }
  if (status === 'running') {
    return (
      <div className="w-full px-4 py-3 rounded-2xl bg-amber-50 border-2 border-amber-200 space-y-2">
        <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
          <Loader2 size={14} className="animate-spin" />
          <span className="flex-1">업스케일 중...</span>
          <span className="text-[10px] font-black">~15초</span>
        </div>
        <div className="h-1.5 rounded-full bg-amber-100 overflow-hidden">
          <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-2xl bg-red-50 border-2 border-red-200 text-red-700 font-bold text-sm text-left flex items-center gap-2 disabled:opacity-50"
      >
        <AlertCircle size={16} />
        <span className="flex-1">업스케일 실패 · 다시 시도</span>
        <span className="text-[10px] font-black">3cr</span>
      </button>
    );
  }
  // idle
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 border-2 border-amber-500 text-white font-bold text-sm text-left flex items-center gap-2 shadow-[0_4px_12px_rgba(245,158,11,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <ImageUp size={16} />
      <span className="flex-1">이미지 업스케일</span>
      <span className="text-[10px] font-black">3cr</span>
    </button>
  );
};

// =============================================================
//  씬 카드 (b) 편집기 전개 상태
// =============================================================
interface SceneEditorProps {
  scene: Scene;
  settings: SceneSettings;
  upscaleStatus: UpscaleStatus;
  job?: VideoJob;
  nextSceneImage?: string;
  language: 'ko' | 'en';
  displayPrompts: { image: string; video: string };
  modelLabel: string;
  cost: number;
  /** 이미 결과 영상이 있는 씬을 다시 만드는 중인지 */
  isRetake: boolean;
  /** 모션 프롬프트 전용 — 세션 설정과 스토리보드 JSON 양쪽에 반영한다 */
  onPromptChange: (text: string) => void;
  suggesting: boolean;
  onSuggestPrompt: () => void;
  onBack: () => void;
  onPatch: (patch: Partial<SceneSettings>) => void;
  onGenerate: () => void;
  onOpenLibrary: () => void;
}
const SceneEditor: React.FC<SceneEditorProps> = ({
  scene, settings, upscaleStatus, job, nextSceneImage, language, displayPrompts,
  modelLabel, cost, isRetake, onPromptChange, suggesting, onSuggestPrompt, onBack, onPatch, onGenerate, onOpenLibrary,
}) => {
  const generating = job?.status === 'generating';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  /** 아직 손대지 않아 스토리보드 모션 문구를 그대로 쓰는 상태 */
  const usingStoryboardDefault = settings.prompt === null || !settings.prompt.trim();

  // 다시 만들기로 들어왔으면 프롬프트로 바로 커서를 보낸다 — 여기가 고칠 곳이다.
  useEffect(() => {
    if (!isRetake) return;
    const el = promptRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [isRetake]);

  const handleEndFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onPatch({ endImage: reader.result as string });
    reader.readAsDataURL(file);
  };

  const promptValue = settings.prompt !== null ? settings.prompt : displayPrompts.video;

  return (
    <div className="space-y-4">
      {/* 뒤로 */}
      <button
        onClick={onBack}
        disabled={generating}
        className="text-xs font-bold text-zinc-500 hover:text-primary flex items-center gap-1 disabled:opacity-40"
      >
        {isRetake ? '‹ 결과 영상으로 돌아가기' : '‹ 방식 다시 고르기'}
      </button>

      {/* 업스케일 상태바 (안전 재확인) */}
      {upscaleStatus === 'done' && (
        <div className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center gap-2">
          <CheckCircle2 size={12} /> 업스케일 완료 · 시작 프레임 준비됨
        </div>
      )}

      {/* START ─ 5초 모션 ─ END */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_60px_1fr] gap-3 items-start">
        {/* START */}
        <div>
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">START · 씬 이미지</div>
          <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900 border-2 border-primary/30">
            {scene.image_url ? (
              <img src={scene.image_url} alt="" className="w-full h-full object-contain" />
            ) : null}
          </div>
        </div>

        {/* 화살표 */}
        <div className="hidden md:flex items-center justify-center pt-8 text-zinc-400">
          <span className="text-xs font-bold">→</span>
        </div>

        {/* END */}
        <div>
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
            END · 끝 프레임 (선택 · Pro 승격)
          </div>
          {settings.endImage ? (
            <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900 border-2 border-zinc-300 relative">
              <img src={settings.endImage} alt="" className="w-full h-full object-contain" />
              <button
                onClick={() => onPatch({ endImage: undefined })}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center"
                title="END 프레임 제거"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="aspect-video rounded-xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-2.5 p-3 bg-zinc-50">
              {nextSceneImage && (
                <button
                  onClick={() => onPatch({ endImage: nextSceneImage })}
                  className="px-3 py-1.5 rounded-lg bg-white border border-primary/30 text-sm font-bold text-primary hover:bg-primary hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span className="text-base leading-none">+</span> 다음 씬 이미지
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-sm font-bold text-zinc-700 hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <Upload size={14} /> 파일
              </button>
              <button
                onClick={onOpenLibrary}
                className="px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-sm font-bold text-zinc-700 hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <Package size={14} /> 보관함
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEndFile(f); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── 영상 프롬프트 — 이 화면의 주인공 ──
          결과를 가르는 건 사실상 이 한 칸이다. 스토리보드의 모션 문구는 이미지
          기획용이라 그대로 쓰면 의도한 씬이 거의 안 나온다. 그래서 크게 띄우고,
          손대지 않았으면 그 사실을 눈에 띄게 알린다. */}
      <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
            <Video size={14} className="text-primary" />
            영상 프롬프트 ({language === 'ko' ? '한국어' : 'English'})
          </label>
          {isRetake && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-black">
              다시 만들기
            </span>
          )}
          <button
            type="button"
            onClick={onSuggestPrompt}
            disabled={suggesting || generating || !scene.image_url}
            className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-primary/40 text-primary text-xs font-black hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-primary transition-colors flex items-center gap-1.5"
            title={settings.endImage
              ? `START·END 두 프레임을 보고 전환 프롬프트를 씁니다 (${SUGGEST_PROMPT_COST}cr)`
              : `시작 프레임을 보고 영상 프롬프트를 씁니다 (${SUGGEST_PROMPT_COST}cr)`}
          >
            {suggesting
              ? <><Loader2 size={13} className="animate-spin" /> 상상하는 중...</>
              : <><Wand2 size={13} /> AI로 프롬프트 상상 · {SUGGEST_PROMPT_COST}cr</>}
          </button>
        </div>

        <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
          {settings.endImage
            ? 'END 프레임이 있으므로 두 프레임 사이의 움직임을 쓰는 게 좋습니다. AI 상상은 두 장을 같이 보고 전환을 서술합니다.'
            : '카메라 움직임 · 피사체 동작 · 분위기 변화를 적을수록 결과가 의도에 가까워집니다.'}
        </p>

        {/* 이 씬의 대사 — 길이(5초/10초)와 인물 동작을 정하는 근거라 옆에 둔다.
            읽기 전용이다. 대사 수정은 액션 화면(대사 · 자막)에서 한다. */}
        {(scene.script_kr || scene.script_en) && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-white/70 border border-zinc-200">
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">이 씬의 대사</div>
            <p className="mt-0.5 text-xs text-zinc-700 leading-relaxed">
              {(language === 'ko' ? scene.script_kr : scene.script_en) || scene.script_kr || scene.script_en}
            </p>
          </div>
        )}

        <textarea
          ref={promptRef}
          value={promptValue}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={5}
          disabled={generating}
          placeholder="예) 카메라가 인물의 눈높이에서 천천히 밀려들어가고, 창밖 햇빛이 얼굴을 스치며 표정이 미소로 풀린다"
          className="mt-2 w-full px-3 py-2.5 rounded-xl border-2 border-zinc-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm leading-relaxed resize-y"
        />

        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
          {usingStoryboardDefault ? (
            <span className="font-bold text-amber-700 flex items-center gap-1">
              <AlertCircle size={12} className="shrink-0" />
              아직 손대지 않은 문구입니다 — 확인하고 필요하면 고치세요
            </span>
          ) : (
            <span className="font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} className="shrink-0" /> 위 내용 그대로 전송 · 스토리보드에도 저장됨
            </span>
          )}
          <span className={`shrink-0 ${promptValue.length > KLING_PROMPT_MAX ? 'text-red-600 font-black' : 'text-zinc-400'}`}>
            {promptValue.length}/{KLING_PROMPT_MAX}자
          </span>
        </div>
      </div>

      {/* 모델·길이·해상도·비용·생성 */}
      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">모델</div>
            <div className="px-3 py-2 rounded-xl bg-white border border-zinc-200 text-sm font-bold text-zinc-700">
              {modelLabel}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">길이</div>
            <div className="flex gap-1 p-1 bg-white rounded-xl border border-zinc-200">
              {[5, 10].map((d) => (
                <button
                  key={d}
                  onClick={() => onPatch({ duration: d as VideoDuration })}
                  disabled={generating}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${
                    settings.duration === d ? 'bg-primary text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">해상도</div>
            <div className="flex gap-1 p-1 bg-white rounded-xl border border-zinc-200">
              {(['720p', '1080p'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => onPatch({ resolution: r })}
                  disabled={generating}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-1 ${
                    settings.resolution === r ? 'bg-primary text-white' : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {r}
                  {r === '1080p' && (
                    <span className={`text-[8px] px-1 rounded font-black ${
                      settings.resolution === r ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                    }`}>PRO</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-lg font-black text-zinc-900">🔥 {cost}cr</span>
            {settings.endImage && (
              <span className="ml-2 text-[10px] text-amber-700 font-bold">END 프레임 → Pro 강제</span>
            )}
          </div>
          <button
            onClick={onGenerate}
            disabled={generating || !promptValue.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-[#1E6FD9] text-white font-black text-sm shadow-[0_4px_12px_rgba(0,80,191,0.25)] disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? <><Loader2 size={16} className="animate-spin" /> 생성 중...</> : <><Sparkles size={16} /> 영상 생성</>}
          </button>
        </div>
      </div>

      {job?.status === 'failed' && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
          생성 실패: {job.error ?? '알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.'}
        </div>
      )}
    </div>
  );
};

// =============================================================
//  플로팅 씬 네비게이션 (우하단)
// =============================================================
interface FloatingSceneNavProps {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}
const FloatingSceneNav: React.FC<FloatingSceneNavProps> = ({ currentIndex, total, onPrev, onNext }) => {
  if (total <= 1) return null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < total - 1;
  return (
    <div className="fixed right-6 bottom-6 z-40 flex flex-col gap-2">
      <button
        onClick={onPrev}
        disabled={!canPrev}
        title="이전 씬 (↑ · K)"
        className="w-12 h-12 rounded-2xl bg-white border border-zinc-200 shadow-xl hover:bg-primary hover:text-white hover:border-primary text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
      >
        <ChevronUp size={18} />
      </button>
      <div className="w-12 h-8 rounded-xl bg-white border border-zinc-200 shadow-xl flex items-center justify-center text-[10px] font-black text-zinc-500">
        {currentIndex + 1}/{total}
      </div>
      <button
        onClick={onNext}
        disabled={!canNext}
        title="다음 씬 (↓ · J)"
        className="w-12 h-12 rounded-2xl bg-white border border-zinc-200 shadow-xl hover:bg-primary hover:text-white hover:border-primary text-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
      >
        <ChevronDown size={18} />
      </button>
    </div>
  );
};

// =============================================================
//  CapCut 편집 패키지 모달
//
//  앱에서 영상을 합치는 대신, CapCut 에서 바로 이어붙일 재료 한 벌을 만든다.
//  여기서 정하는 건 두 가지뿐이다 — 나레이션을 넣을지, 넣는다면 어떤 목소리로.
// =============================================================
interface EditorPackageModalProps {
  scenes: Array<{ order: number; script: string }>;
  balance: number;
  onClose: () => void;
  onConfirm: (options: { voiceId: string; withNarration: boolean }) => void;
}
const EditorPackageModal: React.FC<EditorPackageModalProps> = ({ scenes, balance, onClose, onConfirm }) => {
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE.id);
  const [withNarration, setWithNarration] = useState(true);

  const scripted = scenes.filter((s) => s.script.trim());
  const charCount = scripted.reduce((sum, s) => sum + s.script.trim().length, 0);
  const cost = narrationCreditCost(scenes);
  const tooLong = charCount > NARRATION_MAX_CHARS;
  const noScript = scripted.length === 0;
  const canNarrate = withNarration && !tooLong && !noScript && balance >= cost;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md">
      <div className="bg-white border border-zinc-200 rounded-[2rem] w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><FilmIcon size={20} /></div>
          <div className="flex-1">
            <h3 className="text-lg font-black tracking-tight text-zinc-900">CapCut 편집 패키지</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">씬 {scenes.length}개를 CapCut 에서 이어붙일 재료로 묶습니다</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-1.5 text-xs text-zinc-600">
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">들어가는 것</div>
            <p>· <strong className="text-zinc-800">scene-01.mp4 …</strong> 씬 영상 — 파일명 순서가 곧 편집 순서</p>
            <p>· <strong className="text-zinc-800">subtitles.srt</strong> 자막 · <strong className="text-zinc-800">timeline.txt</strong> 씬별 시작 시각</p>
            <p>· <strong className="text-zinc-800">script.txt</strong> 전체 대사 · <strong className="text-zinc-800">README.txt</strong> 임포트 순서</p>
            {withNarration && <p>· <strong className="text-zinc-800">narration.mp3 + cut-list.txt</strong> 나레이션과 자르는 지점</p>}
          </div>

          {/* 나레이션 */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={withNarration}
                onChange={(e) => setWithNarration(e.target.checked)}
                disabled={noScript}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm font-black text-zinc-900">나레이션도 만들기</span>
              {!noScript && !tooLong && (
                <span className="ml-auto text-xs font-black text-primary">{cost}cr</span>
              )}
            </label>

            {noScript ? (
              <p className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
                대사가 있는 씬이 없습니다. 스토리보드에서 대사를 채우면 나레이션을 만들 수 있어요.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500 leading-relaxed">
                전체 대사 {charCount}자를 <strong>한 번에</strong> 읽습니다. 씬별로 나눠 만들면 같은 목소리라도 톤이 갈리기 때문입니다.
                자르는 지점은 cut-list.txt 에 초 단위로 적어 드립니다.
              </p>
            )}

            {tooLong && !noScript && (
              <p className="mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] font-bold text-red-800">
                대사가 {charCount}자로 한 번에 합성할 수 있는 {NARRATION_MAX_CHARS}자를 넘습니다.
                쪼개 만들면 목소리가 갈리므로 나누지 않습니다 — 대사를 줄이거나 나레이션 없이 내보내세요.
              </p>
            )}

            {withNarration && !noScript && !tooLong && balance < cost && (
              <p className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
                크레딧이 부족합니다 (필요 {cost}cr / 잔액 {balance}cr). 나레이션 없이 내보내집니다.
              </p>
            )}
          </div>

          {/* 목소리 */}
          {canNarrate && (
            <div>
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">목소리</div>
              <div className="grid grid-cols-2 gap-2">
                {VOICE_PRESETS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVoiceId(v.id)}
                    className={`px-3 py-2.5 rounded-xl border-2 text-left text-xs font-bold transition-all ${
                      voiceId === v.id
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-zinc-200 text-zinc-600 hover:border-primary/40'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-100 flex gap-2">
          <button onClick={onClose} className="px-5 py-3 rounded-full bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-bold text-sm">
            취소
          </button>
          <button
            onClick={() => onConfirm({ voiceId, withNarration: canNarrate })}
            className="flex-1 py-3 rounded-full bg-primary hover:bg-[#003E99] text-white font-black text-sm shadow-[0_8px_20px_rgba(0,80,191,0.25)] flex items-center justify-center gap-2"
          >
            <DownloadCloud size={16} />
            패키지 만들기{canNarrate ? ` · ${cost}cr` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================
//  전체 생성 모달
// =============================================================
interface GenerateAllModalProps {
  scenes: Scene[];
  settingsFor: (sceneId: string) => SceneSettings;
  onClose: () => void;
  onConfirm: (targetScenes: Scene[]) => void;
  balance: number;
}
const GenerateAllModal: React.FC<GenerateAllModalProps> = ({ scenes, settingsFor, onClose, onConfirm, balance }) => {
  // 이미 완료된 씬은 기본 unchecked, 미완료는 checked
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    scenes.forEach((s) => { init[s.id] = !s.video_url; });
    return init;
  });
  const [chosenResolution, setChosenResolution] = useState<VideoResolution>('720p');

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const targetScenes = scenes.filter((s) => checked[s.id]);
  const totalCost = targetScenes.reduce((sum, s) => {
    const ss = settingsFor(s.id);
    const videoCost = videoStudioCreditCost({
      durationSec: ss.duration,
      // 모달에서 선택한 해상도를 우선 적용 (미리보기용) — 실제 실행 시 각 씬 설정 그대로
      resolution: chosenResolution,
      hasEndFrame: !!ss.endImage,
    });
    const upscaleCost = s.upscale_level ? 0 : IMAGE_UPSCALE_COST;
    return sum + videoCost + upscaleCost;
  }, 0);

  const canProceed = targetScenes.length > 0 && balance >= totalCost;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-zinc-900">선택한 씬 영상 생성</h3>
            <p className="text-xs text-zinc-500 mt-0.5">모델과 씬을 확인한 뒤 생성을 시작합니다.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* 1단계: 모델 선택 */}
          <div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">1단계 · 모델</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setChosenResolution('720p')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  chosenResolution === '720p' ? 'border-primary bg-primary/5' : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="text-sm font-black text-zinc-900">{MODEL_LABEL_STD}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">30cr / 5초 · 720p</div>
              </button>
              <button
                onClick={() => setChosenResolution('1080p')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  chosenResolution === '1080p' ? 'border-primary bg-primary/5' : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="text-sm font-black text-zinc-900">{MODEL_LABEL_PRO}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">60cr / 5초 · 1080p · END 프레임</div>
              </button>
              <button
                disabled
                className="p-3 rounded-xl border-2 border-zinc-200 bg-zinc-50 text-left cursor-not-allowed opacity-60"
              >
                <div className="text-sm font-black text-zinc-500">코드 모션</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">준비 중</div>
              </button>
            </div>
          </div>

          {/* 2단계: 씬 확인 */}
          <div>
            <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">2단계 · 씬 확인</div>
            <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 max-h-80 overflow-y-auto">
              {scenes.map((s, i) => {
                const ss = settingsFor(s.id);
                const videoCost = videoStudioCreditCost({
                  durationSec: ss.duration, resolution: chosenResolution, hasEndFrame: !!ss.endImage,
                });
                const needsUpscale = !s.upscale_level;
                const rowCost = videoCost + (needsUpscale ? IMAGE_UPSCALE_COST : 0);
                const done = !!s.video_url;
                return (
                  <label key={s.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[s.id]}
                      onChange={(e) => setChecked((c) => ({ ...c, [s.id]: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-bold text-zinc-800 w-14">씬 {i + 1}</span>
                    <span className="flex-1 text-xs text-zinc-500 truncate">{s.content_kr || s.image_prompt_en}</span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500 shrink-0">
                      {done && <span className="text-emerald-600 font-black">이미 완료 · 체크하면 다시 생성</span>}
                      {needsUpscale && !done && <span className="text-amber-700 font-black">+{IMAGE_UPSCALE_COST}cr (업스케일)</span>}
                    </span>
                    <span className="text-sm font-black text-zinc-900 tabular-nums shrink-0">{rowCost}cr</span>
                  </label>
                );
              })}
            </div>
          </div>

          {targetScenes.some((s) => !!s.video_url) && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
              ⚠️ 다시 만들면 기존 영상이 <strong>교체</strong>됩니다. (현재는 씬당 결과 1개만 유지. 여러 테이크 지원은 다음 업데이트 예정.)
            </div>
          )}
        </div>

        {/* 하단 합계 · 액션 */}
        <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            선택 <strong className="text-zinc-900">{targetScenes.length}</strong>개 · 합계 <strong className="text-zinc-900">{totalCost}cr</strong> · 잔액 <strong className="text-zinc-900">{balance}cr</strong>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-zinc-200 hover:bg-zinc-50 text-sm font-bold text-zinc-700">
              취소
            </button>
            <button
              onClick={() => onConfirm(targetScenes)}
              disabled={!canProceed}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-[#003E99] text-white text-sm font-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Rocket size={14} /> 생성 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionModeB;
