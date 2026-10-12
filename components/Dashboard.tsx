import { createDemoProject } from '../lib/demoProject';
import { saveProject } from '../services/projectService';
import { localProjects, removeLocalProject } from '../lib/localProjects';
import { CONTENT_STARTS } from '../lib/brand';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  Clock,
  Film,
  Layers,
  ChevronRight,
  Image as ImageIcon,
  User,
  Monitor,
  Smartphone,
  Mic,
  X,
  Sparkles,
  ClipboardList,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useStore } from '../store';
import { useModal } from './ui/ModalProvider';
import { MAX_FREE_PROJECTS } from '../store/creditStore';
import { supabase } from '../lib/supabase';
import { Project, ProjectStep, StoryboardLayout, AdDuration, VisualStyle, AspectRatio, SceneCount, SCENE_DURATION_MAP } from '../types';
import { IntroSurvey } from './IntroSurvey';
import { MOCK_MODE } from '../lib/mockAuth';

type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

const REQUEST_STATUS_LABELS_KR: Record<RequestStatus, string> = {
  pending: '대기 중',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소됨',
};

const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  pending: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-[#E8F4F0] text-[#005D53] border-[#B9D8CD]',
  cancelled: 'bg-zinc-100 text-zinc-500 border-zinc-200',
};

const normalizeRequestStatus = (status: string): RequestStatus => (
  ['pending', 'in_progress', 'completed', 'cancelled'].includes(status)
    ? status as RequestStatus
    : 'pending'
);

interface ProductionRequestSummary {
  id: string;
  project_title: string;
  status: string;
  created_at: string;
  purpose: string;
}

interface ProjectSummary {
  id: string;
  title: string;
  style: string;
  duration: number;
  created_at: string;
  updated_at: string;
  scenes_count: number;
  images_done: number;
  videos_done: number;
  thumbnail: string | null;
  current_stage: string | null;
  original_creator_id: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
}

