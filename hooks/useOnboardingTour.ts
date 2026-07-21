import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { useSettingsStore } from '../store/settingsStore';
import { useSurveyStore } from '../store/surveyStore';
import { ProjectStep } from '../types';

export type TourId = 'dashboard' | 'planning' | 'visualizing' | 'assembly';

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
    { element: '[data-tour="visualizing-matrix"]', titleKey: 'onboarding.visualizing.matrix.title', descKey: 'onboarding.visualizing.matrix.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="visualizing-generate"]', titleKey: 'onboarding.visualizing.generate.title', descKey: 'onboarding.visualizing.generate.desc', side: 'left', requiresElement: true },
  ],
  assembly: [
    { element: '[data-tour="assembly-storyboard"]', titleKey: 'onboarding.assembly.storyboard.title', descKey: 'onboarding.assembly.storyboard.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="assembly-timeline"]', titleKey: 'onboarding.assembly.timeline.title', descKey: 'onboarding.assembly.timeline.desc', side: 'top', requiresElement: true },
    { element: '[data-tour="assembly-export"]', titleKey: 'onboarding.assembly.export.title', descKey: 'onboarding.assembly.export.desc', side: 'left', requiresElement: true },
  ],
};

const STEP_TO_TOUR: Partial<Record<ProjectStep, TourId>> = {
  [ProjectStep.DASHBOARD]: 'dashboard',
  [ProjectStep.PLANNING]: 'planning',
  [ProjectStep.VISUALIZING]: 'visualizing',
  [ProjectStep.ASSEMBLY]: 'assembly',
};

export function useOnboardingTour() {
  const { t } = useTranslation();
  const currentStep = useStore((s) => s.currentStep);
  const { onboardingCompleted, markTourCompleted, _replayTourId, _clearReplayRequest } = useSettingsStore();
  const needsSurvey = useSurveyStore((s) => s.needsSurvey);
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
    // 인트로 설문(§9.0)이 아직 떠 있으면 투어를 미룬다. 설문 제출/건너뛰기로
    // needsSurvey 가 false 가 되면 이 effect 가 재실행되어 투어가 시작된다.
    if (needsSurvey !== false) return;
    const tourId = STEP_TO_TOUR[currentStep];
    if (!tourId) return;
    if (onboardingCompleted[tourId]) return;

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
  }, [currentStep, onboardingCompleted, startTour, _replayTourId, needsSurvey]);

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
