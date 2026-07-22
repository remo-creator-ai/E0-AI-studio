
import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Image as ImageIcon,
  Sparkles,
  Download,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MonitorPlay,
  Scissors,
  Upload,
  Type,
  Copy,
  Zap,
  FileText,
  FileUp,
  X,
  Monitor,
  Smartphone,
  Clock,
  Film,
  Palette,
  Cpu,
  User,
  ShoppingBag,
  Gem,
  Mountain,
  Trash2
} from 'lucide-react';
import { useStore } from '../store';
import { useCreditStore } from '../store/creditStore';
import { useModal } from './ui/ModalProvider';
import { generate3x3GridImage } from '../services/geminiService';
import { generateThumbnail } from '../services/thumbnailService';
import { supabase } from '../lib/supabase';
import { GRID_ANGLES, STYLE_PROMPT_GUIDES } from '../constants';
import { Project, Scene, AdDuration, VisualStyle, StoryboardLayout, SCENE_DURATION_MAP, SceneCount, ImageModel, IMAGE_MODEL_INFO, CategorizedRefImage, ReferenceCategory, REFERENCE_CATEGORY_INFO } from '../types';

function getGridLayout(sceneCount: number, aspectRatio?: string): { rows: number; cols: number; scenesPerUnit: number } {
  const isPortrait = aspectRatio === '9:16';
  switch (sceneCount) {
    case 4: return { rows: 2, cols: 2, scenesPerUnit: 4 };
    case 8: return isPortrait
      ? { rows: 2, cols: 2, scenesPerUnit: 4 }  // 9:16: 2x2 grid x 2 units
      : { rows: 2, cols: 4, scenesPerUnit: 8 };
    case 18: return { rows: 3, cols: 3, scenesPerUnit: 9 };
    case 9:
    default: return { rows: 3, cols: 3, scenesPerUnit: 9 };
  }
}

