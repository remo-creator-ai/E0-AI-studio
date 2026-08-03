
import React, { Suspense, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { ModalProvider } from './components/ui/ModalProvider';
import { useStore } from './store';
import { useAuthStore } from './store/authStore';
import { useCreditStore } from './store/creditStore';
import { useAutoSave } from './hooks/useAutoSave';
import { ProjectStep } from './types';

const PlanningStep = React.lazy(() => import('./components/PlanningStep').then(m => ({ default: m.PlanningStep })));
const VisualizingStep = React.lazy(() => import('./components/VisualizingStep').then(m => ({ default: m.VisualizingStep })));
const AssemblyStep = React.lazy(() => import('./components/AssemblyStep').then(m => ({ default: m.AssemblyStep })));
const ProductionStep = React.lazy(() => import('./components/ProductionStep').then(m => ({ default: m.ProductionStep })));
const SettingsPage = React.lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AdminPage = React.lazy(() => import('./components/AdminPage').then(m => ({ default: m.AdminPage })));
const AssetLibrary = React.lazy(() => import('./components/AssetLibrary').then(m => ({ default: m.AssetLibrary })));
const ImageStudio = React.lazy(() => import('./components/ImageStudio').then(m => ({ default: m.ImageStudio })));
const VideoStudio = React.lazy(() => import('./components/VideoStudio').then(m => ({ default: m.VideoStudio })));
const OnboardingTour = React.lazy(() => import('./components/ui/OnboardingTour').then(m => ({ default: m.OnboardingTour })));

const App: React.FC = () => {
  const { currentStep, project, updateCurrentStage } = useStore();
  const { user, isAuthLoading, initialize } = useAuthStore();
  const loadCredits = useCreditStore((s) => s.loadCredits);
  const { saveStatus, flush } = useAutoSave();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // 마스터 승인·기타 서버 사이드 변경을 반영하기 위한 크레딧 폴링
  //   - 15초 간격
  //   - 탭이 background 로 이동하면 일시 중단, 다시 활성화되면 즉시 1회 재조회
  useEffect(() => {
    if (!user?.id) return;
    let intervalId: number | undefined;
    const start = () => {
      loadCredits(user.id);
      intervalId = window.setInterval(() => loadCredits(user.id), 15000);
    };
    const stop = () => {
      if (intervalId != null) { window.clearInterval(intervalId); intervalId = undefined; }
    };
    const onVis = () => (document.hidden ? stop() : (stop(), start()));
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [user?.id, loadCredits]);

  // Auto-update current_stage when entering a workflow step
  useEffect(() => {
    const workflowSteps = ['PLANNING', 'VISUALIZING', 'ASSEMBLY', 'PRODUCTION'];
    if (project && workflowSteps.includes(currentStep) && project.current_stage !== currentStep) {
      updateCurrentStage(currentStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // Auth loading
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-zinc-400 font-bold uppercase tracking-widest">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <LandingPage />;
  }

  // Authenticated — all views inside Layout
  const renderContent = () => {
    switch (currentStep) {
      case ProjectStep.DASHBOARD:
        return <Dashboard />;
      case ProjectStep.PLANNING:
        return <PlanningStep />;
      case ProjectStep.VISUALIZING:
        return <VisualizingStep />;
      case ProjectStep.ASSEMBLY:
        return <AssemblyStep />;
      case ProjectStep.PRODUCTION:
        return <ProductionStep />;
      case ProjectStep.IMAGE_STUDIO:
        return <ImageStudio />;
      case ProjectStep.VIDEO_STUDIO:
        return <VideoStudio />;
      case ProjectStep.ASSETS:
        return <AssetLibrary />;
      case ProjectStep.SETTINGS:
        return <SettingsPage />;
      case ProjectStep.ADMIN:
        return <AdminPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <ModalProvider>
      <Layout saveStatus={saveStatus} flushSave={flush}>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        }>
          {renderContent()}
        </Suspense>
      </Layout>
      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>
    </ModalProvider>
  );
};

export default App;