export const Dashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const [startingIdea, setStartingIdea] = useState('');
  const { user } = useAuthStore();
  const { setProject, setStep } = useStore();
  const { alert, confirm } = useModal();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [myRequests, setMyRequests] = useState<ProductionRequestSummary[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);
  const [selectedSceneCount, setSelectedSceneCount] = useState<SceneCount>(SceneCount.CUTS_9);
  const introSurveyStatus = useAuthStore((s) => s.introSurveyStatus);
  const setIntroSurveyStatus = useAuthStore((s) => s.setIntroSurveyStatus);

  useEffect(() => {
    if (user?.id) {
      loadProjects();
      loadMyRequests();
      checkIntroSurvey();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // PRD v1.4 §9.0 — 대시보드 최초 진입 시 인트로 설문 1회 노출
  // 결과는 authStore.introSurveyStatus 로 공유되어 온보딩 투어 지연에도 사용됨.
  const checkIntroSurvey = async () => {
    if (!user) return;
    if (MOCK_MODE) {
      setIntroSurveyStatus('done');
      return;
    }
    const { data, error } = await supabase
      .from('intro_survey_responses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[Dashboard] intro survey check failed', error);
      setIntroSurveyStatus('done'); // 실패 시 온보딩 투어를 무한 대기시키지 않도록 done 처리
      return;
    }
    setIntroSurveyStatus(data ? 'done' : 'pending');
  };

  const loadProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    setLoadError(false);
    try {
      if (MOCK_MODE) {
        setProjects(localProjects().filter(p => p.user_id === user.id).map(p => ({ ...p, scenes_count: p.scenes.length, images_done: p.scenes.filter(s => s.image_url).length, videos_done: p.scenes.filter(s => s.video_url).length, thumbnail: p.thumbnail ?? null, current_stage: p.current_stage ?? null, original_creator_id: null, creator_display_name: null, creator_avatar_url: null })));
        return;
      }
      const { data, error } = await supabase.rpc('get_project_summaries', {
        p_user_id: user.id,
      });

      if (error) throw error;

      const summaries: ProjectSummary[] = (data || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        title: p.title as string,
        style: p.style as string,
        duration: p.duration as number,
        created_at: p.created_at as string,
        updated_at: p.updated_at as string,
        scenes_count: (p.scenes_count as number) || 0,
        images_done: (p.images_done as number) || 0,
        videos_done: (p.videos_done as number) || 0,
        thumbnail: (p.thumbnail as string) || null,
        current_stage: (p.current_stage as string) || null,
        original_creator_id: (p.original_creator_id as string) || null,
        creator_display_name: (p.creator_display_name as string) || null,
        creator_avatar_url: (p.creator_avatar_url as string) || null,
      }));
      setProjects(summaries);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMyRequests = async () => {
    if (!user || MOCK_MODE) return;
    setRequestsLoading(true);
    try {
      const { data, error } = await supabase
        .from('production_requests')
        .select('id, project_title, status, created_at, purpose')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setMyRequests((data as ProductionRequestSummary[]) || []);
    } catch (err) {
      console.error('Failed to load production requests:', err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleOpenProject = async (projectId: string) => {
    try {
      if (MOCK_MODE) {
        const local = localProjects().find(p => p.id === projectId && p.user_id === user?.id);
        if (!local) throw new Error('Project not found');
        setProject(local);
        const stages: Record<string, ProjectStep> = { PLANNING: ProjectStep.PLANNING, VISUALIZING: ProjectStep.VISUALIZING, ASSEMBLY: ProjectStep.ASSEMBLY, PRODUCTION: ProjectStep.PRODUCTION };
        setStep(stages[local.current_stage ?? ''] ?? ProjectStep.PLANNING); return;
      }
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      if (!data) return;

      const project: Project = {
        id: data.id,
        title: data.title,
        key_message: data.key_message ?? undefined,
        duration: data.duration as AdDuration,
        style: data.style as VisualStyle,
        idea: data.idea,
        scenes: data.scenes as unknown as Project['scenes'],
        grid_images: data.grid_images as unknown as Project['grid_images'],
        layout: data.layout as StoryboardLayout,
        current_stage: data.current_stage ?? null,
        thumbnail: data.thumbnail ?? null,
        aspect_ratio: ((data as Record<string, unknown>).aspect_ratio as AspectRatio) || AspectRatio.LANDSCAPE,
        scene_count: ((data as Record<string, unknown>).scene_count as unknown as SceneCount) || SceneCount.CUTS_9,
        image_model: ((data as Record<string, unknown>).image_model as Project['image_model']) || undefined,
        generation_language: ((data as Record<string, unknown>).generation_language as Project['generation_language']) || undefined,
      };

      setProject(project);

      // Navigate to last worked stage
      const stageMap: Record<string, ProjectStep> = {
        'PLANNING': ProjectStep.PLANNING,
        'VISUALIZING': ProjectStep.VISUALIZING,
        'ASSEMBLY': ProjectStep.ASSEMBLY,
        'PRODUCTION': ProjectStep.PRODUCTION,
      };
      const lastStage = data.current_stage ? stageMap[data.current_stage] : ProjectStep.PLANNING;
      setStep(lastStage || ProjectStep.PLANNING);
    } catch (err) {
      console.error('Failed to open project:', err);
      await alert(t('dashboard.alerts.loadError'), { type: 'error' });
    }
  };

  const handleNewProject = async () => {
    if (projects.length >= MAX_FREE_PROJECTS) {
      await alert(t('dashboard.alerts.maxProjects', { max: MAX_FREE_PROJECTS }), { type: 'warning' });
      return;
    }
    setStartingIdea('');
    setShowNewProjectModal(true);
  };

  const handleStartProject = () => {
    const { setNewProjectConfig } = useStore.getState();
    setNewProjectConfig({ aspectRatio: selectedAspectRatio, sceneCount: selectedSceneCount, idea: startingIdea });
    setProject(null);
    setStep(ProjectStep.PLANNING);
    setShowNewProjectModal(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    const confirmed = await confirm(t('dashboard.alerts.deleteConfirm'), { type: 'warning', confirmText: t('common.delete'), cancelText: t('common.cancel') });
    if (!confirmed) return;

    try {
      const { error } = MOCK_MODE ? (removeLocalProject(projectId), { error: null }) : await supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) throw error;
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      // Clear in-memory project if it matches deleted one
      if (useStore.getState().project?.id === projectId) {
        setProject(null);
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
      await alert(t('dashboard.alerts.deleteError'), { type: 'error' });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const quickActions = [
    { id: 'image', label: t('nav.imageStudio'), icon: ImageIcon, step: ProjectStep.IMAGE_STUDIO },
    { id: 'video', label: t('nav.videoStudio'), icon: Film, step: ProjectStep.VIDEO_STUDIO },
    { id: 'voice', label: t('nav.voiceStudio'), icon: Mic, step: ProjectStep.VOICE_STUDIO },
  ] as const;

  return (
    <div className="space-y-6 md:space-y-8">
        <section data-tour="dashboard-welcome" className="space-y-5 md:flex md:items-end md:justify-between md:space-y-0">
          <div className="min-w-0 space-y-2">
            <h1 data-dashboard-mobile-title className="e0-dashboard-title text-zinc-900 md:hidden">
              {t('dashboard.mobileTitle')}
            </h1>
            <h2 className="e0-dashboard-title hidden text-zinc-900 md:block">
              {t('dashboard.title')} <span className="text-primary">{t('dashboard.titleHighlight')}</span>
            </h2>
            <p data-dashboard-mobile-subtitle className="text-sm leading-6 text-zinc-500 md:hidden">{t('dashboard.mobileSubtitle')}</p>
            <p className="hidden text-sm text-zinc-500 md:block">{t('dashboard.subtitle')}</p>
          </div>
          <button
            data-tour="dashboard-new-project"
            data-dashboard-primary-cta
            onClick={handleNewProject}
            className="flex min-h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-primary px-6 py-3 font-bold text-white shadow-[0_8px_20px_rgba(0,117,104,0.22)] transition-all hover:bg-[#005D53] active:scale-[0.98] md:w-auto md:rounded-full md:px-7"
          >
            <Plus size={20} /> {t('dashboard.newProject')}
          </button>
        </section>

        <section className="e0-starts" aria-label={en ? 'Choose a content purpose' : '제작 목적 선택'}>
          {CONTENT_STARTS.map((item, index) => <button key={item.id} className="e0-purpose-card" onClick={() => { setStartingIdea(en ? item.briefEn : item.brief); setShowNewProjectModal(true); }}>
            <span className="e0-purpose-number">0{index + 1}<ChevronRight size={18}/></span>
            <h3>{en ? item.en : item.title}</h3><p>{en ? item.descriptionEn : item.description}</p>
          </button>)}
        </section>

        <section data-dashboard-quick-actions className="space-y-3">
          <h2 className="text-sm font-black tracking-tight text-zinc-900 md:text-base">{t('dashboard.quickStart')}</h2>
          <div className="grid grid-cols-3 gap-2 md:max-w-2xl md:gap-3">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  data-dashboard-quick-action={action.id}
                  onClick={() => setStep(action.step)}
                  className="group flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-3 text-zinc-700 shadow-sm transition hover:border-primary/40 hover:bg-[#F2F8F5] hover:text-primary active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:min-h-0 md:flex-row md:justify-start md:px-5 md:py-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F0F7F4] text-primary transition group-hover:bg-primary group-hover:text-white">
                    <ActionIcon size={18} />
                  </span>
                  <span className="whitespace-nowrap text-[11px] font-bold sm:text-xs md:text-sm">{action.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {MOCK_MODE && <button className="text-sm font-semibold text-primary underline underline-offset-4" onClick={async () => {
          if (!user) return;
          try { const sample = createDemoProject(en); await saveProject(user.id, sample); setProject(sample); setStep(ProjectStep.ASSEMBLY); }
          catch { await alert(en ? 'Unable to save the sample in this browser.' : '샘플을 이 브라우저에 저장하지 못했습니다.', { type: 'error' }); }
        }}>{en ? 'Open a prewritten sample storyboard' : '사전 작성된 샘플 스토리보드 열기'}</button>}
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6"><p>{en ? 'Could not load projects.' : '프로젝트를 불러오지 못했습니다.'}</p><button className="e0-button mt-3" onClick={loadProjects}>{en ? 'Try again' : '다시 시도'}</button></div>}
        {/* Empty State */}
        {!isLoading && !loadError && projects.length === 0 && (
          <div className="rounded-3xl border border-dashed border-[#B9D8CD] bg-white/60 px-5 py-10 text-center md:py-16">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#B9D8CD] bg-[#F0F7F4]">
              <Film size={30} className="text-primary" />
            </div>
            <div className="mt-5 space-y-2">
              <h3 data-dashboard-empty-title className="text-xl font-black tracking-tight text-zinc-900 md:text-2xl">{t('dashboard.emptyTitle')}</h3>
              <p className="text-sm leading-6 text-zinc-500">{t('dashboard.emptySubtitle')}</p>
            </div>
          </div>
        )}

        {/* Project Grid */}
        {!isLoading && projects.length > 0 && (
          <div className="space-y-4">
          <h2 className="text-lg font-black tracking-tight text-zinc-900 md:text-xl">{t('dashboard.recentProjects')}</h2>
          <div data-tour="dashboard-project-grid" data-dashboard-project-grid className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {(showAllProjects ? projects : projects.slice(0, 3)).map((project) => (
              <div
                key={project.id}
                className="group bg-white border border-zinc-200 rounded-[1.5rem] overflow-hidden hover:border-primary/40 hover:shadow-[0_12px_32px_rgba(24,24,27,0.08)] transition-all duration-300 cursor-pointer"
                onClick={() => handleOpenProject(project.id)}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-zinc-100 relative overflow-hidden">
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon size={48} className="text-zinc-300" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-lg font-black tracking-tight truncate text-white drop-shadow">{project.title}</h3>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-4 p-4 md:p-6">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-[#E8F4F0] border border-[#B9D8CD] rounded-full text-[10px] font-bold text-[#007568] uppercase">
                      {project.style}
                    </span>
                    <span className="px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-full text-[10px] font-bold text-zinc-500 uppercase">
                      {project.duration}s
                    </span>
                    <span className="px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-full text-[10px] font-bold text-zinc-500 uppercase">
                      {project.scenes_count} cuts
                    </span>
                  </div>

                  {/* Progress Bars */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      <span className="flex items-center gap-1"><Layers size={10} /> Images</span>
                      <span>{project.images_done}/{project.scenes_count}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${project.scenes_count > 0 ? (project.images_done / project.scenes_count) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      <span className="flex items-center gap-1"><Film size={10} /> Videos</span>
                      <span>{project.videos_done}/{project.scenes_count}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#007568] rounded-full transition-all"
                        style={{ width: `${project.scenes_count > 0 ? (project.videos_done / project.scenes_count) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Last Stage */}
                  {project.current_stage && (
                    <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <span>{t('dashboard.lastStage', { stage: project.current_stage })}</span>
                    </div>
                  )}

                  {/* Creator Badge */}
                  {project.original_creator_id && user && project.original_creator_id !== user.id && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[#E8F4F0] border border-[#B9D8CD] rounded-xl">
                      {project.creator_avatar_url ? (
                        <img src={project.creator_avatar_url} alt="" className="w-4 h-4 rounded-full" />
                      ) : (
                        <User size={12} className="text-[#007568]" />
                      )}
                      <span className="text-[10px] font-bold text-[#007568]">
                        {t('dashboard.originalCreator', { name: project.creator_display_name || t('dashboard.unknownCreator') })}
                      </span>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                    <span className="text-[10px] font-bold text-zinc-400 flex items-center gap-1">
                      <Clock size={10} /> {formatDate(project.updated_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
                        className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400 hover:text-zinc-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={16} className="text-zinc-300 group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {projects.length > 3 && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowAllProjects(!showAllProjects)}
                className="px-6 py-2.5 bg-white border border-zinc-200 rounded-full text-sm font-bold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-all"
              >
                {showAllProjects ? t('dashboard.showLess') : t('dashboard.showMore', { count: projects.length - 3 })}
              </button>
            </div>
          )}
          </div>
        )}

        {/* My Production Requests */}
        {(myRequests.length > 0 || requestsLoading) && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ClipboardList size={18} className="text-primary" />
              <h3 className="text-lg font-black tracking-tight text-zinc-900">
                {t('dashboard.myRequests')} <span className="text-primary">{t('dashboard.myRequestsHighlight')}</span>
              </h3>
            </div>

            {requestsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <>
              <div data-dashboard-request-cards className="space-y-3 md:hidden">
                {myRequests.map((req) => {
                  const validKey = normalizeRequestStatus(req.status || 'pending');
                  return (
                    <article key={req.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-black text-zinc-900" title={req.project_title}>{req.project_title}</h4>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500" title={req.purpose}>{req.purpose}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${REQUEST_STATUS_COLORS[validKey]}`}>
                          {t(`status.${validKey === 'in_progress' ? 'inProgress' : validKey}`)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-1 border-t border-zinc-100 pt-3 text-[11px] font-medium text-zinc-400">
                        <Clock size={12} /> {formatDate(req.created_at)}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div data-dashboard-request-table className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-50">
                      <th className="text-left font-black px-4 py-3 border-b border-zinc-100">프로젝트</th>
                      <th className="text-left font-black px-4 py-3 border-b border-zinc-100 hidden md:table-cell">요청 서비스</th>
                      <th className="text-left font-black px-4 py-3 border-b border-zinc-100 whitespace-nowrap">일시</th>
                      <th className="text-right font-black px-4 py-3 border-b border-zinc-100">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequests.map((req) => {
                      const validKey = normalizeRequestStatus(req.status || 'pending');
                      return (
                        <tr key={req.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                          <td className="px-4 py-3 text-zinc-900 font-bold max-w-[280px] truncate" title={req.project_title}>
                            {req.project_title}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 text-xs line-clamp-1 hidden md:table-cell max-w-[380px]" title={req.purpose}>
                            {req.purpose}
                          </td>
                          <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} />
                              {formatDate(req.created_at)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-block px-2 py-0.5 border rounded-full text-[10px] font-bold uppercase ${REQUEST_STATUS_COLORS[validKey]}`}>
                              {t(`status.${validKey === 'in_progress' ? 'inProgress' : validKey}`)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}

        {/* New Project Modal */}
        {showNewProjectModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.newProject')}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md"
            onClick={(e) => { if (e.target === e.currentTarget) setShowNewProjectModal(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowNewProjectModal(false);
              if (e.key === 'Tab') {
                const modal = e.currentTarget;
                const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
                else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
              }
            }}
            ref={(el) => { if (el) { const btn = el.querySelector<HTMLElement>('button'); btn?.focus(); } }}
          >
            <div className="bg-white border border-zinc-200 rounded-[2rem] w-full max-w-xl shadow-[0_30px_80px_rgba(24,24,27,0.2)] animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="flex items-center justify-between p-8 border-b border-zinc-100">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-zinc-900">{t('dashboard.modal.title')}</h3>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{t('dashboard.modal.subtitle')}</p>
                </div>
                <button aria-label={en ? "Close" : "닫기"} onClick={() => setShowNewProjectModal(false)} className="p-3 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500">
                  <X size={24} />
                </button>
              </div>

              <div className="p-5 md:p-8 space-y-6 max-h-[75vh] overflow-y-auto">
                {startingIdea && <p className="rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary">{en ? 'Your editable brief will open in the planning step.' : '선택한 용도의 기본 문구가 기획 화면에 입력됩니다. 자유롭게 수정하세요.'}</p>}
                {/* Aspect Ratio */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('dashboard.modal.aspectRatio')}</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSelectedAspectRatio(AspectRatio.LANDSCAPE)}
                      className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${
                        selectedAspectRatio === AspectRatio.LANDSCAPE
                          ? 'border-primary bg-[#F0F7F4] text-primary'
                          : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                      }`}
                    >
                      <Monitor size={32} />
                      <div className="text-center">
                        <p className="font-black text-sm">{t('dashboard.modal.landscape')}</p>
                        <p className="text-[10px] mt-1 opacity-60">{t('dashboard.modal.landscapeDesc')}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setSelectedAspectRatio(AspectRatio.PORTRAIT)}
                      className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${
                        selectedAspectRatio === AspectRatio.PORTRAIT
                          ? 'border-primary bg-[#F0F7F4] text-primary'
                          : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                      }`}
                    >
                      <Smartphone size={32} />
                      <div className="text-center">
                        <p className="font-black text-sm">{t('dashboard.modal.portrait')}</p>
                        <p className="text-[10px] mt-1 opacity-60">{t('dashboard.modal.portraitDesc')}</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Scene Count */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('dashboard.modal.sceneCount')}</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {([SceneCount.CUTS_4, SceneCount.CUTS_8, SceneCount.CUTS_9, SceneCount.CUTS_18, SceneCount.CUTS_27] as SceneCount[]).map((count) => (
                      <button
                        key={count}
                        onClick={() => setSelectedSceneCount(count)}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                          selectedSceneCount === count
                            ? 'border-primary bg-[#F0F7F4] text-primary'
                            : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                        }`}
                      >
                        <span className="text-2xl font-black">{count}</span>
                        <span className="text-[10px] font-bold opacity-60">{t('common.seconds', { count: SCENE_DURATION_MAP[count] })}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedAspectRatio === AspectRatio.LANDSCAPE ? <Monitor size={16} className="text-primary" /> : <Smartphone size={16} className="text-primary" />}
                    <span className="text-sm font-bold text-zinc-900">{selectedAspectRatio === AspectRatio.LANDSCAPE ? t('dashboard.modal.landscapeLabel') : t('dashboard.modal.portraitLabel')} {selectedAspectRatio}</span>
                  </div>
                  <span className="text-sm font-bold text-zinc-500">{t('common.cuts', { count: selectedSceneCount })} · {t('common.seconds', { count: SCENE_DURATION_MAP[selectedSceneCount] })}</span>
                </div>

                {/* Start Button */}
                <button
                  onClick={handleStartProject}
                  className="w-full py-4 bg-primary text-white rounded-full font-bold text-lg flex items-center justify-center gap-2 hover:bg-[#005D53] transition-all active:scale-95 shadow-[0_8px_20px_rgba(0,117,104,0.25)]"
                >
                  <Sparkles size={20} /> {t('dashboard.modal.startProject')}
                </button>
              </div>
            </div>
          </div>
        )}

        {introSurveyStatus === 'pending' && user && (
          <IntroSurvey userId={user.id} onClose={() => setIntroSurveyStatus('done')} />
        )}
    </div>
  );
};
