import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { ProjectStep } from '../types';

export type TourId =
  | 'dashboard'
  | 'planning'
  | 'visualizing'
  | 'assembly'
  | 'production';

interface TourStepDef {
  element: string;
  titleKey: string;
  descKey: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  mobileSkip?: boolean;
  requiresElement?: boolean;
}

const TOUR_DEFINITIONS: Record<TourId, TourStepDef[]> = {
  dashboard: [
    { element: '[data-tour="dashboard-welcome"]', titleKey: 'onboarding.dashboard.welcome.title', descKey: 'onboarding.dashboard.welcome.desc', side: 'bottom' },
    { element: '[data-tour="sidebar-workflow"]', titleKey: 'onboarding.dashboard.workflow.title', descKey: 'onboarding.dashboard.workflow.desc', side: 'right', mobileSkip: true },
    { element: '[data-tour="dashboard-new-project"]', titleKey: 'onboarding.dashboard.newProject.title', descKey: 'onboarding.dashboard.newProject.desc', side: 'bottom' },
    { element: '[data-tour="dashboard-project-grid"]', titleKey: 'onboarding.dashboard.projectGrid.title', descKey: 'onboarding.dashboard.projectGrid.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="sidebar-credits"]', titleKey: 'onboarding.dashboard.credits.title', descKey: 'onboarding.dashboard.credits.desc', side: 'right', mobileSkip: true },
  ],
  planning: [
    { element: '[data-tour="planning-idea-input"]', titleKey: 'onboarding.planning.ideaInput.title', descKey: 'onboarding.planning.ideaInput.desc', side: 'bottom' },
    { element: '[data-tour="planning-generate-btn"]', titleKey: 'onboarding.planning.generateBtn.title', descKey: 'onboarding.planning.generateBtn.desc', side: 'bottom' },
    { element: '[data-tour="planning-timeline"]', titleKey: 'onboarding.planning.timeline.title', descKey: 'onboarding.planning.timeline.desc', side: 'top', requiresElement: true },
  ],
  visualizing: [
    { element: '[data-tour="visualizing-style"]', titleKey: 'onboarding.visualizing.style.title', descKey: 'onboarding.visualizing.style.desc', side: 'bottom' },
    // 모델에 따라 시트 화질이 크게 달라지는데 그동안 안내가 없었다.
    { element: '[data-tour="visualizing-model"]', titleKey: 'onboarding.visualizing.model.title', descKey: 'onboarding.visualizing.model.desc', side: 'bottom', requiresElement: true },
    { element: '[data-tour="visualizing-matrix"]', titleKey: 'onboarding.visualizing.matrix.title', descKey: 'onboarding.visualizing.matrix.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="visualizing-generate"]', titleKey: 'onboarding.visualizing.generate.title', descKey: 'onboarding.visualizing.generate.desc', side: 'left', requiresElement: true },
  ],
  assembly: [
    { element: '[data-tour="assembly-storyboard"]', titleKey: 'onboarding.assembly.storyboard.title', descKey: 'onboarding.assembly.storyboard.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="assembly-timeline"]', titleKey: 'onboarding.assembly.timeline.title', descKey: 'onboarding.assembly.timeline.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="assembly-export"]', titleKey: 'onboarding.assembly.export.title', descKey: 'onboarding.assembly.export.desc', side: 'left', requiresElement: true },
  ],
  // 4단계는 ProductionStepShell 의 랜딩(모드 선택)에서만 안내한다. 모드에 들어가면
  // 화면이 통째로 바뀌므로 requiresElement 로 자동 스킵되게 둔다.
  production: [
    { element: '[data-tour="production-mode-select"]', titleKey: 'onboarding.production.modeSelect.title', descKey: 'onboarding.production.modeSelect.desc', side: 'bottom', requiresElement: true },
    { element: '[data-tour="production-recommend"]', titleKey: 'onboarding.production.recommend.title', descKey: 'onboarding.production.recommend.desc', side: 'top', requiresElement: true },
  ],
};

/**
 * 단계 → 투어 매핑. Layout 의 '이 페이지 가이드 다시보기' 버튼도 이 값을 쓴다.
 * (예전에는 Layout 이 같은 표를 따로 갖고 있어, 투어를 추가해도 버튼에는 안 뜨는
 *  어긋남이 생겼다. 단일 소스로 둔다.)
 */
