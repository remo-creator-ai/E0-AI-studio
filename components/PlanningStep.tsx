
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Clock,
  Sparkles,
  AlertCircle,
  Trash2,
  Edit3,
  FileDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Type,
  Music,
  Video,
  X,
  Save,
  Monitor,
  Smartphone,
  ChevronDown,
  Upload
} from 'lucide-react';
import { useStore } from '../store';
import { useCreditStore, CREDIT_COSTS } from '../store/creditStore';
import { useSettingsStore } from '../store/settingsStore';
import { useModal } from './ui/ModalProvider';
import { AdDuration, VisualStyle, Scene, ProjectStep, StoryboardLayout, AspectRatio, SceneCount, SCENE_DURATION_MAP } from '../types';
import { generateAdScript, translateText } from '../services/geminiService';
import { parseStoryboardJSON } from '../services/storyboardImporter';
import { RefreshCw } from 'lucide-react';

interface ApiScene {
  content_kr: string;
  content_en: string;
  script_kr: string;
  script_en: string;
  image_prompt_en: string;
  video_motion_en: string;
  video_motion_kr: string;
}

interface ApiUnit {
  scenes: ApiScene[];
}

export const PlanningStep: React.FC = () => {
  const { t } = useTranslation();
  const { project, setProject, setIsLoading, isLoading, setStep, updateScene, reorderScenes, updateProjectSettings, newProjectConfig, setNewProjectConfig } = useStore();
  const { deduct, hasEnough } = useCreditStore();
  const { defaultLanguage } = useSettingsStore();
  const { alert, confirm } = useModal();
  const [idea, setIdea] = useState(project?.idea || '');
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});
  const [sceneCount, setSceneCount] = useState<SceneCount>(
    project?.scene_count || (newProjectConfig?.sceneCount ?? SceneCount.CUTS_9)
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    project?.aspect_ratio || (newProjectConfig?.aspectRatio ?? AspectRatio.LANDSCAPE)
  );
  const [style, setStyle] = useState<VisualStyle>(project?.style || VisualStyle.CINEMATIC);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (project && project.scenes.length > 0) {
      const ok = await confirm('현재 작업 중인 스토리보드가 덮어쓰여집니다. 계속하시겠습니까?', {
        type: 'warning',
        confirmText: '덮어쓰기',
        cancelText: '취소',
      });
      if (!ok) return;
    }

    try {
      const text = await file.text();
      const result = parseStoryboardJSON(text);

      if (result.error) {
        await alert(`스토리보드 업로드 실패\n\n${result.error}`, { type: 'error' });
        return;
      }
      if (!result.project) return;

      setProject(result.project);
      setIdea(result.project.idea);
      setStyle(result.project.style);

      if (result.warnings.length > 0) {
        await alert(
          `업로드 완료 (경고 ${result.warnings.length}건):\n\n${result.warnings.join('\n')}`,
          { type: 'warning' }
        );
      } else {
        await alert('스토리보드를 성공적으로 불러왔습니다.', { type: 'success' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await alert(`파일 읽기 실패: ${msg}`, { type: 'error' });
    }
  };

  const handleGenerate = async () => {
    if (!idea.trim()) return;
    if (!hasEnough(CREDIT_COSTS.SCRIPT)) {
      await alert(t('planning.alerts.insufficientCredits', { cost: CREDIT_COSTS.SCRIPT }), { type: 'warning' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await generateAdScript(idea, SCENE_DURATION_MAP[sceneCount] as AdDuration, sceneCount, aspectRatio, defaultLanguage);
      if (result && result.units) {
        let globalOrder = 0;
        const scenes: Scene[] = result.units.flatMap((u: ApiUnit) =>
          u.scenes.map((s: ApiScene) => ({
            ...s,
            content_en: s.content_en || '',
            id: crypto.randomUUID(),
            order: ++globalOrder
          }))
        );

        // Portrait 8-cut: 2x2 grid per unit (4 scenes), so 2 units
        const isPortraitGrid = aspectRatio === '9:16';
        const scenesPerUnit = (sceneCount === 8 && isPortraitGrid) ? 4
          : (sceneCount === 4) ? 4
          : Math.min(sceneCount, 9);
        const totalUnits = Math.ceil(sceneCount / scenesPerUnit);
        const grid_images = new Array(totalUnits).fill(null);

        await deduct(CREDIT_COSTS.SCRIPT, '스크립트 생성');
        setProject({
          id: crypto.randomUUID(),
          title: idea.substring(0, 20) + (idea.length > 20 ? '...' : ''),
          duration: SCENE_DURATION_MAP[sceneCount] as AdDuration,
          style,
          idea,
          scenes,
          grid_images,
          layout: StoryboardLayout.GRID_2X5,
          aspect_ratio: aspectRatio,
          scene_count: sceneCount,
          generation_language: defaultLanguage,
        });
        setNewProjectConfig(null);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      await alert(t('planning.alerts.generateError', { message }), { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const moveScene = (idx: number, direction: 'up' | 'down') => {
    if (!project) return;
    const newScenes = [...project.scenes];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newScenes.length) return;
    
    [newScenes[idx], newScenes[targetIdx]] = [newScenes[targetIdx], newScenes[idx]];
    reorderScenes(newScenes);
  };

  const removeScene = async (id: string) => {
    if (!project) return;
    const confirmed = await confirm(t('planning.alerts.deleteSceneConfirm'), { type: 'warning', confirmText: t('common.delete'), cancelText: t('common.cancel') });
    if (confirmed) {
      const newScenes = project.scenes.filter(s => s.id !== id);
      reorderScenes(newScenes);
    }
  };

  const addScene = () => {
    if (!project) return;
    const newScene: Scene = {
      id: crypto.randomUUID(),
      order: project.scenes.length + 1,
      content_kr: t('planning.newScene.content'),
      content_en: 'New scene description',
      script_kr: t('planning.newScene.script'),
      script_en: 'New English Script',
      image_prompt_en: 'AI Image generation prompt',
      video_motion_en: 'STATIC',
      video_motion_kr: t('planning.newScene.motion'),
    };
    reorderScenes([...project.scenes, newScene]);
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScene) {
      updateScene(editingScene.id, editingScene);
      setEditingScene(null);
    }
  };

  const handleSyncToImagePrompt = async () => {
    if (!editingScene?.content_kr || isSyncing) return;
    setIsSyncing(true);
    try {
      const translated = await translateText(editingScene.content_kr, 'detailed visual description for AI image generation. Convert to a rich, cinematic image prompt with lighting, composition, and style details');
      setEditingScene({ ...editingScene, image_prompt_en: translated });
    } catch {
      await alert(t('planning.alerts.syncError'), { type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadText = () => {
    if (!project) return;

    let textContent = `[REMO AI STUDIO - MASTER STORYBOARD]\n`;
    textContent += `========================================\n`;
    textContent += `PROJECT TITLE: ${project.title}\n`;
    textContent += `ASPECT RATIO: ${project.aspect_ratio || '16:9'}\n`;
    textContent += `SCENE COUNT: ${project.scene_count || 9} cuts\n`;
    textContent += `DURATION: ${project.duration} seconds\n`;
    textContent += `STYLE: ${project.style}\n`;
    textContent += `ORIGINAL IDEA: ${project.idea}\n`;
    textContent += `========================================\n\n`;

    project.scenes.forEach((scene, idx) => {
      textContent += `CUT #${String(idx + 1).padStart(2, '0')}\n`;
      textContent += `----------------------------------------\n`;
      textContent += `[VISUAL CONTENT (KR)]: ${scene.content_kr}\n`;
      textContent += `[VISUAL CONTENT (EN)]: ${scene.content_en || ''}\n`;
      textContent += `[SCRIPT (KR)]: ${scene.script_kr}\n`;
      textContent += `[MOTION (KR)]: ${scene.video_motion_kr || ''}\n`;
      textContent += `[MOTION (EN)]: ${scene.video_motion_en}\n`;
      textContent += `[IMAGE PROMPT (EN)]: ${scene.image_prompt_en}\n\n`;
    });

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `REMO_Storyboard_${project.title.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">{t('planning.title')} <span className="text-primary">{t('planning.titleHighlight')}</span></h1>
        <p className="text-gray-400">{t('planning.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Configuration */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-secondary p-6 rounded-3xl border border-white/5 space-y-4 sticky top-24">
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest">{t('planning.ideaLabel')}</label>
            <textarea
              data-tour="planning-idea-input"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              className="w-full h-32 bg-black/50 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-primary transition-all resize-none"
              placeholder={t('planning.ideaPlaceholder')}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">{t('planning.aspectRatio')}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setAspectRatio(AspectRatio.LANDSCAPE);
                      if (project && project.aspect_ratio !== AspectRatio.LANDSCAPE) {
                        const clearedScenes = project.scenes.map(s => ({ ...s, image_url: undefined, upscale_level: undefined }));
                        const sc = project.scene_count || 9;
                        const spu = sc === 4 ? 4 : Math.min(sc, 9);
                        const totalUnits = Math.ceil(sc / spu);
                        updateProjectSettings({ aspect_ratio: AspectRatio.LANDSCAPE, grid_images: new Array(totalUnits).fill(null), scenes: clearedScenes });
                      }
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                      aspectRatio === AspectRatio.LANDSCAPE
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-white/10 text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <Monitor size={14} /> 16:9
                  </button>
                  <button
                    onClick={() => {
                      setAspectRatio(AspectRatio.PORTRAIT);
                      if (project && project.aspect_ratio !== AspectRatio.PORTRAIT) {
                        const clearedScenes = project.scenes.map(s => ({ ...s, image_url: undefined, upscale_level: undefined }));
                        const sc = project.scene_count || 9;
                        const spu = (sc === 8) ? 4 : (sc === 4) ? 4 : Math.min(sc, 9);
                        const totalUnits = Math.ceil(sc / spu);
                        updateProjectSettings({ aspect_ratio: AspectRatio.PORTRAIT, grid_images: new Array(totalUnits).fill(null), scenes: clearedScenes });
                      }
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-all ${
                      aspectRatio === AspectRatio.PORTRAIT
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-white/10 text-gray-500 hover:border-white/20'
                    }`}
                  >
                    <Smartphone size={14} /> 9:16
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">{t('planning.sceneCount')}</label>
                <div className="relative">
                  <select
                    value={sceneCount}
                    onChange={(e) => {
                      const newCount = Number(e.target.value) as SceneCount;
                      setSceneCount(newCount);
                      if (project) {
                        updateProjectSettings({
                          scene_count: newCount,
                          duration: SCENE_DURATION_MAP[newCount] as AdDuration
                        });
                      }
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:border-primary text-sm font-bold"
                  >
                    <option value={4}>{t('planning.sceneOption', { count: 4, seconds: SCENE_DURATION_MAP[SceneCount.CUTS_4] })}</option>
                    <option value={8}>{t('planning.sceneOption', { count: 8, seconds: SCENE_DURATION_MAP[SceneCount.CUTS_8] })}</option>
                    <option value={9}>{t('planning.sceneOption', { count: 9, seconds: SCENE_DURATION_MAP[SceneCount.CUTS_9] })}</option>
                    <option value={18}>{t('planning.sceneOption', { count: 18, seconds: SCENE_DURATION_MAP[SceneCount.CUTS_18] })}</option>
                  </select>
                  <Clock className="absolute right-4 top-3.5 text-gray-500 pointer-events-none" size={16} />
                </div>
              </div>
            </div>

            <button
              data-tour="planning-generate-btn"
              onClick={handleGenerate}
              disabled={isLoading || !idea}
              className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-2xl flex items-center justify-center gap-2 font-black transition-all shadow-[0_10px_30px_rgba(0,87,255,0.3)] active:scale-95"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Sparkles size={20} />
                  <span>{t('planning.generateBtn')}</span>
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={isLoading}
              className="w-full py-3 bg-black/40 hover:bg-white/5 border border-white/10 hover:border-primary/40 disabled:opacity-50 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95"
              title="JSON 양식의 스토리보드 파일 업로드"
            >
              <Upload size={16} />
              <span>스토리보드 업로드 (JSON)</span>
            </button>

            <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex gap-3 text-xs leading-relaxed">
              <AlertCircle className="text-primary shrink-0" size={16} />
              <p className="text-gray-400">
                <span className="text-primary font-bold">REMO Tip:</span> {t('planning.tip')}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Timeline Editor */}
        <div data-tour="planning-timeline" className="lg:col-span-8 space-y-4">
          {!project?.scenes.length && !isLoading && (
            <div className="h-full min-h-[500px] border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center text-gray-500 gap-4">
              <Sparkles size={64} className="text-white/5" />
              <p className="font-bold text-lg">{t('planning.emptyState')}</p>
            </div>
          )}

          {isLoading && (
            <div className="h-full min-h-[500px] bg-secondary rounded-[2.5rem] flex flex-col items-center justify-center gap-8 p-12 border border-white/5">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-primary/20 rounded-full"></div>
                <div className="w-20 h-20 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0"></div>
              </div>
              <div className="text-center space-y-3">
                <h3 className="text-2xl font-black italic uppercase tracking-tighter">{t('planning.loadingTitle')}</h3>
                <p className="text-gray-400 text-sm">{t('planning.loadingSubtitle')}</p>
              </div>
            </div>
          )}

          {project && !isLoading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter">{t('planning.timelineTitle')}</h3>
                  <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-black text-gray-400 border border-white/5 uppercase tracking-widest">{t('planning.cutsCount', { count: project.scenes.length })}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleDownloadText}
                    className="p-3 bg-secondary hover:bg-white/5 border border-white/10 text-gray-400 hover:text-white rounded-2xl transition-all"
                    title="TXT Export"
                  >
                    <FileDown size={20} />
                  </button>
                  <button 
                    onClick={() => setStep(ProjectStep.VISUALIZING)}
                    className="px-8 py-3 bg-white text-black font-black rounded-2xl hover:bg-gray-200 transition-all active:scale-95 shadow-2xl uppercase text-sm tracking-tighter"
                  >
                    {t('planning.nextStep')}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {project.scenes.map((scene, idx) => (
                  <div key={scene.id} className="group bg-secondary p-8 rounded-[2rem] border border-white/5 hover:border-primary/40 transition-all flex flex-col gap-6 relative overflow-hidden">
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-black/40 flex items-center justify-center text-xl font-black italic text-primary/80 border border-white/5 group-hover:border-primary/50 transition-all">
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        <span className="text-sm font-black text-gray-400 uppercase tracking-widest italic group-hover:text-primary transition-colors">{t('planning.cutSequence')}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingScene(scene)} className="p-2.5 bg-black/40 hover:bg-primary/20 rounded-xl text-gray-400 hover:text-primary transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                          <Edit3 size={14} /> {t('planning.edit')}
                        </button>
                        <div className="h-6 w-[1px] bg-white/5 mx-2" />
                        <button onClick={() => moveScene(idx, 'up')} className="p-2.5 bg-black/40 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all"><ArrowUp size={16} /></button>
                        <button onClick={() => moveScene(idx, 'down')} className="p-2.5 bg-black/40 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all"><ArrowDown size={16} /></button>
                        <button onClick={() => removeScene(scene.id)} className="p-2.5 bg-black/40 hover:bg-red-500/20 rounded-xl text-gray-400 hover:text-red-500 transition-all ml-2"><Trash2 size={16} /></button>
                      </div>
                    </div>

                    {/* 1-Column Content Display */}
                    <div className="space-y-6">
                      {/* [Visual Content] — primary language */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Type size={14} className="text-primary" />
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('planning.visualContent')}</span>
                        </div>
                        <p className="text-lg font-medium text-white leading-relaxed">
                          {defaultLanguage === 'en' ? (scene.content_en || scene.content_kr) : scene.content_kr}
                        </p>
                      </div>

                      {/* [Audio / Text] — primary language */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Music size={14} className="text-primary" />
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('planning.audioScript')}</span>
                        </div>
                        <div className="bg-black/30 p-4 rounded-2xl border border-white/5">
                          <p className="text-base italic text-gray-400 font-medium">
                            "{defaultLanguage === 'en' ? scene.script_en : scene.script_kr}"
                          </p>
                        </div>
                      </div>

                      {/* [Camera Motion] */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Video size={14} className="text-primary" />
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('planning.cameraMotion')}</span>
                        </div>
                        <p className="text-base font-bold text-gray-300 tracking-tight">
                          {defaultLanguage === 'en' ? scene.video_motion_en : (scene.video_motion_kr || scene.video_motion_en)}
                        </p>
                      </div>

                      {/* Accordion: Secondary language + EN prompts */}
                      <div className="border border-white/5 rounded-2xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedAccordions(prev => ({ ...prev, [scene.id]: !prev[scene.id] }))}
                          className="w-full flex items-center justify-between px-5 py-3.5 bg-white/[0.02] hover:bg-white/[0.04] transition-all text-left"
                        >
                          <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                            {defaultLanguage === 'ko' ? t('planning.accordion.enPrompts') : t('planning.accordion.krContent')}
                          </span>
                          <ChevronDown size={16} className={`text-gray-500 transition-transform duration-200 ${expandedAccordions[scene.id] ? 'rotate-180' : ''}`} />
                        </button>
                        {expandedAccordions[scene.id] && (
                          <div className="px-5 py-4 space-y-4 border-t border-white/5 bg-black/20">
                            {defaultLanguage === 'ko' ? (
                              <>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Scene Description (EN)</span>
                                  <p className="text-sm text-gray-300 leading-relaxed">{scene.content_en || '—'}</p>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Script (EN)</span>
                                  <p className="text-sm text-gray-300 italic leading-relaxed">"{scene.script_en}"</p>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Image Prompt (EN)</span>
                                  <p className="text-sm text-gray-400 font-mono leading-relaxed">{scene.image_prompt_en}</p>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Camera Motion (EN)</span>
                                  <p className="text-sm text-gray-300 font-bold uppercase">{scene.video_motion_en}</p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('planning.editModal.visualContentKr')}</span>
                                  <p className="text-sm text-gray-300 leading-relaxed">{scene.content_kr}</p>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('planning.editModal.audioScriptKr')}</span>
                                  <p className="text-sm text-gray-300 italic leading-relaxed">"{scene.script_kr}"</p>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('planning.editModal.motionKr')}</span>
                                  <p className="text-sm text-gray-300 font-bold">{scene.video_motion_kr}</p>
                                </div>
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Image Prompt (EN)</span>
                                  <p className="text-sm text-gray-400 font-mono leading-relaxed">{scene.image_prompt_en}</p>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addScene}
                  className="w-full py-8 border-2 border-dashed border-white/5 rounded-[2rem] flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all group"
                >
                  <Plus size={32} className="group-hover:scale-110 transition-transform" />
                  <span className="font-black italic uppercase tracking-tighter">{t('planning.addCut')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal Popup */}
      {editingScene && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
          <div className="bg-secondary border border-white/10 rounded-[2.5rem] w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="flex items-center justify-between p-8 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/20 rounded-2xl text-primary">
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black italic tracking-tighter uppercase">{t('planning.editModal.title')}</h3>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('planning.editModal.subtitle')}</p>
                </div>
              </div>
              <button onClick={() => setEditingScene(null)} className="p-3 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <form onSubmit={handleSaveModal} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Primary language section */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-2"><Type size={12} className="text-primary" /> {t('planning.editModal.visualContentKr')}</span>
                    <button type="button" onClick={handleSyncToImagePrompt} disabled={isSyncing} className="text-primary hover:text-primary/80 flex items-center gap-1 disabled:opacity-50">
                      <RefreshCw size={10} className={isSyncing ? 'animate-spin' : ''} /> {t('planning.editModal.syncPrompt')}
                    </button>
                  </label>
                  <textarea
                    value={editingScene.content_kr}
                    onChange={(e) => setEditingScene({...editingScene, content_kr: e.target.value})}
                    className="w-full h-20 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all text-white"
                    placeholder={t('planning.editModal.visualPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Type size={12} className="text-primary" /> {t('planning.editModal.visualContentEn')}
                  </label>
                  <textarea
                    value={editingScene.content_en || ''}
                    onChange={(e) => setEditingScene({...editingScene, content_en: e.target.value})}
                    className="w-full h-20 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all text-white"
                    placeholder="Scene description in English"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Music size={12} className="text-primary" /> {t('planning.editModal.audioScriptKr')}
                    </label>
                    <textarea
                      value={editingScene.script_kr}
                      onChange={(e) => setEditingScene({...editingScene, script_kr: e.target.value})}
                      className="w-full h-20 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all italic text-gray-300"
                      placeholder={t('planning.editModal.scriptPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Music size={12} className="text-primary" /> {t('planning.editModal.audioScriptEn')}
                    </label>
                    <textarea
                      value={editingScene.script_en}
                      onChange={(e) => setEditingScene({...editingScene, script_en: e.target.value})}
                      className="w-full h-20 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all italic text-gray-300"
                      placeholder="English script / dialogue"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Video size={12} className="text-primary" /> {t('planning.editModal.motionKr')}
                    </label>
                    <textarea
                      value={editingScene.video_motion_kr || ''}
                      onChange={(e) => setEditingScene({...editingScene, video_motion_kr: e.target.value})}
                      className="w-full h-16 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none font-bold text-white"
                      placeholder={t('planning.editModal.motionKrPlaceholder')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Video size={12} className="text-primary" /> {t('planning.editModal.motionEn')}
                    </label>
                    <textarea
                      value={editingScene.video_motion_en}
                      onChange={(e) => setEditingScene({...editingScene, video_motion_en: e.target.value})}
                      className="w-full h-16 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none resize-none font-bold uppercase text-white"
                      placeholder="e.g. SLOW ZOOM IN"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={12} className="text-primary" /> {t('planning.editModal.imagePromptEn')}
                  </label>
                  <textarea
                    value={editingScene.image_prompt_en}
                    onChange={(e) => setEditingScene({...editingScene, image_prompt_en: e.target.value})}
                    className="w-full h-20 bg-black/50 border border-white/10 rounded-xl p-4 text-xs focus:border-primary focus:outline-none resize-none text-gray-400 font-mono"
                    placeholder="AI Generation Prompt"
                  />
                </div>
              </div>

              <div className="flex gap-4 justify-end pt-8 border-t border-white/5">
                <button type="button" onClick={() => setEditingScene(null)} className="px-8 py-3 rounded-2xl text-sm font-bold hover:bg-white/5 transition-all text-gray-400">{t('common.cancel')}</button>
                <button type="submit" className="px-10 py-3 bg-primary rounded-2xl text-sm font-black shadow-[0_10px_30px_rgba(0,87,255,0.3)] flex items-center gap-2 hover:scale-105 transition-all">
                  <Save size={18} /> {t('planning.editModal.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
