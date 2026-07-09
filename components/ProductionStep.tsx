
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Rocket,
  Sparkles,
  Play,
  Download,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Key,
  MonitorPlay,
  Layers,
  Film,
  Zap,
  Lock,
  ChevronLeft,
  ChevronRight,
  Check,
  Maximize2,
  Trash2,
  Edit3,
  X,
  Save,
  Cpu,
  CheckSquare,
  Square,
  ListChecks,
  XCircle,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  StopCircle,
  Clock,
  Loader2,
  Home,
  Mail,
  FileDown,
  Paperclip
} from 'lucide-react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useCreditStore, CREDIT_COSTS } from '../store/creditStore';
import { useModal } from './ui/ModalProvider';
import { generateSceneVideo } from '../services/geminiService';
import { sceneImageToBlob } from '../services/imageUtils';
import { Scene, BatchSceneStatus, BatchQueueItem, ProjectStep } from '../types';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';

// LOADING_MESSAGES moved inside component to use t()

export const ProductionStep: React.FC = () => {
  const { project, updateScene, setIsLoading, isLoading, setProject, setStep } = useStore();
  const { user } = useAuthStore();
  const { deduct, hasEnough, balance } = useCreditStore();
  const { alert, confirm } = useModal();
  const { t } = useTranslation();
  const LOADING_MESSAGES = [
    t('production.loadingMessages.msg1'),
    t('production.loadingMessages.msg2'),
    t('production.loadingMessages.msg3'),
    t('production.loadingMessages.msg4'),
    t('production.loadingMessages.msg5'),
    t('production.loadingMessages.msg6'),
  ];
  const [hasKey, setHasKey] = useState(true);
  const [renderingSceneId, setRenderingSceneId] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [engine, setEngine] = useState<'veo31' | 'kling'>('kling');
  const [editingScene, setEditingScene] = useState<Scene | null>(null);

  // Batch selection mode
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);

  // Batch queue
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
  const [isBatchActive, setIsBatchActive] = useState(false);
  const batchAbortRef = useRef(false);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(true);
  const [modalStep, setModalStep] = useState<'main' | 'form'>('main');
  const [storyboardDownloaded, setStoryboardDownloaded] = useState(false);
  const [assetsDownloaded, setAssetsDownloaded] = useState(false);
  const [requestPurpose, setRequestPurpose] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [requesterName, setRequesterName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const extraFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      // If Gemini API key is configured via env, no need for AI Studio key selector
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (envKey && envKey !== 'your_gemini_api_key_here') {
        setHasKey(true);
        return;
      }
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (renderingSceneId) {
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [renderingSceneId]);

  if (!project) {
    return (
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
        {/* Production Dashboard Header Frame */}
        <div className="relative group overflow-hidden bg-secondary border border-white/10 rounded-[3rem] p-10 shadow-2xl">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/20 blur-[100px]"></div>
          <div className="flex flex-col items-center justify-center gap-8 relative z-10 py-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-black uppercase tracking-widest">
              <Film size={12} /> REMO V-ENGINE PRODUCTION
            </div>
            <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none text-center">
              Cinematic <span className="text-primary">Production</span>
            </h1>

            {/* Empty State Content */}
            <div className="flex flex-col items-center gap-6 mt-4">
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Video size={36} className="text-gray-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-xl font-black italic uppercase tracking-tighter text-white">{t('production.noProject')}</p>
                <p className="text-sm text-gray-500 whitespace-pre-line leading-relaxed">
                  {t('production.noProjectDesc')}
                </p>
              </div>
              <button
                onClick={() => setStep(ProjectStep.DASHBOARD)}
                className="px-8 py-4 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black italic uppercase text-sm flex items-center gap-3 shadow-[0_8px_30px_rgba(0,87,255,0.3)] hover:scale-105 active:scale-95 transition-all"
              >
                <Home size={18} />
                {t('production.goToDashboard')}
              </button>
            </div>
          </div>
        </div>

        {/* Placeholder Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-secondary rounded-[2.5rem] border border-dashed border-white/10 overflow-hidden flex flex-col opacity-30">
              <div className="aspect-video bg-black/40 flex items-center justify-center">
                <Film size={32} className="text-gray-700" />
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <div className="h-2 bg-white/5 rounded-full w-1/3" />
                  <div className="h-3 bg-white/5 rounded-full w-full" />
                  <div className="h-3 bg-white/5 rounded-full w-2/3" />
                </div>
                <div className="space-y-2">
                  <div className="h-2 bg-white/5 rounded-full w-1/4" />
                  <div className="h-3 bg-white/5 rounded-full w-3/4" />
                </div>
                <div className="h-12 bg-white/5 rounded-2xl mt-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const handleOpenKeySelector = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
        await window.aistudio.openSelectKey();
        setHasKey(true);
    }
  };

  const getVideoCreditCost = () => {
    return engine === 'kling' ? CREDIT_COSTS.VIDEO_STANDARD : CREDIT_COSTS.VIDEO_HD;
  };

  const handleGenerateVideo = async (sceneId: string) => {
    // Kling uses env-based keys, only check AI Studio key for VEO
    if (engine === 'veo31' && !hasKey) {
      handleOpenKeySelector();
      return;
    }

    const cost = getVideoCreditCost();
    if (!hasEnough(cost)) {
      await alert(t('production.alerts.insufficientCredits', { cost }), { type: 'warning' });
      return;
    }

    const scene = project.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setRenderingSceneId(sceneId);
    setIsLoading(true);

    try {
      const videoUrl = await generateSceneVideo(
        `${scene.image_prompt_en}, ${scene.video_motion_en}`,
        scene.image_url,
        engine,
        project?.aspect_ratio
      );
      if (videoUrl) {
        await deduct(cost, `영상 생성 (${engine})`);
        updateScene(sceneId, { video_url: videoUrl });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "API_KEY_EXPIRED") {
        await alert(t('production.alerts.invalidKey'), { type: 'error' });
        setHasKey(false);
      } else {
        console.error(error);
        await alert(t('production.alerts.generateError'), { type: 'error' });
      }
    } finally {
      setRenderingSceneId(null);
      setIsLoading(false);
    }
  };

  const handleSavePromptEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScene) {
      updateScene(editingScene.id, {
        image_prompt_en: editingScene.image_prompt_en,
        video_motion_en: editingScene.video_motion_en
      });
      setEditingScene(null);
    }
  };

  // --- Batch Selection Helpers ---
  const toggleSceneSelection = (sceneId: string) => {
    setSelectedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  };

  const selectAll = () => {
    const ids = new Set(project.scenes.filter(s => s.image_url).map(s => s.id));
    setSelectedSceneIds(ids);
  };

  const deselectAll = () => setSelectedSceneIds(new Set());

  const selectMissing = () => {
    const ids = new Set(project.scenes.filter(s => s.image_url && !s.video_url).map(s => s.id));
    setSelectedSceneIds(ids);
  };

  const applyRange = () => {
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);
    const ids = new Set(
      project.scenes.slice(start, end + 1).filter(s => s.image_url).map(s => s.id)
    );
    setSelectedSceneIds(ids);
  };

  // --- Batch Queue Status Helper ---
  const getSceneBatchStatus = (sceneId: string): BatchSceneStatus => {
    const item = batchQueue.find(q => q.sceneId === sceneId);
    return item?.status ?? 'idle';
  };

  const getSceneBatchError = (sceneId: string): string | undefined => {
    return batchQueue.find(q => q.sceneId === sceneId)?.error;
  };

  const MAX_CONCURRENT = 2;

  const processBatchQueue = useCallback(async (queue: BatchQueueItem[]) => {
    batchAbortRef.current = false;
    setIsBatchActive(true);
    setIsDashboardExpanded(true);

    const remaining = [...queue];
    const active: Promise<void>[] = [];

    const updateItem = (sceneId: string, updates: Partial<BatchQueueItem>) => {
      setBatchQueue(prev => prev.map(item =>
        item.sceneId === sceneId ? { ...item, ...updates } : item
      ));
    };

    const processOne = async (item: BatchQueueItem): Promise<void> => {
      if (batchAbortRef.current) return;

      const scene = project!.scenes.find(s => s.id === item.sceneId);
      if (!scene) {
        updateItem(item.sceneId, { status: 'failed', error: 'Scene not found' });
        return;
      }

      updateItem(item.sceneId, { status: 'generating' });

      const batchCost = getVideoCreditCost();
      if (!hasEnough(batchCost)) {
        updateItem(item.sceneId, { status: 'failed', error: t('production.alerts.insufficientCredits', { cost: 0 }) });
        batchAbortRef.current = true;
        return;
      }

      try {
        const videoUrl = await generateSceneVideo(
          `${scene.image_prompt_en}, ${scene.video_motion_en}`,
          scene.image_url,
          engine,
          project!.aspect_ratio
        );
        if (videoUrl) {
          await deduct(batchCost, `배치 영상 생성 (${engine})`);
          updateScene(item.sceneId, { video_url: videoUrl });
          updateItem(item.sceneId, { status: 'completed' });
        } else {
          updateItem(item.sceneId, { status: 'failed', error: 'No video URL returned' });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        updateItem(item.sceneId, { status: 'failed', error: message });

        if (message === 'API_KEY_EXPIRED') {
          batchAbortRef.current = true;
          await alert(t('production.alerts.batchKeyError'), { type: 'error' });
          setHasKey(false);
        }
      }
    };

    const startNext = (): Promise<void> | null => {
      if (batchAbortRef.current) return null;
      const next = remaining.shift();
      if (!next) return null;
      const p = processOne(next);
      active.push(p);
      return p;
    };

    // Fill initial slots
    for (let i = 0; i < MAX_CONCURRENT && remaining.length > 0; i++) {
      startNext();
    }

    // Process remaining with Promise.race for slot filling
    while (active.length > 0) {
      await Promise.race(active);
      // Remove settled promises
      for (let i = active.length - 1; i >= 0; i--) {
        const settled = await Promise.race([active[i].then(() => true), Promise.resolve(false)]);
        if (settled) active.splice(i, 1);
      }
      // Fill empty slots
      while (active.length < MAX_CONCURRENT && remaining.length > 0 && !batchAbortRef.current) {
        startNext();
      }
    }

    setIsBatchActive(false);
  }, [project, engine, updateScene, alert]);

  const handleStartBatch = async () => {
    if (selectedSceneIds.size === 0) return;

    if (engine === 'veo31' && !hasKey) {
      handleOpenKeySelector();
      return;
    }

    const totalBatchCost = selectedSceneIds.size * getVideoCreditCost();
    if (!hasEnough(totalBatchCost)) {
      await alert(t('production.alerts.batchInsufficientCredits', { count: selectedSceneIds.size, cost: totalBatchCost }), { type: 'warning' });
      return;
    }

    const isConfirmed = await confirm(
      t('production.alerts.batchConfirm', { count: selectedSceneIds.size, cost: totalBatchCost }),
      { type: 'info' }
    );
    if (!isConfirmed) return;

    const queue: BatchQueueItem[] = project!.scenes
      .filter(s => selectedSceneIds.has(s.id))
      .map(s => ({ sceneId: s.id, status: 'queued' as BatchSceneStatus }));

    setBatchQueue(queue);
    setIsSelectionMode(false);
    processBatchQueue(queue);
  };

  const handleCancelBatch = () => {
    batchAbortRef.current = true;
  };

  const handleClearQueue = () => {
    setBatchQueue([]);
    setIsDashboardExpanded(false);
  };

  // Batch progress stats
  const batchTotal = batchQueue.length;
  const batchCompleted = batchQueue.filter(q => q.status === 'completed').length;
  const batchFailed = batchQueue.filter(q => q.status === 'failed').length;
  const batchGenerating = batchQueue.filter(q => q.status === 'generating').length;
  const batchQueued = batchQueue.filter(q => q.status === 'queued').length;
  const batchProgress = batchTotal > 0 ? Math.round(((batchCompleted + batchFailed) / batchTotal) * 100) : 0;
  const batchDone = batchTotal > 0 && batchQueued === 0 && batchGenerating === 0;

  const videoScenesCount = project.scenes.filter(s => !!s.video_url).length;
  const progress = Math.round((videoScenesCount / project.scenes.length) * 100);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Production Dashboard Header */}
      <div className="relative group overflow-hidden bg-secondary border border-white/10 rounded-[3rem] p-10 shadow-2xl">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/20 blur-[100px] group-hover:bg-primary/30 transition-all duration-1000"></div>

        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10">
          <div className="space-y-4 text-center lg:text-left flex-1">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-primary text-[10px] font-black uppercase tracking-widest">
              <Film size={12} /> REMO V-ENGINE PRODUCTION
            </div>
            <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none">
              Cinematic <span className="text-primary">Production</span>
            </h1>

            {/* Engine Selection */}
            <div className="flex items-center gap-4 pt-2">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Select Engine:</span>
              <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                <button
                  onClick={() => setEngine('kling')}
                  className={`px-6 py-2 rounded-xl text-xs font-black italic transition-all flex items-center gap-2 ${engine === 'kling' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                >
                  <Cpu size={14} /> KLING (Budget)
                </button>
                <button
                  onClick={() => setEngine('veo31')}
                  className={`px-6 py-2 rounded-xl text-xs font-black italic transition-all flex items-center gap-2 ${engine === 'veo31' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                >
                  <Sparkles size={14} /> VEO 3.1 (High-End)
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            {!hasKey ? (
              <button
                onClick={handleOpenKeySelector}
                className="group px-10 py-5 bg-white text-black rounded-[2rem] font-black italic text-lg flex items-center gap-3 shadow-[0_20px_50px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 transition-all"
              >
                <Lock size={20} className="group-hover:animate-bounce" />
                UNLOCK V-ENGINE
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-6 rounded-[2.5rem] flex items-center gap-8 shadow-inner">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Progress</span>
                    <div className="text-4xl font-black italic text-primary">{progress}%</div>
                  </div>
                  <div className="h-12 w-[1px] bg-white/10" />
                  <div className="text-center">
                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Assets Ready</div>
                    <div className="text-xl font-black">{videoScenesCount} / {project.scenes.length}</div>
                  </div>
                </div>
                <button
                  onClick={handleOpenKeySelector}
                  className="text-[9px] font-black text-gray-500 hover:text-primary flex items-center gap-1 transition-colors uppercase tracking-widest hover:underline"
                >
                  <Key size={10} /> Change Project API Key
                </button>
              </div>
            )}
            <p className="text-[9px] text-gray-500 font-bold uppercase text-center">
              * Requires Paid API Key for high-res production
            </p>
          </div>
        </div>
      </div>

      {/* Batch Control Bar */}
      <div className="bg-secondary border border-white/10 rounded-[2rem] p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Batch Mode Toggle */}
          <button
            onClick={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) deselectAll(); }}
            disabled={isBatchActive}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black italic uppercase tracking-tight transition-all flex items-center gap-2 border ${
              isSelectionMode
                ? 'bg-primary text-white border-primary shadow-lg'
                : 'bg-black/40 text-gray-400 border-white/10 hover:border-primary/40 hover:text-white'
            } disabled:opacity-30`}
          >
            <LayoutGrid size={14} />
            BATCH MODE {isSelectionMode ? 'ON' : 'OFF'}
          </button>

          {isSelectionMode && (
            <>
              <div className="h-6 w-[1px] bg-white/10" />

              {/* Quick Select Buttons */}
              <button onClick={selectAll} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-black/40 border border-white/10 text-gray-400 hover:text-white hover:border-primary/40 transition-all">
                Select All
              </button>
              <button onClick={deselectAll} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-black/40 border border-white/10 text-gray-400 hover:text-white hover:border-primary/40 transition-all">
                Deselect All
              </button>
              <button onClick={selectMissing} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-black/40 border border-white/10 text-gray-400 hover:text-white hover:border-primary/40 transition-all flex items-center gap-1.5">
                <ListChecks size={12} /> Select Missing
              </button>

              <div className="h-6 w-[1px] bg-white/10" />

              {/* Range Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Range:</span>
                <select
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Number(e.target.value))}
                  className="bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-primary"
                >
                  {project.scenes.map((_, i) => (
                    <option key={i} value={i}>Cut #{String(i + 1).padStart(2, '0')}</option>
                  ))}
                </select>
                <span className="text-gray-500 text-xs">~</span>
                <select
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Number(e.target.value))}
                  className="bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-primary"
                >
                  {project.scenes.map((_, i) => (
                    <option key={i} value={i}>Cut #{String(i + 1).padStart(2, '0')}</option>
                  ))}
                </select>
                <button onClick={applyRange} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-primary/40 transition-all">
                  Apply
                </button>
              </div>

              <div className="h-6 w-[1px] bg-white/10" />

              {/* Generate Selected Button */}
              <button
                onClick={handleStartBatch}
                disabled={selectedSceneIds.size === 0}
                className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-[11px] font-black italic uppercase tracking-tight transition-all flex items-center gap-2 shadow-lg disabled:opacity-30 active:scale-95"
              >
                <Rocket size={14} />
                Generate Selected ({selectedSceneIds.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Batch Dashboard Panel */}
      {batchQueue.length > 0 && (
        <div className="bg-secondary border border-white/10 rounded-[2rem] overflow-hidden">
          {/* Dashboard Header */}
          <button
            onClick={() => setIsDashboardExpanded(!isDashboardExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <Film size={14} /> BATCH PROGRESS
              </div>
              <div className="text-sm font-black italic">
                {batchDone ? (
                  <span className="text-green-400">{batchCompleted} completed{batchFailed > 0 ? `, ${batchFailed} failed` : ''}</span>
                ) : (
                  <span className="text-white">Generating {batchCompleted + batchFailed} / {batchTotal}...</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-black italic text-primary">{batchProgress}%</div>
              {isDashboardExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
            </div>
          </button>

          {/* Progress Bar */}
          <div className="px-6 pb-2">
            <div className="h-1.5 bg-black/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${batchProgress}%` }}
              />
            </div>
          </div>

          {/* Expanded Details */}
          {isDashboardExpanded && (
            <div className="px-6 pb-6 space-y-4">
              {/* Scene Status Tiles */}
              <div className="flex flex-wrap gap-2 pt-2">
                {batchQueue.map((item) => {
                  const scene = project.scenes.find(s => s.id === item.sceneId);
                  const idx = scene ? project.scenes.indexOf(scene) : -1;
                  return (
                    <div
                      key={item.sceneId}
                      title={item.error ? `Cut #${idx + 1}: ${item.error}` : `Cut #${idx + 1}`}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-[9px] font-black border transition-all ${
                        item.status === 'queued' ? 'bg-gray-800 border-gray-700 text-gray-500' :
                        item.status === 'generating' ? 'bg-primary/20 border-primary text-primary batch-pulse' :
                        item.status === 'completed' ? 'bg-green-500/20 border-green-500/50 text-green-400' :
                        item.status === 'failed' ? 'bg-red-500/20 border-red-500/50 text-red-400' :
                        'bg-gray-800 border-gray-700 text-gray-500'
                      }`}
                    >
                      {item.status === 'queued' && <Clock size={14} />}
                      {item.status === 'generating' && <Loader2 size={14} className="animate-spin" />}
                      {item.status === 'completed' && <CheckCircle2 size={14} />}
                      {item.status === 'failed' && <XCircle size={14} />}
                    </div>
                  );
                })}
              </div>

              {/* Batch Action Buttons */}
              <div className="flex gap-3 pt-2">
                {isBatchActive && (
                  <button
                    onClick={handleCancelBatch}
                    className="px-5 py-2.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-[11px] font-black italic uppercase tracking-tight hover:bg-red-500/30 transition-all flex items-center gap-2"
                  >
                    <StopCircle size={14} /> Cancel Batch
                  </button>
                )}
                {batchDone && (
                  <button
                    onClick={handleClearQueue}
                    className="px-5 py-2.5 bg-white/5 text-gray-400 border border-white/10 rounded-xl text-[11px] font-black italic uppercase tracking-tight hover:text-white hover:border-primary/40 transition-all flex items-center gap-2"
                  >
                    <X size={14} /> Clear Queue
                  </button>
                )}
                {batchDone && batchFailed > 0 && (
                  <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                    <AlertCircle size={12} /> {t('production.batchRetryHint')}
                  </span>
                )}
              </div>

              {/* Completion Summary */}
              {batchDone && (
                <div className="bg-black/40 rounded-xl p-4 text-center">
                  <p className="text-sm font-black italic">
                    {t('production.batchComplete')}: <span className="text-green-400">{batchCompleted} {t('production.batchSuccess')}</span>
                    {batchFailed > 0 && <>, <span className="text-red-400">{batchFailed} {t('production.batchFailed')}</span></>}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grid of Scenes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {project.scenes.map((scene, idx) => (
          <div key={scene.id} className="group relative bg-secondary rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col hover:border-primary/40 transition-all duration-500 shadow-xl">
            {/* Header / Order */}
            <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[10px] font-black italic uppercase">
              Cut #{String(idx + 1).padStart(2, '0')}
            </div>

            <button
              onClick={() => setEditingScene(scene)}
              className="absolute top-4 right-4 z-20 bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10 text-gray-400 hover:text-primary transition-all opacity-0 group-hover:opacity-100"
            >
              <Edit3 size={16} />
            </button>

            {/* Batch Selection Checkbox */}
            {isSelectionMode && scene.image_url && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleSceneSelection(scene.id); }}
                className="absolute top-4 right-14 z-20 transition-all"
              >
                {selectedSceneIds.has(scene.id) ? (
                  <CheckSquare size={24} className="text-primary drop-shadow-lg" />
                ) : (
                  <Square size={24} className="text-gray-500 hover:text-white drop-shadow-lg" />
                )}
              </button>
            )}

            {/* Media Area */}
            <div className="aspect-video bg-black relative group/media overflow-hidden">
              {scene.video_url ? (
                <video
                  src={scene.video_url}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              ) : scene.image_url ? (
                <img src={scene.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-110" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-2">
                  <AlertCircle size={32} className="opacity-20" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-20">No Image Asset</span>
                </div>
              )}

              {/* Status Overlays */}
              {renderingSceneId === scene.id && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-30 flex flex-col items-center justify-center p-6 text-center">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 border-4 border-primary/20 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                  </div>
                  <p className="text-xs font-black italic uppercase tracking-tighter text-white animate-pulse mb-2">Rendering...</p>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest h-8">{LOADING_MESSAGES[loadingMsgIdx]}</p>
                </div>
              )}

              {/* Batch Status Overlay */}
              {getSceneBatchStatus(scene.id) === 'generating' && renderingSceneId !== scene.id && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-30 flex flex-col items-center justify-center p-6 text-center">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 border-4 border-primary/20 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                  </div>
                  <p className="text-xs font-black italic uppercase tracking-tighter text-white animate-pulse mb-2">Batch Rendering...</p>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{LOADING_MESSAGES[loadingMsgIdx]}</p>
                </div>
              )}
              {getSceneBatchStatus(scene.id) === 'queued' && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center">
                  <Clock size={32} className="text-gray-400 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Queued</p>
                </div>
              )}
              {getSceneBatchStatus(scene.id) === 'failed' && !scene.video_url && (
                <div className="absolute inset-0 bg-red-900/30 backdrop-blur-sm z-20 flex flex-col items-center justify-center">
                  <XCircle size={32} className="text-red-400 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Failed</p>
                  {getSceneBatchError(scene.id) && (
                    <p className="text-[8px] text-red-400/60 mt-1 px-4 text-center">{getSceneBatchError(scene.id)}</p>
                  )}
                </div>
              )}

              {/* Play / Download Controls for finished video */}
              {scene.video_url && !renderingSceneId && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center gap-4 z-10">
                   <button
                    onClick={() => setActiveVideoUrl(scene.video_url!)}
                    className="p-4 bg-primary text-white rounded-full shadow-2xl hover:scale-110 transition-all"
                   >
                     <Play size={24} fill="currentColor" />
                   </button>
                   <a
                    href={scene.video_url}
                    download={`REMO_Scene_${idx+1}.mp4`}
                    className="p-4 bg-white text-black rounded-full shadow-2xl hover:scale-110 transition-all"
                   >
                     <Download size={24} />
                   </a>
                </div>
              )}
            </div>

            {/* Content Info */}
            <div className="p-6 space-y-4 flex-1 flex flex-col">
              <div className="space-y-1">
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <MonitorPlay size={12} className="text-primary" /> Visual Prompt
                </div>
                <p className="text-[11px] font-medium text-gray-400 line-clamp-2 leading-relaxed italic">
                  {scene.image_prompt_en}
                </p>
              </div>

              <div className="space-y-1">
                <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Zap size={12} className="text-primary" /> Motion Detail
                </div>
                <p className="text-[11px] font-black text-white italic uppercase tracking-tighter">
                  {scene.video_motion_en}
                </p>
              </div>

              <div className="mt-auto pt-4 flex gap-2">
                <button
                  onClick={() => handleGenerateVideo(scene.id)}
                  disabled={isLoading || !scene.image_url || isBatchActive}
                  className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-white rounded-2xl text-[11px] font-black italic uppercase transition-all flex items-center justify-center gap-2 disabled:opacity-30 active:scale-95 shadow-lg"
                >
                  {scene.video_url ? <><RefreshCw size={14} /> Re-Render</> : <><Rocket size={14} /> Render Video</>}
                </button>
                {scene.video_url && (
                  <button
                    onClick={() => updateScene(scene.id, { video_url: undefined })}
                    className="p-3.5 bg-black/40 hover:bg-red-500/20 text-gray-600 hover:text-red-500 border border-white/5 rounded-2xl transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Production Request 2-Step Modal */}
      {showComingSoonModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            {modalStep === 'main' ? (
              <>
                {/* Header */}
                <div className="p-8 text-center space-y-4">
                  <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto">
                    <Rocket size={36} className="text-amber-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                      <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Coming Soon</span>
                    </div>
                    <h3 className="text-2xl font-black italic tracking-tighter uppercase">{t('production.comingSoonTitle')}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      {t('production.comingSoonDesc1')}<br />
                      {t('production.comingSoonDesc2')}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-8 pb-8 space-y-3">
                  {project && (
                    <>
                      <button
                        onClick={() => {
                          if (!project) return;
                          const data = JSON.stringify(project, null, 2);
                          const blob = new Blob([data], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `REMO_${project.title.replace(/\s+/g, '_')}.storyboard`;
                          link.click();
                          URL.revokeObjectURL(url);
                          setStoryboardDownloaded(true);
                        }}
                        className={`w-full py-4 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-3 transition-all border ${
                          storyboardDownloaded
                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                        }`}
                      >
                        {storyboardDownloaded ? <Check size={18} /> : <FileDown size={18} />}
                        {t('production.downloadStoryboard')}
                        {storyboardDownloaded && <span className="text-xs font-normal">({t('production.done')})</span>}
                      </button>

                      <button
                        onClick={async () => {
                          if (!project) return;
                          const JSZipModule = (await import('jszip')).default;
                          const zip = new JSZipModule();
                          const assets = zip.folder("assets");
                          for (const [idx, scene] of project.scenes.entries()) {
                            if (scene.image_url) {
                              const fileName = `Cut_${String(idx + 1).padStart(2, '0')}.png`;
                              const blob = await sceneImageToBlob(scene.image_url);
                              if (blob) {
                                assets?.file(fileName, blob);
                              } else {
                                console.warn(`Failed to fetch image for scene ${idx + 1}`);
                              }
                            }
                          }
                          const content = await zip.generateAsync({ type: "blob" });
                          const url = URL.createObjectURL(content);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `REMO_Assets_${project.title.replace(/\s+/g, '_')}.zip`;
                          link.click();
                          URL.revokeObjectURL(url);
                          setAssetsDownloaded(true);
                        }}
                        className={`w-full py-4 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-3 transition-all border ${
                          assetsDownloaded
                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                        }`}
                      >
                        {assetsDownloaded ? <Check size={18} /> : <Download size={18} />}
                        {t('production.downloadAssets')}
                        {assetsDownloaded && <span className="text-xs font-normal">({t('production.done')})</span>}
                      </button>
                    </>
                  )}

                  <div className="pt-2 space-y-3">
                    <button
                      onClick={() => setModalStep('form')}
                      className="w-full py-4 bg-primary hover:bg-primary/90 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 transition-all shadow-[0_10px_30px_rgba(0,87,255,0.3)] active:scale-95 text-white"
                    >
                      <Mail size={18} /> {t('production.requestProduction')}
                    </button>

                    <a
                      href="https://buymeacoffee.com/remoimagevo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full py-4 bg-[#FFDD00] hover:bg-[#FFDD00]/90 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 transition-all active:scale-95 text-black text-center shadow-[0_10px_30px_rgba(255,221,0,0.15)]"
                    >
                      <span className="text-lg">🍕</span> {t('production.buyPizza')}
                    </a>
                  </div>

                  <button
                    onClick={() => {
                      setShowComingSoonModal(false);
                      setStep(ProjectStep.ASSEMBLY);
                    }}
                    className="w-full py-3 text-xs font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest"
                  >
                    {t('common.close')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col max-h-[80vh]">
                {/* Form Header */}
                <div className="p-6 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setModalStep('main')}
                      className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-400 hover:text-white"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <h3 className="text-xl font-black italic tracking-tighter uppercase">{t('production.requestFormTitle')}</h3>
                  </div>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                  {/* Requester Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('production.request.requesterName')} <span className="text-red-400">*</span></label>
                    <input
                      value={requesterName}
                      onChange={(e) => setRequesterName(e.target.value)}
                      placeholder={t('production.request.namePlaceholder')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary placeholder:text-gray-600"
                    />
                  </div>

                  {/* Project Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('production.request.projectName')}</label>
                    <input
                      value={project?.title || ''}
                      readOnly
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 focus:outline-none"
                    />
                    <p className="text-[9px] text-gray-600">{t('production.request.autoFilled')}</p>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('production.request.email')}</label>
                    <input
                      value={user?.email || ''}
                      readOnly
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 focus:outline-none"
                    />
                    <p className="text-[9px] text-gray-600">{t('production.request.googleAccount')}</p>
                  </div>

                  {/* Purpose */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('production.request.purpose')} <span className="text-red-400">*</span></label>
                    <select
                      value={requestPurpose}
                      onChange={(e) => setRequestPurpose(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary cursor-pointer appearance-none"
                    >
                      <option value="" className="bg-[#1A1A1A]">{t('production.request.selectPurpose')}</option>
                      <option value="광고/프로모션" className="bg-[#1A1A1A]">{t('production.request.purposeAd')}</option>
                      <option value="브랜드 콘텐츠" className="bg-[#1A1A1A]">{t('production.request.purposeBrand')}</option>
                      <option value="SNS 콘텐츠" className="bg-[#1A1A1A]">{t('production.request.purposeSNS')}</option>
                      <option value="제품 소개" className="bg-[#1A1A1A]">{t('production.request.purposeProduct')}</option>
                      <option value="교육/튜토리얼" className="bg-[#1A1A1A]">{t('production.request.purposeEducation')}</option>
                      <option value="기타" className="bg-[#1A1A1A]">{t('production.request.purposeOther')}</option>
                    </select>
                  </div>

                  {/* Additional Notes */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('production.request.additionalNotes')}</label>
                    <textarea
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder={t('production.request.notesPlaceholder')}
                      className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary resize-none placeholder:text-gray-600"
                    />
                  </div>

                  {/* File Checklist + Additional Upload */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('production.request.attachment')} <span className="text-red-400">*</span></label>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                      {/* Auto-generated files */}
                      <div className={`flex items-center gap-3 text-sm ${storyboardDownloaded ? 'text-green-400' : 'text-gray-500'}`}>
                        {storyboardDownloaded ? <Check size={16} /> : <X size={16} />}
                        <span>{project?.title?.replace(/\s+/g, '-') || 'project'}.storyboard</span>
                      </div>
                      <div className={`flex items-center gap-3 text-sm ${assetsDownloaded ? 'text-green-400' : 'text-gray-500'}`}>
                        {assetsDownloaded ? <Check size={16} /> : <X size={16} />}
                        <span>{project?.title?.replace(/\s+/g, '-') || 'project'}-assets.zip</span>
                      </div>

                      {/* Extra uploaded files */}
                      {extraFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm text-blue-400">
                          <div className="flex items-center gap-3">
                            <Paperclip size={16} />
                            <span className="truncate max-w-[200px]">{file.name}</span>
                            <span className="text-[9px] text-gray-500">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                          </div>
                          <button
                            onClick={() => setExtraFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 hover:text-red-400 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}

                      {/* Upload button */}
                      <button
                        onClick={() => extraFileInputRef.current?.click()}
                        className="w-full py-2.5 border border-dashed border-white/20 rounded-lg text-xs text-gray-400 hover:text-primary hover:border-primary/50 transition-all flex items-center justify-center gap-2"
                      >
                        <Paperclip size={14} /> {t('production.request.addFile')}
                      </button>
                      <input
                        type="file"
                        ref={extraFileInputRef}
                        className="hidden"
                        multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          const MAX_SIZE = 20 * 1024 * 1024; // 20MB
                          const oversized = files.filter(f => f.size > MAX_SIZE);
                          if (oversized.length > 0) {
                            await alert(t('production.request.fileSizeError', { files: oversized.map(f => f.name).join(', ') }), { type: 'warning' });
                            const valid = files.filter(f => f.size <= MAX_SIZE);
                            setExtraFiles(prev => [...prev, ...valid]);
                          } else {
                            setExtraFiles(prev => [...prev, ...files]);
                          }
                          e.target.value = '';
                        }}
                      />
                    </div>
                    {(!storyboardDownloaded || !assetsDownloaded) && (
                      <p className="text-[9px] text-amber-400 font-bold">* {t('production.request.downloadFirst')}</p>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <div className="p-6 border-t border-white/5">
                  <button
                    onClick={async () => {
                      if (!requesterName.trim()) {
                        await alert(t('production.request.nameRequired'), { type: 'warning' });
                        return;
                      }
                      if (!requestPurpose) {
                        await alert(t('production.request.purposeRequired'), { type: 'warning' });
                        return;
                      }
                      setIsSubmitting(true);
                      try {
                        const fileUrls: string[] = [];
                        let storyboardUrl: string | null = null;
                        let assetsUrl: string | null = null;
                        const basePath = `production-requests/${project?.id || 'unknown'}/${Date.now()}`;
                        const uploadErrors: string[] = [];

                        // 1. Upload storyboard JSON to Storage
                        if (project) {
                          const storyboardBlob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
                          const storyboardPath = `${basePath}/storyboard.json`;
                          const { data: sbData, error: sbErr } = await supabase.storage
                            .from('production-attachments')
                            .upload(storyboardPath, storyboardBlob);
                          if (sbErr) {
                            uploadErrors.push(`${t('production.request.storyboardLabel')}: ${sbErr.message}`);
                          } else if (sbData) {
                            const { data: urlData } = supabase.storage.from('production-attachments').getPublicUrl(sbData.path);
                            storyboardUrl = urlData.publicUrl;
                          }
                        }

                        // 2. Upload assets ZIP to Storage
                        if (project && project.scenes.some(s => s.image_url)) {
                          const JSZipModule = (await import('jszip')).default;
                          const zip = new JSZipModule();
                          const assets = zip.folder("assets");
                          for (const [idx, scene] of project.scenes.entries()) {
                            if (scene.image_url) {
                              const fileName = `Cut_${String(idx + 1).padStart(2, '0')}.png`;
                              const blob = await sceneImageToBlob(scene.image_url);
                              if (blob) {
                                assets?.file(fileName, blob);
                              } else {
                                console.warn(`Failed to fetch image for scene ${idx + 1}`);
                              }
                            }
                          }
                          const zipBlob = await zip.generateAsync({ type: "blob" });
                          const assetsPath = `${basePath}/assets.zip`;
                          const { data: assetData, error: assetErr } = await supabase.storage
                            .from('production-attachments')
                            .upload(assetsPath, zipBlob);
                          if (assetErr) {
                            uploadErrors.push(`${t('production.request.assetsLabel')}: ${assetErr.message}`);
                          } else if (assetData) {
                            const { data: urlData } = supabase.storage.from('production-attachments').getPublicUrl(assetData.path);
                            assetsUrl = urlData.publicUrl;
                          }
                        }

                        // 3. Upload extra user files
                        for (const file of extraFiles) {
                          const filePath = `${basePath}/extra_${file.name}`;
                          const { data, error } = await supabase.storage
                            .from('production-attachments')
                            .upload(filePath, file);
                          if (error) {
                            uploadErrors.push(`${file.name}: ${error.message}`);
                          } else if (data) {
                            const { data: urlData } = supabase.storage.from('production-attachments').getPublicUrl(data.path);
                            fileUrls.push(urlData.publicUrl);
                          }
                        }

                        // Show upload errors to user
                        if (uploadErrors.length > 0) {
                          await alert(t('production.request.uploadPartialError', { errors: uploadErrors.join('\n') }), { type: 'warning' });
                        }

                        // 4. Store request in Supabase (triggers email)
                        const requestData = {
                          project_id: project?.id || null,
                          project_title: project?.title || '',
                          requester_name: requesterName,
                          requester_email: user?.email || '',
                          user_id: user?.id || null,
                          aspect_ratio: project?.aspect_ratio || '16:9',
                          scene_count: project?.scene_count || 9,
                          purpose: requestPurpose,
                          additional_notes: additionalNotes || null,
                          storyboard_url: storyboardUrl,
                          assets_url: assetsUrl,
                          extra_file_urls: fileUrls.length > 0 ? fileUrls : null,
                          storyboard_downloaded: storyboardDownloaded,
                          assets_downloaded: assetsDownloaded,
                        };

                        const { error: insertError } = await supabase
                          .from('production_requests')
                          .insert(requestData);

                        if (insertError) {
                          console.error('Failed to save request:', insertError);
                          await alert(t('production.request.submitError'), { type: 'error' });
                          return;
                        }

                        await alert(t('production.request.submitSuccess'), { type: 'success' });
                        setShowComingSoonModal(false);
                        setStep(ProjectStep.ASSEMBLY);
                      } catch (err) {
                        console.error('Submit error:', err);
                        await alert(t('production.request.submitError'), { type: 'error' });
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                    disabled={isSubmitting}
                    className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-2xl text-sm font-black uppercase flex items-center justify-center gap-2 transition-all shadow-[0_10px_30px_rgba(0,87,255,0.3)] active:scale-95 text-white"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> {t('production.request.submitting')}
                      </>
                    ) : (
                      <>
                        <Mail size={18} /> {t('production.request.submit')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prompt Edit Modal */}
      {editingScene && (
        <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-secondary border border-white/10 rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl">
             <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Edit3 className="text-primary" />
                  <h3 className="text-xl font-black italic uppercase tracking-tighter">Refine Scene Prompt</h3>
                </div>
                <button onClick={() => setEditingScene(null)} className="p-2 hover:bg-white/5 rounded-full"><X size={20} /></button>
             </div>
             <form onSubmit={handleSavePromptEdit} className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Image Content Prompt (English)</label>
                   <textarea
                    value={editingScene.image_prompt_en}
                    onChange={(e) => setEditingScene({...editingScene, image_prompt_en: e.target.value})}
                    className="w-full h-32 bg-black border border-white/10 rounded-2xl p-4 text-sm focus:border-primary focus:outline-none resize-none"
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Camera Motion Prompt (English)</label>
                   <input
                    value={editingScene.video_motion_en}
                    onChange={(e) => setEditingScene({...editingScene, video_motion_en: e.target.value})}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-primary focus:outline-none font-bold italic uppercase"
                   />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setEditingScene(null)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all text-sm">Cancel</button>
                  <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-black italic uppercase shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <Save size={18} /> Update Data
                  </button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* Fullscreen Video Modal */}
      {activeVideoUrl && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 lg:p-20" onClick={() => setActiveVideoUrl(null)}>
           <div className="relative w-full max-w-6xl aspect-video rounded-[3rem] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)]" onClick={e => e.stopPropagation()}>
              <video
                src={activeVideoUrl}
                controls
                autoPlay
                className="w-full h-full bg-black"
              />
              <button
                onClick={() => setActiveVideoUrl(null)}
                className="absolute top-8 right-8 p-4 bg-black/60 hover:bg-white text-white hover:text-black rounded-full transition-all border border-white/10"
              >
                <X size={32} />
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
