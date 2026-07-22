
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  PenTool,
  Layers,
  Video,
  Settings,
  Menu,
  ChevronRight,
  Home,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Coins,
  Shield,
  HelpCircle,
  Package,
  ImagePlus
} from 'lucide-react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useCreditStore } from '../store/creditStore';
import { useSettingsStore } from '../store/settingsStore';
import { ProjectStep } from '../types';
import { isAdmin } from '../services/adminConfigService';
import { CreditRequestModal } from './CreditRequestModal';

interface SidebarItemProps {
  icon: React.FC<{ size?: number }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active
        ? 'bg-primary text-white shadow-[0_6px_18px_rgba(0,80,191,0.25)]'
        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
    }`}
  >
    <Icon size={20} />
    <span className="font-bold">{label}</span>
    {active && <ChevronRight size={16} className="ml-auto" />}
  </button>
);

export const Layout: React.FC<{ children: React.ReactNode; saveStatus?: 'idle' | 'saving' | 'saved' | 'error' | 'forbidden'; flushSave?: () => Promise<void> }> = ({ children, saveStatus, flushSave }) => {
  const { t } = useTranslation();
  const { currentStep, setStep, project } = useStore();
  const { user, signOut } = useAuthStore();
  const { balance, maxCredits } = useCreditStore();
  const { requestTourReplay } = useSettingsStore();

  const STEP_TO_TOUR: Partial<Record<ProjectStep, string>> = {
    [ProjectStep.DASHBOARD]: 'dashboard',
    [ProjectStep.PLANNING]: 'planning',
    [ProjectStep.VISUALIZING]: 'visualizing',
    [ProjectStep.ASSEMBLY]: 'assembly',
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const [showCreditRequest, setShowCreditRequest] = useState(false);
  const isMasterUi = isAdmin(user?.email ?? undefined);

  const handleNavigate = (step: ProjectStep) => {
    if (flushSave) flushSave();
    closeSidebar();
    setStep(step);
  };

  // ESC key closes sidebar
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
    };
    if (sidebarOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [sidebarOpen, closeSidebar]);

  // Lock body scroll when sidebar open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [sidebarOpen]);

  // Auto-close on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) closeSidebar();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [closeSidebar]);

  return (
    <div id="app-layout" className="flex h-screen overflow-hidden bg-[#F5F7FA] text-zinc-900">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-[60] w-80 bg-white border-r border-zinc-200 p-6 flex flex-col gap-8 print:hidden transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:transition-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2">
          <img src="/sodami.png" alt="소담이" className="w-9 h-9 rounded-xl shrink-0 object-cover" />
          <h1 className="text-lg font-black tracking-tight whitespace-nowrap text-zinc-900">Sodam <span className="text-primary">AI</span> Studio</h1>
        </div>

        <nav className="flex-1 flex flex-col gap-2">
          <SidebarItem
            icon={Home}
            label={t('nav.dashboard')}
            active={currentStep === ProjectStep.DASHBOARD}
            onClick={() => handleNavigate(ProjectStep.DASHBOARD)}
          />

          <div className="mt-6 text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2">크리에이티브</div>
          <div className="space-y-2">
            <SidebarItem
              icon={ImagePlus}
              label="이미지 생성"
              active={currentStep === ProjectStep.IMAGE_STUDIO}
              onClick={() => handleNavigate(ProjectStep.IMAGE_STUDIO)}
            />
            <SidebarItem
              icon={Package}
              label="자산 보관함"
              active={currentStep === ProjectStep.ASSETS}
              onClick={() => handleNavigate(ProjectStep.ASSETS)}
            />
          </div>

          <div className="h-[1px] bg-zinc-200 my-4" />
          <div data-tour="sidebar-workflow" className="space-y-2">
          <div className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2">{t('nav.workflow')}</div>
          <SidebarItem
            icon={PenTool}
            label={t('nav.planning')}
            active={currentStep === ProjectStep.PLANNING}
            onClick={() => handleNavigate(ProjectStep.PLANNING)}
          />
          <SidebarItem
            icon={Layers}
            label={t('nav.visualizing')}
            active={currentStep === ProjectStep.VISUALIZING}
            onClick={() => handleNavigate(ProjectStep.VISUALIZING)}
          />
          <SidebarItem
            icon={LayoutDashboard}
            label={t('nav.assembly')}
            active={currentStep === ProjectStep.ASSEMBLY}
            onClick={() => handleNavigate(ProjectStep.ASSEMBLY)}
          />
          <SidebarItem
            icon={Video}
            label={t('nav.production')}
            active={currentStep === ProjectStep.PRODUCTION}
            onClick={() => handleNavigate(ProjectStep.PRODUCTION)}
          />
          </div>

          <div className="mt-8 text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2">{t('nav.settings')}</div>
          <SidebarItem
            icon={Settings}
            label={t('nav.settings')}
            active={currentStep === ProjectStep.SETTINGS}
            onClick={() => handleNavigate(ProjectStep.SETTINGS)}
          />

          {isAdmin(user?.email ?? undefined) && (
            <>
              <div className="h-[1px] bg-zinc-200 my-4" />
              <div className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2">{t('nav.admin')}</div>
              <SidebarItem
                icon={Shield}
                label={t('nav.adminSettings')}
                active={currentStep === ProjectStep.ADMIN}
                onClick={() => handleNavigate(ProjectStep.ADMIN)}
              />
            </>
          )}
        </nav>

        {/* Replay Guide - current page */}
        {STEP_TO_TOUR[currentStep] && (
          <button
            onClick={() => {
              const tourId = STEP_TO_TOUR[currentStep];
              if (tourId) requestTourReplay(tourId);
              closeSidebar();
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-zinc-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all text-[11px] font-bold uppercase tracking-widest"
          >
            <HelpCircle size={14} />
            {t('onboarding.replay.replayPage')}
          </button>
        )}

        {/* Credit Balance — 골드 (크레딧=가치/보상) */}
        <div data-tour="sidebar-credits" className="px-4 py-3 bg-[#E5EDFA] border border-[#C0D4F0] rounded-2xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-[#0050BF] uppercase tracking-widest">{t('common.credits')}</span>
            <Coins size={14} className="text-[#0050BF]" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-black ${balance <= 10 ? 'text-[#64748B]' : 'text-[#0050BF]'}`}>{balance}</span>
            <span className="text-[10px] font-bold text-[#7B93B8]">/ {maxCredits}</span>
          </div>
          <div className="mt-2 h-1.5 bg-[#D6E3F7] rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${balance <= 10 ? 'bg-[#64748B]' : 'bg-[#0050BF]'}`} style={{ width: `${maxCredits > 0 ? (balance / maxCredits) * 100 : 0}%` }} />
          </div>
          {!isMasterUi && (
            <button
              onClick={() => setShowCreditRequest(true)}
              className="mt-2 w-full text-[11px] font-bold text-[#0050BF] hover:text-[#003E99] hover:underline text-left"
            >
              + 크레딧 신청
            </button>
          )}
        </div>

        {/* User Profile */}
        <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 group">
          <div className="flex items-center gap-3">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-10 h-10 rounded-full shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-[#1E6FD9] shrink-0" />
            )}
            <div className="flex flex-col items-start overflow-hidden flex-1">
              <div className="text-sm font-bold truncate w-full text-zinc-900">
                {user?.user_metadata?.full_name || 'Creative Lead'}
              </div>
              <button
                onClick={signOut}
                className="text-[10px] text-zinc-500 hover:text-zinc-500 flex items-center gap-1 transition-colors hover:underline"
              >
                <LogOut size={10} /> {t('common.logout')}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative md:ml-0">
        <header className="sticky top-0 z-50 px-4 py-3 md:px-8 border-b border-zinc-200 glass-panel print:hidden">
          {(() => {
            const isWorkflowStep = [ProjectStep.PLANNING, ProjectStep.VISUALIZING, ProjectStep.ASSEMBLY, ProjectStep.PRODUCTION].includes(currentStep);
            const workflowSteps = [
              { step: ProjectStep.PLANNING, label: t('nav.planning') },
              { step: ProjectStep.VISUALIZING, label: t('nav.visualizing') },
              { step: ProjectStep.ASSEMBLY, label: t('nav.assembly') },
              { step: ProjectStep.PRODUCTION, label: t('nav.production') },
            ];

            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 md:hidden"
                      onClick={toggleSidebar}
                      aria-label="Toggle sidebar"
                      aria-expanded={sidebarOpen}
                    >
                      <Menu size={20} />
                    </button>

                    {currentStep === ProjectStep.DASHBOARD ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.myProjects')}</span>
                    ) : currentStep === ProjectStep.SETTINGS ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.settingsTitle')}</span>
                    ) : currentStep === ProjectStep.ADMIN ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.adminTitle')}</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleNavigate(ProjectStep.DASHBOARD)}
                          className="text-zinc-400 hover:text-zinc-900 text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                          {t('nav.projects')}
                        </button>
                        <ChevronRight size={14} className="text-zinc-300" />
                        <span className="text-zinc-900 font-black text-base truncate max-w-[200px]">
                          {project?.title || t('nav.untitled')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {isWorkflowStep && (
                      <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-black uppercase tracking-widest">
                        {currentStep.replace('_', ' ')}
                      </span>
                    )}

                    {saveStatus === 'saving' && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <div className="w-3 h-3 border-2 border-gray-500/30 border-t-gray-500 rounded-full animate-spin" />
                        {t('common.saving')}
                      </div>
                    )}
                    {saveStatus === 'saved' && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-[#0050BF] uppercase tracking-widest">
                        <CheckCircle2 size={12} /> {t('common.saved')}
                      </div>
                    )}
                    {saveStatus === 'error' && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <AlertCircle size={12} /> {t('common.saveFailed')}
                      </div>
                    )}
                    {saveStatus === 'forbidden' && (
                      <span className="text-[#0050BF] text-xs flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-[#0050BF] rounded-full" />
                        {t('common.readOnly')}
                      </span>
                    )}
                  </div>
                </div>

                {isWorkflowStep && (
                  <div className="flex items-center gap-1 mt-2 ml-2 md:ml-12">
                    {workflowSteps.map((ws, i) => {
                      const isCurrent = currentStep === ws.step;
                      const stepOrder = workflowSteps.findIndex(w => w.step === currentStep);
                      const isPast = i < stepOrder;

                      return (
                        <React.Fragment key={ws.step}>
                          {i > 0 && (
                            <div className={`h-[1px] w-6 ${isPast ? 'bg-[#0050BF]' : 'bg-zinc-200'}`} />
                          )}
                          <button
                            onClick={() => handleNavigate(ws.step)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                              isCurrent
                                ? 'text-primary bg-primary/10'
                                : isPast
                                ? 'text-[#0050BF] hover:bg-zinc-100'
                                : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              isCurrent ? 'bg-primary' : isPast ? 'bg-[#E5EDFA]0' : 'bg-zinc-300'
                            }`} />
                            {ws.label}
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </header>

        <div className={`p-4 md:p-8 transition-all duration-300 ${
          currentStep === ProjectStep.ASSEMBLY ? 'w-full max-w-[1600px] mx-auto' :
          currentStep === ProjectStep.DASHBOARD ? 'max-w-7xl mx-auto' :
          currentStep === ProjectStep.ASSETS ? 'max-w-7xl mx-auto' :
          currentStep === ProjectStep.IMAGE_STUDIO ? 'max-w-5xl mx-auto' :
          currentStep === ProjectStep.SETTINGS ? 'max-w-4xl mx-auto' :
          currentStep === ProjectStep.ADMIN ? 'max-w-5xl mx-auto' :
          'max-w-6xl mx-auto'
        }`}>
          {children}
        </div>
      </main>

      {showCreditRequest && user && (
        <CreditRequestModal userId={user.id} onClose={() => setShowCreditRequest(false)} />
      )}
    </div>
  );
};
