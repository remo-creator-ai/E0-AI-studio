import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n';
import { AdDuration, VisualStyle, StoryboardLayout } from '../types';

export type VideoEngine = 'kling' | 'veo31';
export type ImageFormat = 'png' | 'jpeg';
export type FilenameRule = 'project_cut' | 'auto';

interface SettingsState {
  // AI Engine
  defaultVideoEngine: VideoEngine;

  // Project Defaults
  defaultDuration: AdDuration;
  defaultStyle: VisualStyle;
  defaultLayout: StoryboardLayout;
  defaultLanguage: 'ko' | 'en';

  // Export
  pdfWatermark: boolean;
  imageFormat: ImageFormat;
  imageQuality: number;
  filenameRule: FilenameRule;

  // Onboarding
  onboardingCompleted: Record<string, boolean>;
  _replayTourId: string | null;

  // Actions
  update: (updates: Partial<Omit<SettingsState, 'update' | 'setLanguage' | 'markTourCompleted' | 'resetOnboarding' | 'resetTour' | 'requestTourReplay' | '_clearReplayRequest'>>) => void;
  setLanguage: (lang: 'ko' | 'en') => void;
  markTourCompleted: (tourId: string) => void;
  resetTour: (tourId: string) => void;
  resetOnboarding: () => void;
  requestTourReplay: (tourId: string) => void;
  _clearReplayRequest: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultVideoEngine: 'kling',

      defaultDuration: AdDuration.S15,
      defaultStyle: VisualStyle.CINEMATIC,
      defaultLayout: StoryboardLayout.GRID_2X5,
      defaultLanguage: (i18n.language?.startsWith('ko') ? 'ko' : 'en') as 'ko' | 'en',

      pdfWatermark: true,
      imageFormat: 'png',
      imageQuality: 90,
      filenameRule: 'project_cut',
      onboardingCompleted: {},
      _replayTourId: null,

      update: (updates) => set((state) => ({ ...state, ...updates })),
      setLanguage: (lang: 'ko' | 'en') => {
        i18n.changeLanguage(lang);
        localStorage.setItem('e0-language', lang);
        set({ defaultLanguage: lang });
      },
      markTourCompleted: (tourId: string) => set((state) => ({
        onboardingCompleted: { ...state.onboardingCompleted, [tourId]: true }
      })),
      resetTour: (tourId: string) => set((state) => {
        const updated = { ...state.onboardingCompleted };
        delete updated[tourId];
        return { onboardingCompleted: updated };
      }),
      resetOnboarding: () => set({ onboardingCompleted: {} }),
      requestTourReplay: (tourId: string) => set((state) => {
        const updated = { ...state.onboardingCompleted };
        delete updated[tourId];
        return { onboardingCompleted: updated, _replayTourId: tourId };
      }),
      _clearReplayRequest: () => set({ _replayTourId: null }),
    }),
    {
      name: 'remo-settings',
      // Legacy persisted defaults must not override the actual interface language.
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<SettingsState>),
        defaultLanguage: i18n.language === 'en' ? 'en' : 'ko' }),
    }
  )
);
