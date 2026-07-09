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

type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

const REQUEST_STATUS_LABELS_KR: Record<RequestStatus, string> = {
  pending: '대기 중',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소됨',
};

const REQUEST_STATUS_COLORS: Record<RequestStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/15 text-green-400 border-green-500/30',
  cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

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
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { setProject, setStep } = useStore();
  const { alert, confirm } = useModal();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [myRequests, setMyRequests] = useState<ProductionRequestSummary[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);
  const [selectedSceneCount, setSelectedSceneCount] = useState<SceneCount>(SceneCount.CUTS_9);

  useEffect(() => {
    if (user?.id) {
      loadProjects();
      loadMyRequests();
    }
  }, [user?.id]);

  const loadProjects = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
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
    } finally {
      setIsLoading(false);
    }
  };

  const loadMyRequests = async () => {
    if (!user) return;
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
    setShowNewProjectModal(true);
  };

  const handleStartProject = () => {
    const { setNewProjectConfig } = useStore.getState();
    setNewProjectConfig({ aspectRatio: selectedAspectRatio, sceneCount: selectedSceneCount });
    setProject(null);
    setStep(ProjectStep.PLANNING);
    setShowNewProjectModal(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    const confirmed = await confirm(t('dashboard.alerts.deleteConfirm'), { type: 'warning', confirmText: t('common.delete'), cancelText: t('common.cancel') });
    if (!confirmed) return;

    try {
      const { error } = await supabase
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

  return (
    <div className="space-y-8">
        <div className="flex items-end justify-between">
          <div data-tour="dashboard-welcome" className="space-y-2">
            <h2 className="text-4xl font-black italic uppercase tracking-tighter">
              {t('dashboard.title')} <span className="text-primary">{t('dashboard.titleHighlight')}</span>
            </h2>
            <p className="text-gray-400 text-sm">{t('dashboard.subtitle')}</p>
          </div>
          <button
            data-tour="dashboard-new-project"
            onClick={handleNewProject}
            className="px-8 py-3 bg-primary rounded-2xl font-black flex items-center gap-2 hover:bg-primary/90 transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,87,255,0.3)]"
          >
            <Plus size={20} /> {t('dashboard.newProject')}
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && projects.length === 0 && (
          <div className="text-center py-20 space-y-6">
            <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto">
              <Film size={40} className="text-gray-600" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter">{t('dashboard.emptyTitle')}</h3>
              <p className="text-gray-500 text-sm">{t('dashboard.emptySubtitle')}</p>
            </div>
            <button
              onClick={handleNewProject}
              className="px-10 py-4 bg-white text-black rounded-2xl font-black hover:bg-gray-100 transition-all active:scale-95 shadow-2xl"
            >
              <Plus size={20} className="inline mr-2" /> {t('dashboard.createProject')}
            </button>
          </div>
        )}

        {/* Project Grid */}
        {!isLoading && projects.length > 0 && (
          <div className="space-y-4">
          <div data-tour="dashboard-project-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(showAllProjects ? projects : projects.slice(0, 3)).map((project) => (
              <div
                key={project.id}
                className="group bg-[#0A0A0A] border border-white/5 rounded-[2rem] overflow-hidden hover:border-primary/40 transition-all duration-300 cursor-pointer"
                onClick={() => handleOpenProject(project.id)}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-black relative overflow-hidden">
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ImageIcon size={48} className="text-white/5" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-lg font-black italic uppercase tracking-tighter truncate">{project.title}</h3>
                  </div>
                </div>

                {/* Info */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-black text-primary uppercase">
                      {project.style}
                    </span>
                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-gray-400 uppercase">
                      {project.duration}s
                    </span>
                    <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-gray-400 uppercase">
                      {project.scenes_count} cuts
                    </span>
                  </div>

                  {/* Progress Bars */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      <span className="flex items-center gap-1"><Layers size={10} /> Images</span>
                      <span>{project.images_done}/{project.scenes_count}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${project.scenes_count > 0 ? (project.images_done / project.scenes_count) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      <span className="flex items-center gap-1"><Film size={10} /> Videos</span>
                      <span>{project.videos_done}/{project.scenes_count}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${project.scenes_count > 0 ? (project.videos_done / project.scenes_count) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Last Stage */}
                  {project.current_stage && (
                    <div className="text-[10px] text-gray-500 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60" />
                      <span>{t('dashboard.lastStage', { stage: project.current_stage })}</span>
                    </div>
                  )}

                  {/* Creator Badge */}
                  {project.original_creator_id && user && project.original_creator_id !== user.id && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/5 border border-accent/20 rounded-xl">
                      {project.creator_avatar_url ? (
                        <img src={project.creator_avatar_url} alt="" className="w-4 h-4 rounded-full" />
                      ) : (
                        <User size={12} className="text-accent" />
                      )}
                      <span className="text-[10px] font-bold text-accent/80">
                        {t('dashboard.originalCreator', { name: project.creator_display_name || t('dashboard.unknownCreator') })}
                      </span>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[10px] font-bold text-gray-600 flex items-center gap-1">
                      <Clock size={10} /> {formatDate(project.updated_at)}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id);
                        }}
                        className="p-2 hover:bg-red-500/10 rounded-xl text-gray-600 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={16} className="text-gray-600 group-hover:text-primary transition-colors" />
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
                className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-all"
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
              <h3 className="text-lg font-black italic uppercase tracking-tighter">
                {t('dashboard.myRequests')} <span className="text-primary">{t('dashboard.myRequestsHighlight')}</span>
              </h3>
            </div>

            {requestsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myRequests.map((req) => {
                  const statusKey = (req.status || 'pending') as RequestStatus;
                  const validKey: RequestStatus = ['pending', 'in_progress', 'completed', 'cancelled'].includes(statusKey)
                    ? statusKey
                    : 'pending';
                  return (
                    <div
                      key={req.id}
                      className="bg-[#0A0A0A] border border-white/5 rounded-2xl p-4 space-y-3 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-white truncate flex-1">{req.project_title}</h4>
                        <span className={`shrink-0 px-2 py-0.5 border rounded-full text-[10px] font-black uppercase ${REQUEST_STATUS_COLORS[validKey]}`}>
                          {t(`status.${validKey === 'in_progress' ? 'inProgress' : validKey}`)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 line-clamp-2">{req.purpose}</p>
                      <div className="flex items-center gap-1 text-[10px] text-gray-600">
                        <Clock size={10} />
                        {formatDate(req.created_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* New Project Modal */}
        {showNewProjectModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('dashboard.newProject')}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
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
            <div className="bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] w-full max-w-xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
              <div className="flex items-center justify-between p-8 border-b border-white/5">
                <div>
                  <h3 className="text-2xl font-black italic tracking-tighter uppercase">{t('dashboard.modal.title')}</h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{t('dashboard.modal.subtitle')}</p>
                </div>
                <button onClick={() => setShowNewProjectModal(false)} className="p-3 hover:bg-white/5 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Aspect Ratio */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('dashboard.modal.aspectRatio')}</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setSelectedAspectRatio(AspectRatio.LANDSCAPE)}
                      className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${
                        selectedAspectRatio === AspectRatio.LANDSCAPE
                          ? 'border-primary bg-primary/10 text-white'
                          : 'border-white/10 text-gray-500 hover:border-white/20'
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
                          ? 'border-primary bg-primary/10 text-white'
                          : 'border-white/10 text-gray-500 hover:border-white/20'
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
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('dashboard.modal.sceneCount')}</label>
                  <div className="grid grid-cols-4 gap-3">
                    {([SceneCount.CUTS_4, SceneCount.CUTS_8, SceneCount.CUTS_9, SceneCount.CUTS_18] as SceneCount[]).map((count) => (
                      <button
                        key={count}
                        onClick={() => setSelectedSceneCount(count)}
                        className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                          selectedSceneCount === count
                            ? 'border-primary bg-primary/10 text-white'
                            : 'border-white/10 text-gray-500 hover:border-white/20'
                        }`}
                      >
                        <span className="text-2xl font-black">{count}</span>
                        <span className="text-[10px] font-bold opacity-60">{t('common.seconds', { count: SCENE_DURATION_MAP[count] })}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedAspectRatio === AspectRatio.LANDSCAPE ? <Monitor size={16} className="text-primary" /> : <Smartphone size={16} className="text-primary" />}
                    <span className="text-sm font-bold">{selectedAspectRatio === AspectRatio.LANDSCAPE ? t('dashboard.modal.landscapeLabel') : t('dashboard.modal.portraitLabel')} {selectedAspectRatio}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-400">{t('common.cuts', { count: selectedSceneCount })} · {t('common.seconds', { count: SCENE_DURATION_MAP[selectedSceneCount] })}</span>
                </div>

                {/* Start Button */}
                <button
                  onClick={handleStartProject}
                  className="w-full py-4 bg-primary rounded-2xl font-black text-lg flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-95 shadow-[0_10px_30px_rgba(0,87,255,0.3)]"
                >
                  <Sparkles size={20} /> {t('dashboard.modal.startProject')}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};
