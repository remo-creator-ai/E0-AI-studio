
import React, { Suspense, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { ModalProvider } from './components/ui/ModalProvider';
import { useStore } from './store';
import { useAuthStore } from './store/authStore';
import { useAutoSave } from './hooks/useAutoSave';
import { ProjectStep } from './types';

const PlanningStep = React.lazy(() => import('./components/PlanningStep').then(m => ({ default: m.PlanningStep })));
const VisualizingStep = React.lazy(() => import('./components/VisualizingStep').then(m => ({ default: m.VisualizingStep })));
const AssemblyStep = React.lazy(() => import('./components/AssemblyStep').then(m => ({ default: m.AssemblyStep })));
const ProductionStep = React.lazy(() => import('./components/ProductionStep').then(m => ({ default: m.ProductionStep })));
const SettingsPage = React.lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AdminPage = React.lazy(() => import('./components/AdminPage').then(m => ({ default: m.AdminPage })));
const OnboardingTour = React.lazy(() => import('./components/ui/OnboardingTour').then(m => ({ default: m.OnboardingTour })));

const App: React.FC = () => {
  const { currentStep, project, updateCurrentStage } = useStore();
  const { user, isAuthLoading, initialize } = useAuthStore();
  const { saveStatus, flush } = useAutoSave();

  useEffect(() => {
    initialize();
  }, [initialize]);

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
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Loading...</p>
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
