// =============================================================
//  모드 B 세션 상태 (프로젝트 이탈해도 유지)
//
//  로컬 useState 로 두면 사용자가 다른 페이지 갔다 오면 씬별 설정
//  (duration/resolution/END 프레임/편집한 프롬프트)·카드 모드·체크박스
//  선택이 전부 리셋된다. 이 스토어로 세션 안에서는 유지된다.
//
//  프로젝트를 바꾸면 이전 프로젝트 상태를 완전히 밀고 새로 시작한다
//  (씬 ID 가 프로젝트마다 달라 유지해봐야 매칭되지 않음).
//
//  scene.upscale_level 과 scene.video_url 은 이미 project autosave 로
//  영구 저장되므로 여기 캐시하지 않는다. 이 스토어는 순수 UI 세션 상태만.
// =============================================================

import { create } from 'zustand';
import type { VideoDuration, VideoResolution } from '../services/videoStudioService';

export interface SceneSettings {
  /** 사용자가 편집한 프롬프트. null 이면 원본 video_motion_en 사용. */
  prompt: string | null;
  duration: VideoDuration;
  resolution: VideoResolution;
  endImage?: string;
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  prompt: null,
  duration: 5,
  resolution: '720p',
};

export type CardMode = 'idle' | 'editor';
export type UpscaleStatus = 'idle' | 'running' | 'done' | 'failed';

interface ModeBState {
  /** 현재 캐시된 프로젝트 id (변경 감지용) */
  projectId: string | null;
  settings: Record<string, SceneSettings>;
  cardMode: Record<string, CardMode>;
  selected: Record<string, boolean>;
  upscaleJobs: Record<string, UpscaleStatus>;
  upscaleProgress: Record<string, number>;
  activeSceneId: string | null;

  /** 프로젝트 진입 시 호출 · 다른 프로젝트로 전환하면 모든 씬 상태 리셋 */
  ensureProject: (projectId: string, defaultSelected: Record<string, boolean>, defaultActiveId: string | null) => void;

  patchSettings: (sceneId: string, patch: Partial<SceneSettings>) => void;
  setCardMode: (sceneId: string, mode: CardMode) => void;
  toggleSelect: (sceneId: string) => void;
  setAllSelected: (map: Record<string, boolean>) => void;
  setUpscaleJob: (sceneId: string, status: UpscaleStatus) => void;
  setUpscaleProgress: (sceneId: string, progress: number) => void;
  setActiveSceneId: (sceneId: string | null) => void;
}

export const useModeBState = create<ModeBState>((set, get) => ({
  projectId: null,
  settings: {},
  cardMode: {},
  selected: {},
  upscaleJobs: {},
  upscaleProgress: {},
  activeSceneId: null,

  ensureProject: (projectId, defaultSelected, defaultActiveId) => {
    if (get().projectId === projectId) return;
    // 프로젝트 전환 → 전체 초기화 (씬 ID 가 겹치지 않음)
    set({
      projectId,
      settings: {},
      cardMode: {},
      selected: defaultSelected,
      upscaleJobs: {},
      upscaleProgress: {},
      activeSceneId: defaultActiveId,
    });
  },

  patchSettings: (sceneId, patch) =>
    set((s) => ({
      settings: {
        ...s.settings,
        [sceneId]: { ...(s.settings[sceneId] ?? DEFAULT_SCENE_SETTINGS), ...patch },
      },
    })),

  setCardMode: (sceneId, mode) =>
    set((s) => ({ cardMode: { ...s.cardMode, [sceneId]: mode } })),

  toggleSelect: (sceneId) =>
    set((s) => ({ selected: { ...s.selected, [sceneId]: !s.selected[sceneId] } })),

  setAllSelected: (map) => set({ selected: map }),

  setUpscaleJob: (sceneId, status) =>
    set((s) => ({ upscaleJobs: { ...s.upscaleJobs, [sceneId]: status } })),

  setUpscaleProgress: (sceneId, progress) =>
    set((s) => ({ upscaleProgress: { ...s.upscaleProgress, [sceneId]: progress } })),

  setActiveSceneId: (sceneId) => set({ activeSceneId: sceneId }),
}));
