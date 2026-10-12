
import { create } from 'zustand';
import { ProjectStep, Project, AdDuration, VisualStyle, Scene, StoryboardLayout, AspectRatio, SceneCount } from './types';

interface AppState {
  currentStep: ProjectStep;
  project: Project | null;
  isLoading: boolean;
  newProjectConfig: { aspectRatio: AspectRatio; sceneCount: SceneCount; idea?: string } | null;
  setStep: (step: ProjectStep) => void;
  setProject: (project: Project | null) => void;
  setIsLoading: (loading: boolean) => void;
  setNewProjectConfig: (config: { aspectRatio: AspectRatio; sceneCount: SceneCount; idea?: string } | null) => void;
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
  setStep: (step) => set({ currentStep: step }),
  setProject: (project) => set({ project }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setNewProjectConfig: (config) => set({ newProjectConfig: config }),
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