export const STEP_TO_TOUR: Partial<Record<ProjectStep, TourId>> = {
  [ProjectStep.DASHBOARD]: 'dashboard',
  [ProjectStep.PLANNING]: 'planning',
  [ProjectStep.VISUALIZING]: 'visualizing',
  [ProjectStep.ASSEMBLY]: 'assembly',
  [ProjectStep.PRODUCTION]: 'production',
};

export function useOnboardingTour() {
  const { t } = useTranslation();
  const currentStep = useStore((s) => s.currentStep);
  const introSurveyStatus = useAuthStore((s) => s.introSurveyStatus);
  const { onboardingCompleted, markTourCompleted, _replayTourId, _clearReplayRequest } = useSettingsStore();
  const driverRef = useRef<ReturnType<typeof import('driver.js').driver> | null>(null);
  const [isActive, setIsActive] = useState(false);
  // Prevents cleanup destroy from re-marking tour as completed
  const suppressCompleteRef = useRef(false);

  const startTour = useCallback(async (tourId: TourId) => {
    const { driver } = await import('driver.js');
    await import('driver.js/dist/driver.css');

    const isMobile = window.innerWidth < 768;
    const defs = TOUR_DEFINITIONS[tourId];

    const steps = defs
      .filter((step) => {
        if (isMobile && step.mobileSkip) return false;
        if (step.requiresElement && !document.querySelector(step.element)) return false;
        return true;
      })
      .map((step) => ({
        element: step.element,
        popover: {
          title: t(step.titleKey),
          description: t(step.descKey),
          side: step.side as 'top' | 'bottom' | 'left' | 'right',
        },
      }));

    if (steps.length === 0) return;

    // Suppress callback when destroying old tour to start fresh
    if (driverRef.current) {
      suppressCompleteRef.current = true;
      driverRef.current.destroy();
      suppressCompleteRef.current = false;
    }

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.75)',
      stagePadding: 8,
      stageRadius: 16,
      popoverClass: 'remo-tour-popover',
      progressText: '{{current}} / {{total}}',
      nextBtnText: t('onboarding.buttons.next'),
      prevBtnText: t('onboarding.buttons.prev'),
      doneBtnText: t('onboarding.buttons.done'),
      onDestroyed: () => {
        if (!suppressCompleteRef.current) {
          markTourCompleted(tourId);
        }
        setIsActive(false);
      },
      steps,
    });

    setIsActive(true);
    driverObj.drive();
    driverRef.current = driverObj;
  }, [t, markTourCompleted]);

  // Direct replay trigger (from sidebar button)
  useEffect(() => {
    if (!_replayTourId) return;
    const tourId = _replayTourId as TourId;
    if (!(tourId in TOUR_DEFINITIONS)) return;
    _clearReplayRequest();
    const timer = setTimeout(() => startTour(tourId), 200);
    return () => clearTimeout(timer);
  }, [_replayTourId, _clearReplayRequest, startTour]);

  // Auto-trigger on step change or onboarding reset
  useEffect(() => {
    if (_replayTourId) return; // Skip when replay is handling it
    const tourId = STEP_TO_TOUR[currentStep];
    if (!tourId) return;
    if (onboardingCompleted[tourId]) return;
    // PRD v1.4 §9.0 — 인트로 설문이 아직 미해결(unknown/pending)이면 온보딩 투어를 지연
    if (tourId === 'dashboard' && introSurveyStatus !== 'done') return;

    const timer = setTimeout(() => {
      const firstStep = TOUR_DEFINITIONS[tourId][0];
      if (firstStep && !document.querySelector(firstStep.element)) return;
      startTour(tourId);
    }, 800);

    return () => {
      clearTimeout(timer);
      // Suppress callback so cleanup doesn't re-mark as completed
      if (driverRef.current) {
        suppressCompleteRef.current = true;
        driverRef.current.destroy();
        suppressCompleteRef.current = false;
        driverRef.current = null;
      }
    };
  }, [currentStep, onboardingCompleted, startTour, _replayTourId, introSurveyStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        suppressCompleteRef.current = true;
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, []);

  return { startTour, isActive };
}
