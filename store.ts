
import { create } from 'zustand';
import { ProjectStep, Project, AdDuration, VisualStyle, Scene, StoryboardLayout, AspectRatio, SceneCount } from './types';

/** 이미지 생성 화면 진입 시 자동 프리로드할 참고 이미지 힌트.
 *  자산 보관함 상세 모달의 "여기서부터 생성" 버튼이 세팅하고,
 *  ImageStudio 가 마운트 useEffect 에서 소비 후 즉시 초기화한다. */
export interface PendingImageStudioRef {
  assetId: string;
  primaryUrl: string;    // signed URL — ImageStudio 에서 fetch 해 dataUrl 로 바꾼다
  name: string;
}

interface AppState {
  currentStep: ProjectStep;
  project: Project | null;
  isLoading: boolean;
  newProjectConfig: { aspectRatio: AspectRatio; sceneCount: SceneCount } | null;
  pendingImageStudioRef: PendingImageStudioRef | null;
  setStep: (step: ProjectStep) => void;
  setProject: (project: Project | null) => void;
  setIsLoading: (loading: boolean) => void;
  setNewProjectConfig: (config: { aspectRatio: AspectRatio; sceneCount: SceneCount } | null) => void;
  setPendingImageStudioRef: (ref: PendingImageStudioRef | null) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => void;
  reorderScenes: (scenes: Scene[]) => void;
  updateProjectSettings: (updates: Partial<Project>) => void;
  updateCurrentStage: (stage: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  currentStep: ProjectStep.DASHBOARD,
  project: null,
  isLoading: false,
  newProjectConfig: null,
  pendingImageStudioRef: null,
  setStep: (step) => set({ currentStep: step }),
  setProject: (project) => set({ project }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setNewProjectConfig: (config) => set({ newProjectConfig: config }),
  setPendingImageStudioRef: (ref) => set({ pendingImageStudioRef: ref }),
  updateScene: (sceneId, updates) => set((state) => {
    if (!state.project) return state;
    const newScenes = state.project.scenes.map(s => 
      s.id === sceneId ? { ...s, ...updates } : s
    );
    return { project: { ...state.project, scenes: newScenes } };
  }),
  reorderScenes: (scenes) => set((state) => {
    if (!state.project) return state;
    return { project: { ...state.project, scenes } };
  }),
  updateProjectSettings: (updates) => set((state) => {
    if (!state.project) return state;
    return { project: { ...state.project, ...updates } };
  }),
  updateCurrentStage: (stage: string) => {
    const project = get().project;
    if (project) {
      set({ project: { ...project, current_stage: stage } });
    }
  },
}));
