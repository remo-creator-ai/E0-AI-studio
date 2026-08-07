
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
  ImagePlus,
  Film,
  Mic,
  Pencil,
  Check as CheckIcon,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useCreditStore } from '../store/creditStore';
import { useSettingsStore } from '../store/settingsStore';
import { ProjectStep } from '../types';
import { STEP_TO_TOUR } from '../hooks/useOnboardingTour';
import { isAdmin } from '../services/adminConfigService';
import { CreditRequestModal } from './CreditRequestModal';
import { renameProject } from '../services/projectService';

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
  const { currentStep, setStep, project, setProject } = useStore();
  const { user, signOut } = useAuthStore();

  // 프로젝트 제목 인라인 편집
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const openTitleEdit = () => {
    if (!project) return;
    setTitleDraft(project.title || '');
    setTitleEditing(true);
  };
  const saveTitle = async () => {
    if (!project) return;
    const clean = titleDraft.trim();
    if (!clean || clean === project.title) { setTitleEditing(false); return; }
    setTitleSaving(true);
    try {
      await renameProject(project.id, clean);
      setProject({ ...project, title: clean });
      setTitleEditing(false);
    } catch (e) {
      // 실패 시 편집 상태 유지 (사용자가 재시도 가능). 콘솔에만 남긴다.
      console.error('renameProject failed:', e);
    } finally {
      setTitleSaving(false);
    }
  };
  const cancelTitleEdit = () => setTitleEditing(false);
  const { balance, maxCredits } = useCreditStore();
  const { requestTourReplay } = useSettingsStore();

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
      {/* overflow-y-auto: 루트가 h-screen overflow-hidden 이라 사이드바가 뷰포트보다
          길어지면 그냥 잘린다(마스터는 '관리자 콘솔'이 추가돼 특히 쉽게 넘친다).
          창을 줄이면 크레딧·로그아웃이 사라지고 스크롤도 불가능했다. */}
      <aside className={`fixed inset-y-0 left-0 z-[60] w-80 bg-white border-r border-zinc-200 p-6 flex flex-col gap-8 overflow-y-auto print:hidden transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:transition-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2 shrink-0">
          <img src="/sodami.png" alt="소담이" className="w-9 h-9 rounded-xl shrink-0 object-cover" />
          <h1 className="text-lg font-black tracking-tight whitespace-nowrap text-zinc-900">소담 <span className="text-primary">AI</span> 스튜디오</h1>
        </div>

        {/* min-h-0 + overflow-y-auto: 화면이 짧으면 메뉴 영역만 안에서 스크롤되고
            아래 크레딧·로그아웃은 계속 보이게 한다 */}
        <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          <SidebarItem
            icon={Home}
            label={t('nav.dashboard')}
            active={currentStep === ProjectStep.DASHBOARD}
            onClick={() => handleNavigate(ProjectStep.DASHBOARD)}
          />

          <div className="mt-6 text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-2">{t('nav.creative')}</div>
          <div className="space-y-2">
            <SidebarItem
              icon={ImagePlus}
              label={t('nav.imageStudio')}
              active={currentStep === ProjectStep.IMAGE_STUDIO}
              onClick={() => handleNavigate(ProjectStep.IMAGE_STUDIO)}
            />
            <SidebarItem
              icon={Film}
              label={t('nav.videoStudio')}
              active={currentStep === ProjectStep.VIDEO_STUDIO}
              onClick={() => handleNavigate(ProjectStep.VIDEO_STUDIO)}
            />
            <SidebarItem
              icon={Mic}
              label={t('nav.voiceStudio')}
              active={currentStep === ProjectStep.VOICE_STUDIO}
              onClick={() => handleNavigate(ProjectStep.VOICE_STUDIO)}
            />
            <SidebarItem
              icon={Package}
              label={t('nav.assets')}
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

        <div data-sidebar-account className="shrink-0 space-y-2">
        {/* Credit Balance — 골드 (크레딧=가치/보상) */}
        <div data-tour="sidebar-credits" className="h-[48px] px-3 py-2 bg-[#E5EDFA] border border-[#C0D4F0] rounded-xl flex items-center gap-2.5">
          <Coins size={16} className="text-[#0050BF] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 leading-none">
              <div className="flex items-baseline gap-1 shrink-0">
                <span className={`text-base font-black ${balance <= 10 ? 'text-[#64748B]' : 'text-[#0050BF]'}`}>{balance}</span>
                <span className="text-[9px] font-bold text-[#7B93B8]">/ {maxCredits}</span>
              </div>
              {!isMasterUi && (
                <button
                  onClick={() => setShowCreditRequest(true)}
                  className="text-[10px] font-bold text-[#0050BF] hover:text-[#003E99] hover:underline whitespace-nowrap"
                >
                  + 크레딧 신청
                </button>
              )}
            </div>
            <div className="mt-1 h-1 bg-[#D6E3F7] rounded-full overflow-hidden" aria-label={t('common.credits')}>
              <div className={`h-full rounded-full transition-all duration-500 ${balance <= 10 ? 'bg-[#64748B]' : 'bg-[#0050BF]'}`} style={{ width: `${maxCredits > 0 ? (balance / maxCredits) * 100 : 0}%` }} />
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div data-sidebar-profile className="h-[48px] px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 group">
          <div className="flex items-center gap-2 h-full">
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} alt="" className="w-[32px] h-[32px] rounded-full shrink-0" />
            ) : (
              <div className="w-[32px] h-[32px] rounded-full bg-gradient-to-tr from-primary to-[#1E6FD9] shrink-0" />
            )}
            <div className="flex flex-col items-start overflow-hidden flex-1 min-w-0 leading-tight">
              <div className="text-xs font-bold truncate w-full text-zinc-900">
                {user?.user_metadata?.full_name || 'Creative Lead'}
              </div>
              <button
                onClick={signOut}
                className="text-[9px] text-zinc-500 hover:text-zinc-700 flex items-center gap-1 transition-colors hover:underline"
              >
                <LogOut size={9} /> {t('common.logout')}
              </button>
            </div>
            <button
              type="button"
              data-sidebar-settings
              onClick={() => handleNavigate(ProjectStep.SETTINGS)}
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
              aria-current={currentStep === ProjectStep.SETTINGS ? 'page' : undefined}
              className={`w-[32px] h-[32px] shrink-0 flex items-center justify-center rounded-lg transition-all ${
                currentStep === ProjectStep.SETTINGS
                  ? 'bg-primary text-white shadow-[0_4px_12px_rgba(0,80,191,0.2)]'
                  : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900'
              }`}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
        </div>

        {/* Sponsor / Powered by — 사이드바 최하단. 저작권처럼 눈에 띄지 않되 항상 노출. */}
        <div className="shrink-0 text-center text-[10px] text-zinc-400 leading-relaxed">
          Sponsored by <span className="font-bold text-zinc-500">openknwol</span>
          <br />
          AI powered by <span className="font-bold text-primary">REMO</span>
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
                    ) : currentStep === ProjectStep.ASSETS ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.assets')}</span>
                    ) : currentStep === ProjectStep.IMAGE_STUDIO ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.imageStudio')}</span>
                    ) : currentStep === ProjectStep.VIDEO_STUDIO ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.videoStudio')}</span>
                    ) : currentStep === ProjectStep.VOICE_STUDIO ? (
                      <span className="text-zinc-900 font-black text-base tracking-tight">{t('nav.voiceStudio')}</span>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleNavigate(ProjectStep.DASHBOARD)}
                          className="text-zinc-400 hover:text-zinc-900 text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                          {t('nav.projects')}
                        </button>
                        <ChevronRight size={14} className="text-zinc-300" />
                        {titleEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              autoFocus
                              value={titleDraft}
                              onChange={(e) => setTitleDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveTitle();
                                else if (e.key === 'Escape') cancelTitleEdit();
                              }}
                              className="text-zinc-900 font-black text-base bg-white border border-primary/40 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-primary/30 min-w-[240px]"
                              disabled={titleSaving}
                            />
                            <button
                              onClick={saveTitle}
                              disabled={titleSaving}
                              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 disabled:opacity-40"
                              title="저장 (Enter)"
                            >
                              <CheckIcon size={14} />
                            </button>
                            <button
                              onClick={cancelTitleEdit}
                              disabled={titleSaving}
                              className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 disabled:opacity-40"
                              title="취소 (Esc)"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 group">
                            <span
                              className="text-zinc-900 font-black text-base truncate max-w-[240px] sm:max-w-[420px] md:max-w-[600px] lg:max-w-none"
                              title={project?.title || t('nav.untitled')}
                            >
                              {project?.title || t('nav.untitled')}
                            </span>
                            <button
                              onClick={openTitleEdit}
                              className="p-1 rounded-md text-zinc-300 hover:text-primary hover:bg-primary/5 transition"
                              title="제목 수정"
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        )}
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
          currentStep === ProjectStep.IMAGE_STUDIO ? 'w-full max-w-[1600px] mr-auto' :
          currentStep === ProjectStep.VIDEO_STUDIO ? 'w-full max-w-[1600px] mr-auto' :
          currentStep === ProjectStep.VOICE_STUDIO ? 'w-full max-w-[1600px] mr-auto' :
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