export const VisualizingStep: React.FC = () => {
  const { t } = useTranslation();
  const { project, setProject, setIsLoading, isLoading } = useStore();
  const { deduct, hasEnough, balance } = useCreditStore();
  const { alert, confirm } = useModal();
  const [currentUnitIdx, setCurrentUnitIdx] = useState(0);
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [refImages, setRefImages] = useState<CategorizedRefImage[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<{current: number, total: number} | null>(null);
  const [isPromptAutoSet, setIsPromptAutoSet] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ImageModel>(ImageModel.GEMINI_3_1_FLASH);
  const [isStylePopupOpen, setIsStylePopupOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTxtRef = useRef<HTMLInputElement>(null);

  // Initialize style prompt from project style
  React.useEffect(() => {
    if (project?.style && !customStylePrompt) {
      setCustomStylePrompt(STYLE_PROMPT_GUIDES[project.style] || '');
    }
  }, [project?.style]);

  const handleStyleChange = (newStyle: VisualStyle) => {
    if (!project) return;
    setProject({ ...project, style: newStyle });
    // Auto-insert guide only if prompt is empty or was previously auto-set
    if (!customStylePrompt || isPromptAutoSet || Object.values(STYLE_PROMPT_GUIDES).includes(customStylePrompt)) {
      setCustomStylePrompt(STYLE_PROMPT_GUIDES[newStyle]);
      setIsPromptAutoSet(true);
    }
  };

  const handleImportTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const lines = text.split('\n');
        let title = "Untitled Project";
        let duration = 15;
        let style = VisualStyle.CINEMATIC;
        let idea = "";
        const scenes: Scene[] = [];

        let currentScene: Partial<Scene> = {};

        lines.forEach(line => {
          if (line.includes('PROJECT TITLE:')) title = line.split('PROJECT TITLE:')[1].trim();
          if (line.includes('DURATION:')) duration = parseInt(line.split('DURATION:')[1]);
          if (line.includes('STYLE:')) {
            const styleVal = line.split('STYLE:')[1].trim();
            if (Object.values(VisualStyle).includes(styleVal as VisualStyle)) {
              style = styleVal as VisualStyle;
            }
          }
          if (line.includes('ORIGINAL IDEA:')) idea = line.split('ORIGINAL IDEA:')[1].trim();

          if (line.startsWith('CUT #')) {
            if (currentScene.id) {
              scenes.push(currentScene as Scene);
            }
            currentScene = {
              id: crypto.randomUUID(),
              order: scenes.length + 1
            };
          }

          if (line.includes('[VISUAL CONTENT (KR)]:')) currentScene.content_kr = line.split('[VISUAL CONTENT (KR)]:')[1].trim();
          else if (line.includes('[VISUAL CONTENT]:')) currentScene.content_kr = line.split('[VISUAL CONTENT]:')[1].trim();
          if (line.includes('[VISUAL CONTENT (EN)]:')) currentScene.content_en = line.split('[VISUAL CONTENT (EN)]:')[1].trim();
          if (line.includes('[SCRIPT (KR)]:')) currentScene.script_kr = line.split('[SCRIPT (KR)]:')[1].trim();
          if (line.includes('[MOTION (EN)]:')) currentScene.video_motion_en = line.split('[MOTION (EN)]:')[1].trim();
          if (line.includes('[IMAGE PROMPT (EN)]:')) currentScene.image_prompt_en = line.split('[IMAGE PROMPT (EN)]:')[1].trim();
        });

        // Add last scene
        if (currentScene.id) scenes.push(currentScene as Scene);

        if (scenes.length > 0) {
          const totalUnits = Math.ceil(duration / 15);
          const grid_images = new Array(totalUnits).fill(null);

          const newProject: Project = {
            id: crypto.randomUUID(),
            title,
            duration: duration as AdDuration,
            style,
            idea,
            scenes,
            grid_images,
            layout: StoryboardLayout.GRID_2X5
          };
          setProject(newProject);
          await alert(t('visualizing.alerts.importSuccess'), { type: 'success' });
        } else {
          await alert(t('visualizing.alerts.importFormatError'), { type: 'error' });
        }
      } catch (err) {
        console.error(err);
        await alert(t('visualizing.alerts.importParseError'), { type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-200">
          <FileText size={40} className="text-zinc-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">{t('visualizing.noProject')}</h2>
          <p className="text-zinc-500 text-sm">{t('visualizing.noProjectDesc')}</p>
        </div>
        <button
          onClick={() => importTxtRef.current?.click()}
          className="px-10 py-4 rounded-full bg-primary text-white flex items-center gap-2 font-black hover:bg-[#003E99] shadow-[0_8px_20px_rgba(0,80,191,0.25)] transition-all"
        >
          <FileUp size={20} /> <span>{t('visualizing.importTxt')}</span>
        </button>
        <input
          type="file"
          ref={importTxtRef}
          className="hidden"
          accept=".txt"
          onChange={handleImportTxt}
        />
      </div>
    );
  }

  const gridLayout = getGridLayout(project.scene_count || 9, project.aspect_ratio);
  const totalUnits = Math.ceil((project.scene_count || 9) / gridLayout.scenesPerUnit);

  // Ensure grid_images array matches totalUnits (handles legacy projects)
  if (project.grid_images.length < totalUnits) {
    const padded = [...project.grid_images, ...new Array(totalUnits - project.grid_images.length).fill(null)];
    setProject({ ...project, grid_images: padded });
  }

  const currentGridImage = project.grid_images[currentUnitIdx];

  const sceneCount = (project.scene_count || 9) as SceneCount;
  const projectDuration = SCENE_DURATION_MAP[sceneCount] ?? 30;
  const isPortrait = project.aspect_ratio === '9:16';
  const imageCreditCost = IMAGE_MODEL_INFO[selectedModel].creditCost;

  const createGridPrompt = (unitIdx: number) => {
    const { rows, cols, scenesPerUnit } = gridLayout;
    const unitScenes = project.scenes.slice(unitIdx * scenesPerUnit, (unitIdx * scenesPerUnit) + scenesPerUnit);
    const sceneDescriptions = unitScenes.map((s, i) => `Panel ${i+1}: ${s.image_prompt_en}`).join("\n");

    if (isPortrait) {
      return `Create a ${rows}x${cols} storyboard grid sheet with exactly ${unitScenes.length} panels.
Layout: ${rows} rows, ${cols} columns. 9:16 VERTICAL portrait orientation.
Each panel must be a separate, clearly distinct scene with visible grid dividers between them.

Project Theme: ${project.idea}
Visual Style: ${project.style}. ${customStylePrompt}

Panel descriptions:
${sceneDescriptions}

CRITICAL RULES:
- Generate EXACTLY ${unitScenes.length} panels in a ${rows}x${cols} grid
- Each panel is a SEPARATE scene showing a DIFFERENT moment/angle
- Panels are arranged left-to-right, top-to-bottom
- Maintain consistent character appearance and art style across all panels
- Each panel uses VERTICAL portrait framing (taller than wide)
- 4K quality, cinematic lighting
- NO text, NO labels, NO panel numbers
- Clear thin white borders between panels`;
    }

    return `Create a ${rows}x${cols} storyboard grid sheet with exactly ${unitScenes.length} panels.
Layout: ${rows} rows, ${cols} columns. 16:9 HORIZONTAL widescreen orientation.
Each panel must be a separate, clearly distinct scene with visible grid dividers between them.

Project Theme: ${project.idea}
Visual Style: ${project.style}. ${customStylePrompt}

Panel descriptions:
${sceneDescriptions}

CRITICAL RULES:
- Generate EXACTLY ${unitScenes.length} panels in a ${rows}x${cols} grid
- Each panel is a SEPARATE scene showing a DIFFERENT moment/angle
- Panels are arranged left-to-right, top-to-bottom
- Maintain consistent character appearance and art style across all panels
- Each panel uses HORIZONTAL widescreen framing (wider than tall)
- 4K quality, cinematic lighting
- NO text, NO labels, NO panel numbers
- Clear thin white borders between panels`;
  };

  const handleGenerateGrid = async () => {
    if (!hasEnough(imageCreditCost)) {
      await alert(t('visualizing.alerts.insufficientCredits', { cost: imageCreditCost }), { type: 'warning' });
      return;
    }
    setIsLoading(true);
    try {
      const prompt = createGridPrompt(currentUnitIdx);
      const imageUrl = await generate3x3GridImage(prompt, undefined, project.aspect_ratio, selectedModel, refImages.length > 0 ? refImages : undefined);
      if (imageUrl) {
        await deduct(imageCreditCost, '이미지 매트릭스 생성 (' + IMAGE_MODEL_INFO[selectedModel].label + ')');
        const newGridImages = [...project.grid_images];
        newGridImages[currentUnitIdx] = imageUrl;

        // Generate and save thumbnail from the grid image
        const thumb = await generateThumbnail(imageUrl);
        if (thumb && project.id) {
          await supabase
            .from('projects')
            .update({ thumbnail: thumb })
            .eq('id', project.id);
        }
        setProject({ ...project, grid_images: newGridImages, thumbnail: thumb || project.thumbnail });
      }
    } catch (error: unknown) {
      console.error("Grid generation error:", error);
      const message = error instanceof Error ? error.message : "Unknown Error";
      await alert(t('visualizing.alerts.generateError') + `: ${message}`, { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAllMatrices = async () => {
    const totalCost = totalUnits * imageCreditCost;
    if (!hasEnough(totalCost)) {
      await alert(t('visualizing.alerts.batchInsufficientCredits', { cost: totalCost, balance }), { type: 'warning' });
      return;
    }
    const confirmed = await confirm(t('visualizing.alerts.batchConfirm', { count: totalUnits, cost: totalCost, balance }), { type: 'info' });
    if (!confirmed) return;

    setIsLoading(true);
    setGenerationProgress({ current: 0, total: totalUnits });

    try {
      const newGridImages = [...project.grid_images];
      for (let i = 0; i < totalUnits; i++) {
        setGenerationProgress({ current: i + 1, total: totalUnits });

        // Add artificial delay to respect rate limits
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        const prompt = createGridPrompt(i);
        const imageUrl = await generate3x3GridImage(prompt, undefined, project.aspect_ratio, selectedModel, refImages.length > 0 ? refImages : undefined);
        if (imageUrl) {
          await deduct(imageCreditCost, `이미지 매트릭스 ${i + 1}/${totalUnits} 생성 (${IMAGE_MODEL_INFO[selectedModel].label})`);
          newGridImages[i] = imageUrl;
        }
      }
      // Generate and save thumbnail from the first available grid image
      let savedThumb = project.thumbnail;
      const firstImage = newGridImages.find((img) => img != null);
      if (firstImage && project.id) {
        const thumb = await generateThumbnail(firstImage);
        if (thumb) {
          savedThumb = thumb;
          await supabase
            .from('projects')
            .update({ thumbnail: thumb })
            .eq('id', project.id);
        }
      }
      setProject({ ...project, grid_images: newGridImages, thumbnail: savedThumb });

      await alert(t('visualizing.alerts.batchComplete'), { type: 'success' });
    } catch (error: unknown) {
      console.error("Batch generation error:", error);
      const message = error instanceof Error ? error.message : "Unknown Error";
      await alert(t('visualizing.alerts.batchPartialError') + `: ${message}`, { type: 'error' });
    } finally {
      setIsLoading(false);
      setGenerationProgress(null);
    }
  };

  const handleGenerateAndApply = async () => {
    const totalCost = totalUnits * imageCreditCost;
    if (!hasEnough(totalCost)) {
      await alert(t('visualizing.alerts.batchInsufficientCredits', { cost: totalCost, balance }), { type: 'warning' });
      return;
    }

    setIsLoading(true);
    setGenerationProgress(totalUnits > 1 ? { current: 0, total: totalUnits } : null);

    try {
      const newGridImages = [...project.grid_images];

      for (let i = 0; i < totalUnits; i++) {
        if (totalUnits > 1) setGenerationProgress({ current: i + 1, total: totalUnits });
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 3000));

        const prompt = createGridPrompt(i);
        const imageUrl = await generate3x3GridImage(prompt, undefined, project.aspect_ratio, selectedModel, refImages.length > 0 ? refImages : undefined);
        if (imageUrl) {
          await deduct(imageCreditCost, `이미지 매트릭스 생성+적용 (${IMAGE_MODEL_INFO[selectedModel].label})`);
          newGridImages[i] = imageUrl;
        }
      }

      // Generate thumbnail
      let savedThumb = project.thumbnail;
      const firstImage = newGridImages.find((img) => img != null);
      if (firstImage && project.id) {
        const thumb = await generateThumbnail(firstImage);
        if (thumb) {
          savedThumb = thumb;
          await supabase
            .from('projects')
            .update({ thumbnail: thumb })
            .eq('id', project.id);
        }
      }

      // Auto-apply: split grid images into individual scenes
      const { rows, cols, scenesPerUnit } = gridLayout;
      const updatedScenes = [...project.scenes];

      for (let unitIdx = 0; unitIdx < totalUnits; unitIdx++) {
        const gridImg = newGridImages[unitIdx];
        if (!gridImg) continue;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = gridImg;

        await new Promise<void>((resolve) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(); return; }

            const cellWidth = Math.floor(img.width / cols);
            const cellHeight = Math.floor(img.height / rows);
            canvas.width = cellWidth;
            canvas.height = cellHeight;

            const startIdx = unitIdx * scenesPerUnit;
            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                const sceneIdx = startIdx + (row * cols + col);
                if (sceneIdx < updatedScenes.length) {
                  ctx.clearRect(0, 0, cellWidth, cellHeight);
                  ctx.drawImage(
                    img,
                    col * cellWidth, row * cellHeight, cellWidth, cellHeight,
                    0, 0, cellWidth, cellHeight
                  );
                  updatedScenes[sceneIdx] = {
                    ...updatedScenes[sceneIdx],
                    image_url: canvas.toDataURL('image/png')
                  };
                }
              }
            }
            resolve();
          };
        });
      }

      setProject({ ...project, grid_images: newGridImages, scenes: updatedScenes, thumbnail: savedThumb });
      await alert(t('visualizing.alerts.batchComplete'), { type: 'success' });
    } catch (error: unknown) {
      console.error("Generate & Apply error:", error);
      const message = error instanceof Error ? error.message : "Unknown Error";
      await alert(t('visualizing.alerts.generateError') + `: ${message}`, { type: 'error' });
    } finally {
      setIsLoading(false);
      setGenerationProgress(null);
    }
  };

  const handleApplyToStoryboard = () => {
    if (!currentGridImage) return;

    setIsLoading(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = currentGridImage;

    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { rows, cols, scenesPerUnit } = gridLayout;
      const cellWidth = Math.floor(img.width / cols);
      const cellHeight = Math.floor(img.height / rows);
      canvas.width = cellWidth;
      canvas.height = cellHeight;

      const updatedScenes = [...project.scenes];
      const startIdx = currentUnitIdx * scenesPerUnit;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sceneIdx = startIdx + (row * cols + col);
          if (sceneIdx < updatedScenes.length) {
            ctx.clearRect(0, 0, cellWidth, cellHeight);
            ctx.drawImage(
              img,
              col * cellWidth, row * cellHeight, cellWidth, cellHeight,
              0, 0, cellWidth, cellHeight
            );
            updatedScenes[sceneIdx] = {
              ...updatedScenes[sceneIdx],
              image_url: canvas.toDataURL('image/png')
            };
          }
        }
      }

      setProject({ ...project, scenes: updatedScenes });
      setIsLoading(false);
      await alert(t('visualizing.alerts.deploySuccess', { unit: currentUnitIdx + 1 }), { type: 'success' });
    };
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (refImages.length >= 5) {
        await alert(t('visualizing.alerts.maxRefs'), { type: 'warning' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleCategorySelect = (category: ReferenceCategory) => {
    if (pendingImage) {
      setRefImages(prev => [...prev, { image: pendingImage, category }]);
      setPendingImage(null);
    }
  };

  const removeRefImage = (index: number) => {
    setRefImages(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-500 pb-20">
      {/* ── Header: Title + Unit Navigation ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900">{t('visualizing.title')} <span className="text-primary">{t('visualizing.titleHighlight')}</span></h1>
          <p className="text-zinc-500">{t('visualizing.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {totalUnits > 1 && (
            <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-zinc-100 shadow-xl">
              <button
                onClick={() => setCurrentUnitIdx(Math.max(0, currentUnitIdx - 1))}
                className="p-2 hover:bg-zinc-100 rounded-xl disabled:opacity-30 transition-all"
                disabled={currentUnitIdx === 0}
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-[10px] font-black text-primary uppercase">Navigation</span>
                <span className="text-sm font-black">UNIT {currentUnitIdx + 1} / {totalUnits}</span>
              </div>
              <button
                onClick={() => setCurrentUnitIdx(Math.min(totalUnits - 1, currentUnitIdx + 1))}
                className="p-2 hover:bg-zinc-100 rounded-xl disabled:opacity-30 transition-all"
                disabled={currentUnitIdx === totalUnits - 1}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Project Info Bar (read-only) ── */}
      <div className="bg-white rounded-2xl border border-zinc-200 px-6 py-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          {isPortrait ? <Smartphone size={16} className="text-[#0050BF]" /> : <Monitor size={16} className="text-[#0050BF]" />}
          <span className="font-bold">{project.aspect_ratio || '16:9'}</span>
          <span className="text-zinc-400">{isPortrait ? t('visualizing.portrait') : t('visualizing.landscape')}</span>
        </div>
        <div className="w-px h-5 bg-zinc-200" />
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Film size={16} className="text-[#0050BF]" />
          <span className="font-bold">{t('common.cuts', { count: project.scene_count || 9 })}</span>
        </div>
        <div className="w-px h-5 bg-zinc-200" />
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Clock size={16} className="text-[#0050BF]" />
          <span className="font-bold">{projectDuration}s</span>
        </div>
      </div>

      {/* ── Style + Prompt (unified section) ── */}
      <div data-tour="visualizing-style" className="bg-white p-6 rounded-2xl border border-zinc-200 space-y-5 shadow-2xl">
        {/* Style Dropdown + Prompt side by side */}
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          <div className="space-y-2">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest text-left">{t('visualizing.visualStyle')}</label>
            <button
              onClick={() => setIsStylePopupOpen(true)}
              className="w-full flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-2xl h-[120px] hover:bg-primary/15 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Palette className="text-primary" size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-primary truncate">{project.style}</div>
                <div className="text-[10px] text-zinc-400 mt-0.5">{t('visualizing.tapToChange')}</div>
              </div>
              <ChevronRight size={16} className="text-zinc-400 ml-auto shrink-0" />
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest text-left">Style Prompt</label>
            <div className="relative">
              <textarea
                value={customStylePrompt}
                onChange={(e) => {
                  setCustomStylePrompt(e.target.value);
                  setIsPromptAutoSet(false);
                }}
                placeholder="예: Cyberpunk city, neon lighting, grain texture..."
                className="w-full h-[120px] bg-white border border-zinc-200 text-zinc-900 placeholder-zinc-400 rounded-2xl p-4 text-sm focus:outline-none focus:border-primary resize-none pr-8 transition-all"
              />
              <Type className="absolute right-4 top-4 text-zinc-300" size={14} />
            </div>
          </div>
        </div>

        {/* Model Selection */}
        <div className="flex items-center gap-4">
          <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest shrink-0">Image Model</label>
          <div className="flex gap-3 flex-1">
            {Object.values(ImageModel).map((model) => {
              const info = IMAGE_MODEL_INFO[model];
              const isSelected = selectedModel === model;
              return (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(0,80,191,0.15)]'
                      : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50'
                  }`}
                >
                  <Cpu size={16} className={isSelected ? 'text-primary' : 'text-zinc-400'} />
                  <div className="min-w-0">
                    <div className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-zinc-500'}`}>{info.label}</div>
                    <div className="text-[10px] text-zinc-400">{info.description}</div>
                  </div>
                  <span className={`ml-auto text-xs font-black px-2 py-1 rounded-lg shrink-0 ${
                    isSelected ? 'bg-primary/20 text-primary' : 'bg-zinc-100 text-zinc-400'
                  }`}>
                    {info.creditCost}C
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reference Images + Generate Buttons Row */}
        <div className="flex flex-col md:flex-row gap-5 items-start">
          {/* Reference Images */}
          <div className="space-y-2 flex-1 min-w-0">
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest text-left">Visual References ({refImages.length}/5)</label>
            <div className="flex items-center gap-2 flex-wrap">
              {refImages.map((ref, idx) => (
                <div key={idx} className="w-14 h-14 rounded-xl overflow-hidden relative group border border-zinc-200 shrink-0">
                  <img src={ref.image} className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-[7px] font-black text-center py-0.5 text-primary uppercase">
                    {REFERENCE_CATEGORY_INFO[ref.category].labelKr}
                  </div>
                  <button
                    onClick={() => removeRefImage(idx)}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {refImages.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-14 h-14 border-2 border-dashed border-zinc-200 rounded-xl flex items-center justify-center text-zinc-400 hover:text-primary hover:border-primary/50 transition-all shrink-0"
                >
                  <Upload size={16} />
                </button>
              )}
              <input type="file" ref={fileInputRef} onChange={onFileChange} className="hidden" accept="image/*" />
            </div>
          </div>

          {/* Generate Buttons */}
          <div data-tour="visualizing-generate" className="flex items-end gap-3 shrink-0">
            <button
              onClick={handleGenerateAndApply}
              disabled={isLoading}
              className="px-8 py-3.5 bg-primary hover:bg-[#003E99] disabled:opacity-50 rounded-full flex items-center justify-center gap-2 font-black text-white text-sm transition-all shadow-[0_8px_20px_rgba(0,80,191,0.25)] active:scale-95 group"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-xs">
                    {generationProgress
                      ? `UNIT ${generationProgress.current}/${generationProgress.total}...`
                      : 'GENERATING...'}
                  </span>
                </div>
              ) : (
                <>
                  <Sparkles size={16} className="group-hover:animate-pulse" />
                  <span>{t('visualizing.generateApply')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Grid Preview (full width) ── */}
      <div data-tour="visualizing-matrix" className="grid-preview-container rounded-[2.5rem] border-8 border-zinc-200 overflow-hidden relative group shadow-2xl bg-zinc-100" style={{ aspectRatio: isPortrait ? '9 / 16' : '16 / 9', maxHeight: isPortrait ? '80vh' : undefined, margin: isPortrait ? '0 auto' : undefined, maxWidth: isPortrait ? '60%' : undefined }}>
        {!currentGridImage && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-6">
            <div className="w-24 h-24 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200 animate-pulse">
               <ImageIcon size={40} className="opacity-30 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-black text-2xl text-zinc-400 tracking-tight">{t('visualizing.emptyMatrix', { unit: currentUnitIdx + 1 })}</p>
              <p className="text-xs text-zinc-300 font-bold uppercase tracking-widest">{t('visualizing.emptyMatrixDesc')}</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/40 backdrop-blur-md z-20">
            <div className="text-center space-y-8">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-primary/10 rounded-full mx-auto"></div>
                <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto absolute inset-0"></div>
              </div>
              <div className="space-y-3">
                <p className="text-3xl font-black tracking-tight text-white animate-pulse">
                  {generationProgress
                    ? `Batch Rendering [${generationProgress.current}/${generationProgress.total}]`
                    : `Rendering Unit ${currentUnitIdx + 1}...`}
                </p>
                <p className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
                  Gemini Vision Engine is processing sequence consistency
                </p>
              </div>
            </div>
          </div>
        )}

        {currentGridImage && (
          <>
            <img src={currentGridImage} alt="Grid" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`, gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)` }}>
              {Array.from({ length: gridLayout.rows * gridLayout.cols }).map((_, i) => (
                <div key={i} className="border border-white/5 flex flex-col justify-end p-3 bg-gradient-to-t from-black/80 via-transparent to-transparent">
                  <span className="text-[11px] font-black text-white/90 uppercase tracking-tighter italic">
                    {GRID_ANGLES[i] || `Panel ${i + 1}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Action Bar ── */}
      {currentGridImage && !isLoading && (
        <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-white rounded-2xl border border-zinc-200 animate-in fade-in slide-in-from-bottom-4 shadow-2xl relative overflow-hidden group gap-4">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-200 group-hover:border-primary/50 transition-all shadow-inner">
               <ImageIcon size={24} className="text-primary" />
            </div>
            <div className="text-left">
              <h4 className="font-black text-lg tracking-tight text-zinc-900">{t('visualizing.matrixReady')}</h4>
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">{project.aspect_ratio || '16:9'} &bull; {gridLayout.rows}x{gridLayout.cols} Grid &bull; Unit {currentUnitIdx + 1}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = currentGridImage;
                link.download = `SODAM_Matrix_U${currentUnitIdx+1}.png`;
                link.click();
              }}
              className="p-4 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-2xl transition-all text-zinc-500 hover:text-zinc-900"
              title="Raw Matrix Download"
            >
              <Download size={20} />
            </button>
            <button
              onClick={async () => {
                const ok = await confirm(t('visualizing.alerts.deleteConfirm'), { type: 'warning', confirmText: t('common.delete'), cancelText: t('common.cancel') });
                if (ok) {
                  const newGridImages = [...project.grid_images];
                  newGridImages[currentUnitIdx] = null;
                  setProject({ ...project, grid_images: newGridImages });
                }
              }}
              className="p-4 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-200 rounded-2xl transition-all text-zinc-500 hover:text-zinc-500"
              title="매트릭스 이미지 삭제"
            >
              <Trash2 size={20} />
            </button>
            <button
              onClick={handleApplyToStoryboard}
              className="px-10 py-4 bg-primary text-white font-black rounded-full flex items-center gap-3 hover:bg-[#003E99] transition-all active:scale-95 shadow-[0_8px_20px_rgba(0,80,191,0.25)] whitespace-nowrap"
            >
              <Scissors size={18} />
              <span>{t('visualizing.applyCuts')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Style Selection Popup */}
      {isStylePopupOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-5 max-w-2xl w-full mx-4 animate-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-black tracking-tight text-zinc-900">{t('visualizing.selectStyle')}</h4>
              <button onClick={() => setIsStylePopupOpen(false)} className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.values(VisualStyle).map((styleVal) => {
                const isSelected = project.style === styleVal;
                const styleIcons: Record<string, string> = {
                  'Cinematic': '🎬',
                  'Realistic': '📷',
                  '3D Render': '🧊',
                  '2D Flat Pink': '🩷',
                  'Motion Graphics': '⚡',
                  'Pixar 3D': '🎨',
                  'Japanese Anime': '✨',
                  'Watercolor': '🖌️',
                  'Cyberpunk': '🌃',
                  'Simple Line Art': '✏️',
                };
                return (
                  <button
                    key={styleVal}
                    onClick={() => {
                      handleStyleChange(styleVal);
                      setIsStylePopupOpen(false);
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${
                      isSelected
                        ? 'border-primary bg-[#EEF3FC] shadow-[0_0_20px_rgba(0,80,191,0.2)]'
                        : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50 hover:bg-zinc-100'
                    }`}
                  >
                    <span className="text-3xl">{styleIcons[styleVal] || '🎨'}</span>
                    <div>
                      <div className={`text-sm font-bold ${isSelected ? 'text-primary' : 'text-zinc-600'}`}>{styleVal}</div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <CheckCircle2 size={14} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category Selection Popup */}
      {pendingImage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md">
          <div className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black tracking-tight text-zinc-900">{t('visualizing.selectCategory')}</h4>
              <button onClick={() => setPendingImage(null)} className="p-1 hover:bg-zinc-100 rounded-lg transition-colors"><X size={16} /></button>
            </div>
            <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-200 mx-auto">
              <img src={pendingImage} className="w-full h-full object-cover" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(REFERENCE_CATEGORY_INFO) as ReferenceCategory[]).map((cat) => {
                const info = REFERENCE_CATEGORY_INFO[cat];
                const icons: Record<ReferenceCategory, React.ReactNode> = {
                  character: <User size={16} />,
                  product: <ShoppingBag size={16} />,
                  accessory: <Gem size={16} />,
                  background: <Mountain size={16} />,
                };
                return (
                  <button
                    key={cat}
                    onClick={() => handleCategorySelect(cat)}
                    className="flex items-center gap-2 p-3 bg-zinc-50 hover:bg-primary/10 border border-zinc-200 hover:border-primary/40 rounded-xl transition-all text-left"
                  >
                    <span className="text-primary">{icons[cat]}</span>
                    <div>
                      <div className="text-xs font-bold">{info.labelKr}</div>
                      <div className="text-[9px] text-zinc-400">{info.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
