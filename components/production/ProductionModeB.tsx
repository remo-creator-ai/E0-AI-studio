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
  DownloadCloud, ImageUp, Loader2, Package, Play, RefreshCw, Rocket, Sparkles, Trash2,
  Upload, Video, X, AlertCircle, Wand2, Film as FilmIcon,
} from 'lucide-react';
import JSZip from 'jszip';
import { useStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { useCreditStore } from '../../store/creditStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useModal } from '../ui/ModalProvider';
import {
  generateStudioVideo, videoStudioCreditCost, detectAspectFromImage,
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
import { AssetLibraryPicker } from '../AssetLibraryPicker';
import { SelfHealingVideo } from '../ui/SelfHealingVideo';
import type { Scene } from '../../types';

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

  // Kling 으로 실제 보낼 프롬프트 — 사용자 편집이 있으면 그 값, 없으면 항상 영문 video_motion_en
  // 한국어 프롬프트 지원은 Korean-only 전환 리팩터에서 정리 예정.
  const buildKlingPrompt = (s: Scene, sceneSettings: SceneSettings): string => {
    const raw = sceneSettings.prompt !== null && sceneSettings.prompt.trim()
      ? sceneSettings.prompt
      : (s.video_motion_en ?? '').trim();
    return clampKlingPrompt(raw);
  };

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

  // ── 업스케일 실행 ──
  const runUpscale = useCallback(async (scene: Scene) => {
    if (!scene.image_url) {
      await alert('업스케일할 원본 이미지가 없습니다. 스토리보드에서 씬 이미지를 먼저 만들어주세요.', { type: 'warning' });
      return;
    }
    if (!hasEnough(IMAGE_UPSCALE_COST)) {
      await alert(`크레딧이 부족합니다. (필요 ${IMAGE_UPSCALE_COST}cr / 잔액 ${balance}cr)`, { type: 'warning' });
      return;
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
      const result = await upscaleSceneImage({ imageUrl: scene.image_url, aspect });
      window.clearInterval(progressTimer);
      if (!result.ok || !result.dataUrl) {
        setUpscaleJobStore(scene.id, 'failed');
        await alert(`업스케일 실패: ${result.message ?? 'unknown'}`, { type: 'error' });
        return;
      }
      await deduct(IMAGE_UPSCALE_COST, `업스케일 (씬 ${scene.order})`);
      updateScene(scene.id, { image_url: result.dataUrl, upscale_level: '2K' });
      setUpscaleJobStore(scene.id, 'done');
      setUpscaleProgressStore(scene.id, 100);
    } catch (e) {
      window.clearInterval(progressTimer);
      setUpscaleJobStore(scene.id, 'failed');
      await alert(`업스케일 실패: ${e instanceof Error ? e.message : String(e)}`, { type: 'error' });
    }
  }, [alert, balance, deduct, hasEnough, updateScene, setUpscaleJobStore, setUpscaleProgressStore]);

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
      const ok = await confirm(
        `씬 ${scene.order} 영상을 만듭니다.\n\n· ${label} · ${s.duration}초 · ${s.resolution}\n· 크레딧 ${cost}cr 차감\n· 소요 1~3분\n\n계속할까요?`,
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
          updateJob(jobId, { status: 'failed', error: result.message ?? '생성 실패' });
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
        updateJob(jobId, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [addJob, alert, balance, buildKlingPrompt, confirm, deduct, getSettings, hasEnough, project?.title, projectTag, updateJob, updateScene, user?.id, addTakeStore, setCardModeStore]);

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
      await alert(`배치 다운로드 실패: ${e instanceof Error ? e.message : String(e)}`, { type: 'error' });
    } finally {
      setBatchDownloading(false);
    }
  }, [selectedScenes, alert, project?.title, updateScene]);

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
    for (const s of scenesNeedingUpscale) {
      // runUpscale 내부에서 hasEnough 재검사, upscale_level 갱신
      // (이 루프 도중 잔액이 부족해지면 각 호출에서 alert 후 중단)
      await runUpscale(s);
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
            onRegenerate={async () => {
              const ok = await confirm(
                `씬 ${idx + 1} 에 새 테이크를 추가합니다.\n\n· 새로 만들면 하단 테이크 스택에 쌓이고 자동으로 대표가 됩니다\n· 기존 테이크는 계속 보관되며 클릭해서 대표를 바꿀 수 있어요\n· 브라우저 새로고침 시 이 세션의 추가 테이크는 사라지고 대표 하나만 유지됩니다 (영구 저장은 다음 업데이트)\n\n계속할까요?`,
              );
              if (ok) runGenerate(scene, { skipConfirm: true });
            }}
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

      {/* ══════════ 전체 생성 모달 ══════════ */}
      {showBatchModal && (
        <GenerateAllModal
          scenes={selectedScenes}
          settingsFor={getSettings}
          onClose={() => setShowBatchModal(false)}
          onConfirm={async (targetScenes) => {
            setShowBatchModal(false);
            // 순차 실행 (완전 병렬은 Kling rate limit 문제 소지)
            for (const s of targetScenes) {
              if (!isUpscaled(s)) {
                // 자동 업스케일 먼저
                await runUpscale(s);
              }
              await runGenerate(s, { skipConfirm: true });
              // 다음 잡 시작 전 짧게 대기 (rate limit 여유)
              await new Promise((r) => setTimeout(r, 200));
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
  onPatchScene: (patch: Partial<Scene>) => void;
  takes: SceneTake[];
  mainTakeId?: string;
  onSelectMainTake: (takeId: string) => void;
  onUpscale: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onOpenLibraryForEnd: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({
  scene, videoUrl, onHealed, index, total, selected, cardMode, settings, upscaleStatus, upscaleProgress,
  job, nextSceneImage, language, displayPrompts, takes, mainTakeId, onSelectMainTake,
  onToggleSelect, onSetMode, onPatchSettings, onPatchScene, onUpscale, onGenerate, onRegenerate, onOpenLibraryForEnd,
  onPrev, onNext,
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
        {done ? (
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
        ) : cardMode === 'editor' ? (
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
            onBack={() => onSetMode('idle')}
            onPatch={onPatchSettings}
            onGenerate={onGenerate}
            onOpenLibrary={onOpenLibraryForEnd}
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
          <button
            onClick={onRegenerate}
            className="w-full px-4 py-3 rounded-2xl bg-white border-2 border-zinc-200 text-zinc-700 font-black text-sm hover:bg-zinc-50 flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} /> 한 번 더 만들기 · {regenerateCost}cr
          </button>
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
          </div>
        </div>
      </details>
    </div>
  );
};

// =============================================================
//  이미지 프롬프트 편집기 (한글/영문 토글)
//
//  Scene 필드 매핑:
//    - image_prompt_en: 이미지 생성용 영문 프롬프트 (Gemini/Imagen 이 실제로 씀)
//    - content_kr: 씬 콘텐츠 설명 (한국어 · 사용자 이해용)
//
//  두 필드가 semantic 이 완벽히 같지 않지만, 사용자 관점에서는
//  "이 씬의 프롬프트" 를 한/영 두 언어로 보고 편집하는 게 자연스럽다.
//  Korean-only 리팩터에서 이 이중구조는 재정리 예정 (메모리 참조).
// =============================================================
interface ImagePromptEditorProps {
  scene: Scene;
  onPatch: (patch: Partial<Scene>) => void;
}
const ImagePromptEditor: React.FC<ImagePromptEditorProps> = ({ scene, onPatch }) => {
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  // scene 이 바뀌면 draft 리셋
  useEffect(() => {
    setDraft(lang === 'ko' ? (scene.content_kr ?? '') : (scene.image_prompt_en ?? ''));
    setDirty(false);
  }, [scene.id, scene.content_kr, scene.image_prompt_en, lang]);

  const save = () => {
    const patch: Partial<Scene> = lang === 'ko'
      ? { content_kr: draft.trim() }
      : { image_prompt_en: draft.trim() };
    onPatch(patch);
    setDirty(false);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-100 bg-zinc-50">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">이미지 프롬프트</span>
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
        <span className="text-[10px] text-zinc-400 ml-auto">
          {lang === 'ko' ? 'content_kr' : 'image_prompt_en'}
        </span>
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
            placeholder={lang === 'ko' ? '이 씬의 한국어 설명' : '이미지 생성용 영문 프롬프트'}
            className="w-full px-3 py-2 rounded-lg border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">
              {dirty ? '⚠️ 저장 필요' : '저장됨 · 스토리보드 재생성 시 이 프롬프트 사용'}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  setDraft(lang === 'ko' ? (scene.content_kr ?? '') : (scene.image_prompt_en ?? ''));
                  setDirty(false);
                }}
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
        <p className="p-3 text-xs text-zinc-600 leading-relaxed line-clamp-3">
          {(lang === 'ko' ? scene.content_kr : scene.image_prompt_en) || <span className="text-zinc-400 italic">비어있음</span>}
        </p>
      )}
    </div>
  );
};

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
  onUpscale: () => void;
  onOpenEditor: () => void;
  /** 이미지 프롬프트 편집 반영 (image_prompt_en 또는 content_kr 필드) */
  onPatchScene: (patch: Partial<Scene>) => void;
}
const SceneActionPicker: React.FC<SceneActionPickerProps> = ({
  scene, upscaleStatus, upscaleProgress, upscaled, generating, failed, failedError, onUpscale, onOpenEditor, onPatchScene,
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
        <ImagePromptEditor scene={scene} onPatch={onPatchScene} />
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
  onBack: () => void;
  onPatch: (patch: Partial<SceneSettings>) => void;
  onGenerate: () => void;
  onOpenLibrary: () => void;
}
const SceneEditor: React.FC<SceneEditorProps> = ({
  scene, settings, upscaleStatus, job, nextSceneImage, language, displayPrompts,
  modelLabel, cost, onBack, onPatch, onGenerate, onOpenLibrary,
}) => {
  const generating = job?.status === 'generating';
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        ‹ 방식 다시 고르기
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

      {/* 프롬프트 (한 언어) */}
      <div>
        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
          영상 프롬프트 ({language === 'ko' ? '한국어' : 'English'})
        </label>
        <textarea
          value={promptValue}
          onChange={(e) => onPatch({ prompt: e.target.value })}
          rows={3}
          disabled={generating}
          className="mt-1.5 w-full px-3 py-2 rounded-xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
          <span>
            {settings.prompt !== null && settings.prompt.trim()
              ? '편집됨 · 위 내용 그대로 전송'
              : '기본 · 원본 씬 모션(video_motion_en) 전송'}
          </span>
          <span className={promptValue.length > KLING_PROMPT_MAX ? 'text-red-600 font-black' : ''}>
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
          생성 실패: {job.error ?? 'unknown'}
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
