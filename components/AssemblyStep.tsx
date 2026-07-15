
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  Printer,
  Plus,
  Minus,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit3,
  Save,
  Layout as LayoutIcon,
  X,
  Languages,
  Upload,
  Type,
  Layers,
  Sparkles,
  RefreshCw,
  Maximize2,
  FileUp,
  FileText,
  Archive,
  Scissors,
  ZoomIn,
  Check,
  Wand2
} from 'lucide-react';
import { useStore } from '../store';
import { useModal } from './ui/ModalProvider';
import { StoryboardLayout, Scene, Project, VisualStyle, AdDuration, UPSCALE_CREDIT_COST, ImageModel } from '../types';
import { translateText, generateSingleImage, upscaleImage, refineSceneFromImage, refineFullStory } from '../services/geminiService';
import { sceneImageToBlob } from '../services/imageUtils';
import { useCreditStore } from '../store/creditStore';
import { useSettingsStore } from '../store/settingsStore';
import JSZip from 'jszip';
import Cropper from 'react-easy-crop';
import { RefineFullStoryModal } from './RefineFullStoryModal';

interface CroppedArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AssemblyStep: React.FC = () => {
  const { project, setProject, updateScene, reorderScenes, updateProjectSettings, setIsLoading, isLoading } = useStore();
  const { alert, confirm } = useModal();
  const { deduct, hasEnough, balance } = useCreditStore();
  const { defaultLanguage } = useSettingsStore();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // Default viewLanguage based on project generation language or settings
  const initialLang = (project?.generation_language === 'en' || defaultLanguage === 'en') ? 'EN' : 'KR';
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [viewLanguage, setViewLanguage] = useState<'KR' | 'EN'>(initialLang);
  const [targetSceneIdForImage, setTargetSceneIdForImage] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(0.8);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [useExistingAsRef, setUseExistingAsRef] = useState(true);
  const [localRefImages, setLocalRefImages] = useState<string[]>([]);
  const [editInstruction, setEditInstruction] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const modalFileRef = useRef<HTMLInputElement>(null);
  const modalRefUploadRef = useRef<HTMLInputElement>(null);

  // Cropping State
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedArea | null>(null);
  const [batchUpscaleSize, setBatchUpscaleSize] = useState<'2K' | '4K'>('2K');
  const [upscaleProgress, setUpscaleProgress] = useState<{current: number, total: number} | null>(null);
  const [refineResults, setRefineResults] = useState<{
    originalScenes: import('../types').Scene[];
    refinedResults: Array<{ content_kr: string; content_en: string; script_kr: string; script_en: string }>;
  } | null>(null);

  // Pagination Logic
  const isPortraitPagination = project?.aspect_ratio === '9:16';
  const effectiveLayout = isPortraitPagination ? StoryboardLayout.GRID_1X4 : project?.layout;
  const isWideLayout = effectiveLayout === StoryboardLayout.GRID_1X4;
  const scenesPerPage = effectiveLayout === StoryboardLayout.GRID_2X5 ? 10 : effectiveLayout === StoryboardLayout.GRID_1X4 ? 4 : 8;
  const gridCols = effectiveLayout === StoryboardLayout.GRID_2X5 ? 'grid-cols-5' : effectiveLayout === StoryboardLayout.GRID_1X4 ? 'grid-cols-1' : 'grid-cols-4';
  
  const pages: Scene[][] = [];
  if (project) {
    for (let i = 0; i < project.scenes.length; i += scenesPerPage) {
      pages.push(project.scenes.slice(i, i + scenesPerPage));
    }
  }

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth - 32;
        const storyboardWidth = 1122; // 297mm in pixels at 96dpi
        if (containerWidth < storyboardWidth) {
          setZoomScale(containerWidth / storyboardWidth);
        } else {
          setZoomScale(1.0);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [project?.layout]);

  // Reset crop/zoom state when editing a different scene
  useEffect(() => {
    if (editingScene) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setPreviewImage(null);
      setEditInstruction('');
    }
  }, [editingScene?.id]);

  const onCropComplete = useCallback((_croppedArea: CroppedArea, croppedAreaPixels: CroppedArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (imageSrc: string, pixelCrop: CroppedArea) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/png');
  };

  const handleApplyCrop = async () => {
    if (!editingScene?.image_url || !croppedAreaPixels) return;
    setIsLoading(true);
    try {
      const croppedImage = await getCroppedImg(editingScene.image_url, croppedAreaPixels);
      if (croppedImage) {
        setEditingScene({ ...editingScene, image_url: croppedImage });
        setZoom(1); // Reset zoom after crop
      }
    } catch (e) {
      console.error(e);
      await alert(t('assembly.alerts.cropError'), { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpscaleScene = async (targetSize: '2K' | '4K') => {
    if (!editingScene?.image_url || !project) return;
    const cost = UPSCALE_CREDIT_COST[targetSize];
    if (!hasEnough(cost)) {
      await alert(t('assembly.alerts.upscaleInsufficientCredits', { level: targetSize, cost }), { type: 'warning' });
      return;
    }
    const confirmed = await confirm(t('assembly.alerts.upscaleConfirm', { level: targetSize, cost }), { type: 'info' });
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const upscaled = await upscaleImage(editingScene.image_url, editingScene.image_prompt_en, targetSize, project.aspect_ratio);
      if (upscaled) {
        await deduct(cost, `${targetSize} 업스케일 (CUT #${project.scenes.findIndex(s => s.id === editingScene.id) + 1})`);
        setEditingScene({ ...editingScene, image_url: upscaled, upscale_level: targetSize });
      }
    } catch (error: unknown) {
      console.error('Upscale error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await alert(t('assembly.alerts.upscaleError', { message }), { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchUpscale = async () => {
    if (!project) return;
    const cost = UPSCALE_CREDIT_COST[batchUpscaleSize];
    const pendingScenes = project.scenes.filter(s => s.image_url && s.upscale_level !== batchUpscaleSize);
    if (pendingScenes.length === 0) {
      await alert(t('assembly.alerts.allUpscaled'), { type: 'info' });
      return;
    }
    const totalCost = pendingScenes.length * cost;
    if (!hasEnough(totalCost)) {
      await alert(t('assembly.alerts.batchUpscaleInsufficientCredits', { cost: totalCost, balance }), { type: 'warning' });
      return;
    }
    const confirmed = await confirm(t('assembly.alerts.batchUpscaleConfirm', { count: pendingScenes.length, level: batchUpscaleSize, cost: totalCost }), { type: 'info' });
    if (!confirmed) return;

    setIsLoading(true);
    setUpscaleProgress({ current: 0, total: pendingScenes.length });

    const failures: Array<{ order: number; message: string }> = [];
    let successCount = 0;

    try {
      for (let i = 0; i < pendingScenes.length; i++) {
        setUpscaleProgress({ current: i + 1, total: pendingScenes.length });
        const scene = pendingScenes[i];
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 3000));

        try {
          const upscaled = await upscaleImage(scene.image_url!, scene.image_prompt_en, batchUpscaleSize, project.aspect_ratio);
          if (upscaled) {
            await deduct(cost, `${batchUpscaleSize} 업스케일 (CUT #${scene.order})`);
            updateScene(scene.id, { image_url: upscaled, upscale_level: batchUpscaleSize });
            successCount++;
          } else {
            failures.push({ order: scene.order, message: '빈 응답' });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Upscale error for scene ${scene.order}:`, error);
          failures.push({ order: scene.order, message });
        }
      }

      if (failures.length === 0) {
        await alert(t('assembly.alerts.batchUpscaleComplete'), { type: 'success' });
      } else {
        const failedList = failures.map(f => `CUT #${f.order}: ${f.message}`).join('\n');
        await alert(
          `${successCount}/${pendingScenes.length} 변환 완료. ${failures.length}개 실패:\n\n${failedList}`,
          { type: failures.length === pendingScenes.length ? 'error' : 'warning' }
        );
      }
    } finally {
      setIsLoading(false);
      setUpscaleProgress(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportStoryboard = () => {
    if (!project) return;
    const data = JSON.stringify(project, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `REMO_${project.title.replace(/\s+/g, '_')}.storyboard`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingleScene = async (scene: Scene, idx: number) => {
    if (!scene.image_url) return;
    const blob = await sceneImageToBlob(scene.image_url);
    if (!blob) {
      await alert(t('assembly.alerts.zipError'), { type: 'error' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `REMO_Scene_${String(idx + 1).padStart(2, '0')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadImages = async () => {
    if (!project) return;
    setIsLoading(true);

    try {
      const zip = new JSZip();
      const assets = zip.folder("assets");
      let count = 0;

      await Promise.all(project.scenes.map(async (scene, idx) => {
        if (!scene.image_url) return;
        const blob = await sceneImageToBlob(scene.image_url);
        if (!blob) return;
        assets?.file(`Cut_${String(idx + 1).padStart(2, '0')}.png`, blob);
        count++;
      }));

      if (count === 0) {
        await alert(t('assembly.alerts.noImages'), { type: 'warning' });
        setIsLoading(false);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `REMO_Assets_${project.title.replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Zip generation error:", error);
      await alert(t('assembly.alerts.zipError'), { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportHtmlZip = async () => {
    if (!project) return;
    setIsLoading(true);
    try {
      const zip = new JSZip();
      const imagesFolder = zip.folder('images');
      const sceneData: Array<Record<string, string>> = [];
      let embeddedCount = 0;

      await Promise.all(project.scenes.map(async (scene, idx) => {
        const num = String(idx + 1).padStart(2, '0');
        const imgFile = `cut_${num}.png`;
        let imgEmbedded = false;
        if (scene.image_url) {
          const blob = await sceneImageToBlob(scene.image_url);
          if (blob) {
            imagesFolder?.file(imgFile, blob);
            imgEmbedded = true;
            embeddedCount++;
          }
        }
        sceneData[idx] = {
          num,
          img: imgEmbedded ? `./images/${imgFile}` : '',
          content_kr: scene.content_kr || '',
          content_en: scene.content_en || '',
          script_kr: scene.script_kr || '',
          script_en: scene.script_en || '',
          motion_kr: scene.video_motion_kr || '',
          motion_en: scene.video_motion_en || '',
          upscale: scene.upscale_level || '',
        };
      }));

      if (embeddedCount === 0) {
        await alert(t('assembly.alerts.noImages'), { type: 'warning' });
        setIsLoading(false);
        return;
      }

      const titleSafe = (project.title || 'Untitled').replace(/</g, '&lt;');
      const aspect = project.aspect_ratio || '16:9';
      const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>REMO AI Storyboard — ${titleSafe}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0a0a0a;color:#eee;padding:32px 24px;min-height:100vh}
  header{max-width:1280px;margin:0 auto 28px;border-bottom:2px solid #2a2a2a;padding-bottom:18px}
  h1{font-size:30px;font-weight:900;letter-spacing:-0.02em;font-style:italic}
  .meta{color:#888;font-size:11px;margin-top:10px;letter-spacing:0.15em;text-transform:uppercase;font-weight:700}
  .grid{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
  .card{background:#161616;border:1px solid #2a2a2a;border-radius:18px;overflow:hidden;cursor:pointer;transition:transform .2s,border-color .2s,box-shadow .2s}
  .card:hover{transform:translateY(-4px);border-color:#0057FF;box-shadow:0 12px 30px rgba(0,87,255,0.18)}
  .card .thumb{width:100%;aspect-ratio:16/9;background:#000;display:block;object-fit:cover}
  .card .thumb.empty{display:flex;align-items:center;justify-content:center;color:#444;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase}
  .card .info{padding:14px 16px}
  .card .num{font-size:10px;color:#888;font-weight:800;letter-spacing:0.2em}
  .card .title{font-size:13px;margin-top:6px;line-height:1.45;color:#ddd;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100;align-items:flex-start;justify-content:center;padding:24px;backdrop-filter:blur(10px);overflow-y:auto}
  .modal.open{display:flex}
  .modal-inner{background:#111;border:1px solid #2a2a2a;border-radius:22px;max-width:1100px;width:100%;padding:28px;position:relative;margin:auto}
  .modal-close{position:absolute;top:18px;right:18px;background:#222;border:1px solid #444;color:#ddd;width:38px;height:38px;border-radius:50%;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center}
  .modal-close:hover{background:#333;border-color:#666}
  .modal img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#000;border-radius:14px;margin-bottom:22px}
  .modal h2{font-size:24px;font-weight:900;margin-bottom:6px;letter-spacing:-0.01em}
  .modal .mmeta{font-size:11px;color:#888;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:22px;font-weight:700}
  .row{margin-bottom:18px}
  .row .label{font-size:10px;color:#888;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:6px}
  .row .text{font-size:14px;line-height:1.7;color:#eee;white-space:pre-wrap}
  .row .text.en{color:#aaa;font-size:13px;font-style:italic}
  footer{max-width:1280px;margin:48px auto 0;text-align:center;color:#555;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;font-weight:700}
  @media (max-width:600px){.modal-inner{padding:20px}.modal h2{font-size:19px}}
</style>
</head>
<body>
<header>
  <h1>REMO AI STORYBOARD</h1>
  <div class="meta">${titleSafe} · ${sceneData.length} cuts · ${aspect}</div>
</header>
<div class="grid" id="grid"></div>
<div class="modal" id="modal" aria-hidden="true">
  <div class="modal-inner" role="dialog" aria-modal="true">
    <button class="modal-close" id="modal-close" aria-label="Close">×</button>
    <div id="modal-content"></div>
  </div>
</div>
<footer>© SODAM AI STUDIO · Generated Storyboard</footer>
<script>
const scenes = ${JSON.stringify(sceneData)};
const grid = document.getElementById('grid');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
function esc(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
scenes.forEach((s,i)=>{
  const card=document.createElement('div');
  card.className='card';
  const thumb = s.img ? '<img class="thumb" src="'+s.img+'" alt="CUT '+s.num+'" loading="lazy">' : '<div class="thumb empty">No Image</div>';
  card.innerHTML = thumb + '<div class="info"><div class="num">CUT #'+s.num+'</div><div class="title">'+esc(s.content_kr)+'</div></div>';
  card.addEventListener('click',()=>openModal(i));
  grid.appendChild(card);
});
function openModal(i){
  const s=scenes[i];
  const img = s.img ? '<img src="'+s.img+'" alt="CUT '+s.num+'">' : '';
  const upscale = s.upscale ? (' · '+esc(s.upscale)) : '';
  modalContent.innerHTML = img +
    '<h2>CUT #'+s.num+'</h2>' +
    '<div class="mmeta">${aspect}'+upscale+'</div>' +
    '<div class="row"><div class="label">설명 (KR)</div><div class="text">'+esc(s.content_kr)+'</div></div>' +
    '<div class="row"><div class="label">Description (EN)</div><div class="text en">'+esc(s.content_en)+'</div></div>' +
    '<div class="row"><div class="label">대사 (KR)</div><div class="text">'+esc(s.script_kr)+'</div></div>' +
    '<div class="row"><div class="label">Script (EN)</div><div class="text en">'+esc(s.script_en)+'</div></div>' +
    '<div class="row"><div class="label">모션 / Motion</div><div class="text">'+esc(s.motion_kr)+'<br><span style="color:#888;font-size:13px;font-style:italic">'+esc(s.motion_en)+'</span></div></div>';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
document.getElementById('modal-close').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{if(e.target===modal)closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
</script>
</body>
</html>`;

      zip.file('index.html', html);
      zip.file('README.txt', `REMO AI Storyboard — ${project.title || 'Untitled'}\n\n사용법:\n1. 이 ZIP을 압축 해제합니다.\n2. index.html 파일을 더블클릭하면 브라우저에서 열립니다.\n3. 각 컷을 클릭하면 상세 팝업이 표시됩니다.\n\nHow to use:\n1. Unzip this archive.\n2. Double-click index.html to open in your browser.\n3. Click any cut to see the full details popup.\n`);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `REMO_Storyboard_${(project.title || 'Untitled').replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('HTML export error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await alert(`HTML 내보내기 실패: ${message}`, { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportStoryboard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json && Array.isArray(json.scenes)) {
          setProject({ ...json, thumbnail: json.thumbnail || project?.thumbnail || null } as Project);
          await alert(t('assembly.alerts.importSuccess'), { type: 'success' });
        } else {
          await alert(t('assembly.alerts.invalidFile'), { type: 'error' });
        }
      } catch (err) {
        console.error(err);
        await alert(t('assembly.alerts.fileReadError'), { type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
    const confirmed = await confirm(t('assembly.alerts.deleteSceneConfirm'), { type: 'warning', confirmText: t('common.delete'), cancelText: t('common.cancel') });
    if (confirmed) {
      const newScenes = project.scenes.filter(s => s.id !== id);
      const reordered = newScenes.map((s, idx) => ({ ...s, order: idx + 1 }));
      reorderScenes(reordered);
    }
  };

  const addEmptyScene = () => {
    if (!project) return;
    const newScene: Scene = {
      id: crypto.randomUUID(),
      order: project.scenes.length + 1,
      content_kr: t('planning.newScene.content'),
      content_en: 'New scene description',
      script_kr: t('planning.newScene.script'),
      script_en: 'New Script',
      image_prompt_en: 'New visual prompt',
      video_motion_en: 'STATIC',
      video_motion_kr: t('planning.newScene.motion'),
    };
    reorderScenes([...project.scenes, newScene]);
  };

  const handleSaveSceneEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScene) {
      updateScene(editingScene.id, editingScene);
      setEditingScene(null);
      setLocalRefImages([]);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (editingScene) {
          setEditingScene({...editingScene, image_url: reader.result as string});
        } else if (targetSceneIdForImage) {
          updateScene(targetSceneIdForImage, { image_url: reader.result as string });
          setTargetSceneIdForImage(null);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleModalRefUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (localRefImages.length >= 5) {
        await alert(t('assembly.alerts.maxRefs' ), { type: 'warning' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalRefImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const triggerImageUpload = (id: string) => {
    setTargetSceneIdForImage(id);
    fileInputRef.current?.click();
  };

  const handleTranslate = async (type: 'visual' | 'script') => {
    if (!editingScene) return;
    setIsLoading(true);
    try {
      if (type === 'visual') {
        const translated = await translateText(editingScene.content_kr, 'visual description');
        setEditingScene({ ...editingScene, image_prompt_en: translated });
      } else {
        const translated = await translateText(editingScene.script_kr, 'advertising script');
        setEditingScene({ ...editingScene, script_en: translated });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateLocalImage = async () => {
    if (!editingScene || !project) return;
    setIsLoading(true);
    try {
      const refs = [...localRefImages];
      if (useExistingAsRef && editingScene.image_url) {
        refs.unshift(editingScene.image_url);
      }
      // Add adjacent scene images for style consistency
      const sceneIdx = project.scenes.findIndex(s => s.id === editingScene.id);
      const prevScene = project.scenes[sceneIdx - 1];
      const nextScene = project.scenes[sceneIdx + 1];
      if (prevScene?.image_url && !refs.includes(prevScene.image_url)) {
        refs.push(prevScene.image_url);
      }
      if (nextScene?.image_url && !refs.includes(nextScene.image_url)) {
        refs.push(nextScene.image_url);
      }

      const finalPrompt = editInstruction.trim()
        ? `${editingScene.image_prompt_en}. EDIT INSTRUCTION: ${editInstruction.trim()}`
        : editingScene.image_prompt_en;
      const imageUrl = await generateSingleImage(
        finalPrompt,
        refs.length > 0 ? refs : undefined,
        project?.aspect_ratio,
        ImageModel.GEMINI_3_1_FLASH
      );
      if (imageUrl) {
        setPreviewImage(imageUrl);
      }
    } catch (error: unknown) {
      console.error('AI regenerate error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      await alert(`이미지 재생성 실패: ${message}`, { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPreview = () => {
    if (!previewImage || !editingScene) return;
    setEditingScene({ ...editingScene, image_url: previewImage, upscale_level: undefined });
    setPreviewImage(null);
  };

  const handleDiscardPreview = () => {
    setPreviewImage(null);
  };

  const handleRefineStory = async () => {
    if (!editingScene?.image_url || !project) return;
    setIsLoading(true);
    try {
      const result = await refineSceneFromImage(
        editingScene.image_url,
        editingScene.content_kr,
        editingScene.script_kr,
        defaultLanguage
      );
      if (result) {
        const ok = await confirm(
          `${t('assembly.editor.refinePreview')}\n\n` +
          `📝 ${defaultLanguage === 'ko' ? result.content_kr : result.content_en}\n` +
          `🎬 ${defaultLanguage === 'ko' ? result.script_kr : result.script_en}`,
          { type: 'info', confirmText: t('assembly.editor.refineApply'), cancelText: t('common.cancel') }
        );
        if (ok) {
          setEditingScene({
            ...editingScene,
            content_kr: result.content_kr,
            content_en: result.content_en,
            script_kr: result.script_kr,
            script_en: result.script_en,
          });
        }
      } else {
        await alert(t('assembly.editor.refineError'), { type: 'error' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefineFullStory = async () => {
    if (!project) return;
    const scenesWithImages = project.scenes.filter(s => s.image_url);
    if (scenesWithImages.length === 0) {
      await alert(t('assembly.alerts.refineFullStoryNoImages'), { type: 'warning' });
      return;
    }
    setIsLoading(true);
    try {
      const results = await refineFullStory(
        scenesWithImages.map(s => ({
          image_url: s.image_url!,
          content_kr: s.content_kr,
          script_kr: s.script_kr,
        })),
        defaultLanguage
      );
      if (results && results.length === scenesWithImages.length) {
        setRefineResults({
          originalScenes: scenesWithImages,
          refinedResults: results,
        });
      } else {
        await alert(t('assembly.alerts.refineFullStoryError'), { type: 'error' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefineApply = (acceptedMask: boolean[]) => {
    if (!project || !refineResults) return;
    const { originalScenes, refinedResults } = refineResults;
    const updatedScenes = [...project.scenes];

    for (let i = 0; i < originalScenes.length; i++) {
      if (!acceptedMask[i]) continue;
      const sceneIdx = updatedScenes.findIndex(s => s.id === originalScenes[i].id);
      if (sceneIdx === -1) continue;
      updatedScenes[sceneIdx] = {
        ...updatedScenes[sceneIdx],
        content_kr: refinedResults[i].content_kr,
        content_en: refinedResults[i].content_en,
        script_kr: refinedResults[i].script_kr,
        script_en: refinedResults[i].script_en,
      };
    }

    setProject({ ...project, scenes: updatedScenes });
    setRefineResults(null);
  };

  const handleRefineCancel = () => {
    setRefineResults(null);
  };

  const removeLocalRef = (idx: number) => {
    setLocalRefImages(prev => prev.filter((_, i) => i !== idx));
  };

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center border border-zinc-200">
          <FileText size={40} className="text-zinc-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">{t('assembly.noProject')}</h2>
          <p className="text-zinc-500 text-sm">{t('assembly.noProjectDesc')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-10 py-4 bg-primary text-white rounded-full flex items-center gap-2 font-black shadow-[0_8px_20px_rgba(41,52,99,0.25)] hover:bg-[#1E2650] transition-all"
          >
            <FileUp size={20} /> <span>{t('assembly.importStoryboard')}</span>
          </button>
        </div>
        <input type="file" ref={importInputRef} className="hidden" accept=".storyboard,.json" onChange={handleImportStoryboard} />
      </div>
    );
  }

  const isPortrait = project.aspect_ratio === '9:16';

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500 pb-20">
      <style>{`
  .storyboard-page {
    width: ${isPortrait ? '210mm' : '297mm'};
    height: ${isPortrait ? '297mm' : '210mm'};
    background: white;
    padding: 15mm;
    color: black;
    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
`}</style>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={importInputRef} className="hidden" accept=".storyboard,.json" onChange={handleImportStoryboard} />

      {/* Controls Bar */}
      <div className="flex flex-col gap-6 print:hidden bg-white p-8 rounded-[2.5rem] border border-zinc-100">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
          <div className="space-y-4 text-left">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-primary uppercase tracking-widest">{t('assembly.projectName')}</label>
              <input 
                value={project.title}
                onChange={(e) => updateProjectSettings({ title: e.target.value })}
                className="text-4xl font-bold tracking-tight bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg w-full text-zinc-900"
                placeholder={t('assembly.projectNamePlaceholder')}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('assembly.keyMessage')}</label>
              <input
                value={project.key_message || ''}
                onChange={(e) => updateProjectSettings({ key_message: e.target.value })}
                className="text-xl font-medium tracking-tight bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg w-full text-zinc-500"
                placeholder={t('assembly.keyMessagePlaceholder')}
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-4 items-end">
            <div className="flex flex-wrap gap-3">
              <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                <button onClick={() => setViewLanguage('KR')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${viewLanguage === 'KR' ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}>
                  <Languages size={14} /> KR
                </button>
                <button onClick={() => setViewLanguage('EN')} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${viewLanguage === 'EN' ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}>
                  <Languages size={14} /> EN
                </button>
              </div>
              {isPortrait ? (
                <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                  <div className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-primary text-white shadow-lg">
                    {t('assembly.portraitLayout')}
                  </div>
                </div>
              ) : (
                <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200">
                  <button onClick={() => updateProjectSettings({ layout: StoryboardLayout.GRID_2X5 })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${project.layout === StoryboardLayout.GRID_2X5 ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}>
                    2x5 Grid
                  </button>
                  <button onClick={() => updateProjectSettings({ layout: StoryboardLayout.GRID_2X4 })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${project.layout === StoryboardLayout.GRID_2X4 ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}>
                    2x4 Grid
                  </button>
                  <button onClick={() => updateProjectSettings({ layout: StoryboardLayout.GRID_1X4 })} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${project.layout === StoryboardLayout.GRID_1X4 ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-900'}`}>
                    1x4 Wide
                  </button>
                </div>
              )}
            </div>
            <div data-tour="assembly-export" className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={() => importInputRef.current?.click()}
                className="px-5 py-3 bg-white rounded-2xl flex items-center gap-2 border border-zinc-200 hover:bg-zinc-50 transition-all font-bold text-sm text-zinc-700"
                title={t('assembly.importFile')}
              >
                <FileUp size={18} /> <span>{t('assembly.importFile')}</span>
              </button>
              <button onClick={handleExportStoryboard} className="px-5 py-3 bg-white rounded-2xl flex items-center gap-2 border border-zinc-200 hover:bg-zinc-50 transition-all font-bold text-sm text-zinc-700">
                <Download size={18} /> <span>{t('assembly.export')}</span>
              </button>
              <button onClick={handleExportHtmlZip} disabled={isLoading} className="px-5 py-3 bg-white rounded-2xl flex items-center gap-2 border border-zinc-200 hover:bg-zinc-50 transition-all font-bold text-sm text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <FileText size={18} /> <span>{t('assembly.exportHtml')}</span>
              </button>
              <button onClick={handlePrint} className="px-10 py-3 bg-primary rounded-full flex items-center gap-2 font-black shadow-[0_8px_20px_rgba(41,52,99,0.25)] hover:bg-[#1E2650] transition-all text-white">
                <Printer size={18} /> <span>{t('assembly.printPdf')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pages Container */}
      <div
        data-tour="assembly-storyboard"
        ref={containerRef}
        className="storyboard-pages-container flex flex-col gap-10 items-center bg-zinc-50 p-4 rounded-[3rem] border border-zinc-100"
      >
        <div style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }} className="storyboard-print-wrapper flex flex-col gap-10">
          {pages.map((pageScenes, pageIdx) => (
            <div key={pageIdx} className="storyboard-page">
              {/* Header */}
              <div className="flex justify-between items-start mb-6 border-b-4 border-black pb-4 text-left">
                <div>
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">SODAM AI STUDIO</h2>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{t('assembly.storyboardSubheader')}</p>
                </div>
                <div className="text-right grid grid-cols-2 gap-x-6 gap-y-1">
                  <span className="text-[10px] font-black text-gray-400 uppercase">{t('assembly.project')}</span>
                  <span className="text-xs font-bold border-b border-gray-200 uppercase truncate max-w-[150px]">{project.title}</span>
                  <span className="text-[10px] font-black text-gray-400 uppercase">{t('assembly.keyMsg')}</span>
                  <span className="text-xs font-bold border-b border-gray-200 truncate max-w-[200px]">{project.key_message || t('assembly.na')}</span>
                  <span className="text-[10px] font-black text-gray-400 uppercase">{t('assembly.style')}</span>
                  <span className="text-xs font-bold border-b border-gray-200">{project.style}</span>
                </div>
              </div>

              {/* Grid */}
              <div className={`grid ${gridCols} ${isWideLayout ? 'gap-3' : 'grid-rows-2 gap-4'} flex-1 content-start`}>
                {pageScenes.map((scene) => {
                  const globalIdx = project.scenes.findIndex(s => s.id === scene.id);

                  if (isWideLayout) {
                    // 1x4 Wide Layout: horizontal card
                    return (
                      <div key={scene.id} className={`border-2 border-black flex flex-row overflow-hidden relative group bg-white text-left ${isPortrait ? 'h-[180px]' : 'h-[140px]'}`}>
                        <div className="absolute top-0 right-0 p-1 flex gap-1 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity z-10 print:hidden">
                          <button onClick={() => setEditingScene(scene)} className="p-1 hover:text-primary"><Edit3 size={10} /></button>
                          <button onClick={() => triggerImageUpload(scene.id)} className="p-1 hover:text-primary"><ImageIcon size={10} /></button>
                          <button onClick={() => moveScene(globalIdx, 'up')} className="p-1 hover:text-white"><ArrowUp size={10} /></button>
                          <button onClick={() => moveScene(globalIdx, 'down')} className="p-1 hover:text-white"><ArrowDown size={10} /></button>
                          <button onClick={() => removeScene(scene.id)} className="p-1 hover:text-red-500"><Trash2 size={10} /></button>
                        </div>

                        {/* Cut number + Image */}
                        <div className={`shrink-0 ${isPortrait ? 'w-[120px]' : 'w-[200px]'} flex flex-col border-r-2 border-black`}>
                          <div className="bg-black text-white px-2 py-1 text-[9px] font-black italic">
                            CUT #{String(globalIdx + 1).padStart(2, '0')}
                          </div>
                          <div className="flex-1 bg-gray-50 relative overflow-hidden">
                            {scene.image_url ? (
                              <img src={scene.image_url} alt={`Cut ${globalIdx + 1}`} className="w-full h-full object-cover" />
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-200 gap-1">
                                <ImageIcon size={20} />
                                <span className="text-[6px] font-bold uppercase">{t('assembly.sceneReady')}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Text columns */}
                        <div className="flex-1 flex overflow-hidden">
                          <div className="flex-1 p-3 border-r border-gray-200 overflow-hidden">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">{t('assembly.sceneVisualContent')}</p>
                            <p className="text-[12px] font-bold leading-snug text-black">
                              {viewLanguage === 'KR' ? scene.content_kr : (scene.content_en || scene.image_prompt_en)}
                            </p>
                          </div>
                          <div className="flex-1 p-3 border-r border-gray-200 overflow-hidden">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">{t('assembly.sceneScript')}</p>
                            <p className="text-[12px] italic leading-snug text-gray-700 font-medium">
                              "{viewLanguage === 'KR' ? scene.script_kr : scene.script_en}"
                            </p>
                          </div>
                          <div className="w-[180px] shrink-0 p-3 overflow-hidden">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider mb-1">{t('assembly.sceneMotion')}</p>
                            <p className="text-[12px] font-black text-black leading-snug">
                              {viewLanguage === 'KR' ? (scene.video_motion_kr || scene.video_motion_en) : scene.video_motion_en}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Default 2x5 / 2x4 vertical card
                  return (
                    <div key={scene.id} className="border-2 border-black flex flex-col overflow-hidden relative group bg-white text-left h-full">
                      <div className="absolute top-0 right-0 p-1 flex gap-1 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity z-10 print:hidden">
                        <button onClick={() => setEditingScene(scene)} className="p-1 hover:text-primary"><Edit3 size={10} /></button>
                        <button onClick={() => triggerImageUpload(scene.id)} className="p-1 hover:text-primary"><ImageIcon size={10} /></button>
                        <button onClick={() => moveScene(globalIdx, 'up')} className="p-1 hover:text-white"><ArrowUp size={10} /></button>
                        <button onClick={() => moveScene(globalIdx, 'down')} className="p-1 hover:text-white"><ArrowDown size={10} /></button>
                        <button onClick={() => removeScene(scene.id)} className="p-1 hover:text-red-500"><Trash2 size={10} /></button>
                      </div>

                      <div className="flex justify-between bg-black text-white px-2 py-1 text-[9px] font-black italic">
                        <span>CUT #{String(globalIdx + 1).padStart(2, '0')}</span>
                      </div>

                      <div className={`${isPortrait ? 'aspect-[3/4]' : 'aspect-video'} bg-gray-50 relative overflow-hidden border-b-2 border-black shrink-0`}>
                        {scene.image_url ? (
                          <img src={scene.image_url} alt={`Cut ${globalIdx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-200 gap-1">
                            <ImageIcon size={20} />
                            <span className="text-[6px] font-bold uppercase">{t('assembly.sceneReadyToVisualize')}</span>
                          </div>
                        )}
                      </div>

                      <div className="p-2 flex-1 flex flex-col gap-1 bg-white text-left overflow-hidden min-h-0">
                        <p className={`${isPortrait ? 'text-[10px]' : 'text-[14px]'} font-bold leading-tight line-clamp-2 text-black`}>
                          {viewLanguage === 'KR' ? scene.content_kr : (scene.content_en || scene.image_prompt_en)}
                        </p>
                        <p className={`${isPortrait ? 'text-[9px]' : 'text-[13px]'} italic leading-tight text-gray-700 font-medium line-clamp-2`}>
                          "{viewLanguage === 'KR' ? scene.script_kr : scene.script_en}"
                        </p>
                        <p className={`mt-auto pt-1 border-t border-gray-100 ${isPortrait ? 'text-[9px]' : 'text-[13px]'} font-black text-black leading-tight truncate`}>
                          {viewLanguage === 'KR' ? (scene.video_motion_kr || scene.video_motion_en) : scene.video_motion_en}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-6 pt-4 border-t-2 border-black/10 flex justify-between items-center text-[9px] text-gray-400 font-black uppercase">
                <div className="flex gap-4 italic">
                  <span>{t('assembly.pageFooter')}</span>
                  <span>ID: {project.id.split('-')[0]}</span>
                </div>
                <div className="bg-black text-white px-4 py-1 skew-x-[-12deg]">
                  <span>{t('assembly.pageOf', { current: String(pageIdx + 1).padStart(2, '0'), total: String(pages.length).padStart(2, '0') })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline Manager Grid Panel */}
      <div data-tour="assembly-timeline" className="bg-white p-10 rounded-[3rem] border border-zinc-200 space-y-8 print:hidden">
        <div className="flex items-center justify-between">
          <div className="space-y-1 text-left">
            <h3 className="text-2xl font-extrabold tracking-tight text-zinc-900 flex items-center gap-3">
              <LayoutIcon className="text-primary" /> {t('assembly.timelineManager')}
            </h3>
            <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">{t('assembly.timelineSubtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* AI Full Story Refine */}
            <button
              onClick={handleRefineFullStory}
              disabled={isLoading}
              className="px-6 py-3 bg-[#FEF3D6] hover:bg-[#FBEBC4] border border-[#F5E1B0] text-[#B7791F] rounded-2xl flex items-center gap-2 text-xs font-bold uppercase transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <><RefreshCw size={16} className="animate-spin" /> <span>{t('assembly.refiningFullStory')}</span></>
              ) : (
                <><Wand2 size={16} /> <span>{t('assembly.refineFullStory')}</span></>
              )}
            </button>
            {/* Batch Upscale */}
            <button
              onClick={handleBatchUpscale}
              disabled={isLoading}
              className="px-6 py-3 bg-primary/20 hover:bg-primary border border-primary/40 text-primary hover:text-white rounded-2xl flex items-center gap-2 text-xs font-bold uppercase transition-all disabled:opacity-50"
            >
              {upscaleProgress ? (
                <><RefreshCw size={16} className="animate-spin" /> <span>{upscaleProgress.current}/{upscaleProgress.total}</span></>
              ) : (
                <><Maximize2 size={16} /> <span>고화질(2K)로 변환 ({project.scenes.filter(s => s.image_url && s.upscale_level !== batchUpscaleSize).length}씬, 3C/씬)</span></>
              )}
            </button>
            {/* Download Images - Primary CTA */}
            <button
              onClick={handleDownloadImages}
              disabled={isLoading}
              className="px-6 py-3 bg-primary hover:bg-primary/80 border border-primary rounded-2xl flex items-center gap-2 text-xs font-black uppercase transition-all text-white shadow-[0_4px_16px_rgba(41,52,99,0.25)] disabled:opacity-50"
            >
              <Archive size={16} />
              <span>{t('assembly.downloadZip')}</span>
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
          {project.scenes.map((scene, idx) => (
            <div key={scene.id} className="space-y-2 group">
              <div className={`${isPortrait ? 'aspect-[9/16]' : 'aspect-video'} bg-zinc-100 border-2 border-zinc-200 rounded-2xl overflow-hidden group-hover:border-primary transition-all relative shadow-lg cursor-pointer`}>
                {scene.image_url ? (
                  <img src={scene.image_url} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center opacity-10"><ImageIcon size={24} /></div>
                )}
                {scene.upscale_level && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[8px] font-black text-emerald-700 z-10">
                    {scene.upscale_level}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                   <button onClick={() => setEditingScene(scene)} className="w-full py-2 bg-primary text-white text-[9px] font-black rounded-lg shadow-lg flex items-center justify-center gap-1"><Edit3 size={10} /> 편집</button>
                   <button onClick={() => triggerImageUpload(scene.id)} className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black rounded-lg flex items-center justify-center gap-1"><Upload size={10} /> 교체</button>
                </div>
              </div>
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black italic text-zinc-400">#{String(idx + 1).padStart(2, '0')}</span>
                <div className="flex gap-1">
                  <button onClick={() => moveScene(idx, 'up')} className="p-1 hover:text-primary text-zinc-500 transition-colors" title="Move Left"><ArrowUp size={14} className="-rotate-90" /></button>
                  <button onClick={() => moveScene(idx, 'down')} className="p-1 hover:text-primary text-zinc-500 transition-colors" title="Move Right"><ArrowDown size={14} className="-rotate-90" /></button>
                  <button
                    onClick={() => handleDownloadSingleScene(scene, idx)}
                    disabled={!scene.image_url}
                    className="p-1 hover:text-primary text-zinc-500 transition-colors disabled:opacity-30"
                    title="Download Scene Image"
                  >
                    <Download size={14} />
                  </button>
                  <button onClick={() => removeScene(scene.id)} className="p-1 hover:text-red-500 text-zinc-500 transition-colors ml-1" title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addEmptyScene} className={`${isPortrait ? 'aspect-[9/16]' : 'aspect-video'} border-2 border-dashed border-zinc-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-zinc-50 hover:border-zinc-300 transition-all text-zinc-400 group`}>
            <Plus size={24} className="group-hover:text-primary transition-colors" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">New Cut</span>
          </button>
        </div>
      </div>

      {/* Edit Modal Popup */}
      {editingScene && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md">
          <div className="bg-white border border-zinc-200 rounded-[3rem] w-full max-w-7xl h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-8 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/20 rounded-2xl text-primary"><Edit3 size={24} /></div>
                <div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-zinc-900">Precision Visual Editor</h3>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">CUT #{String(project.scenes.findIndex(s => s.id === editingScene.id) + 1).padStart(2, '0')} • {project.aspect_ratio || '16:9'} Aspect Ratio Refinement</p>
                </div>
              </div>
              <button onClick={() => setEditingScene(null)} className="p-3 hover:bg-zinc-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              {/* Center: Image Editor (Cropper) */}
              <div className="flex-[1.5] bg-zinc-50 relative flex flex-col border-r border-zinc-100">
                <div className="relative flex-1 bg-black">
                  {editingScene.image_url ? (
                    <Cropper
                      key={editingScene.id}
                      image={editingScene.image_url}
                      crop={crop}
                      zoom={zoom}
                      aspect={project.aspect_ratio === '9:16' ? 9 / 16 : 16 / 9}
                      onCropChange={setCrop}
                      onCropComplete={onCropComplete}
                      onZoomChange={setZoom}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-200 gap-4">
                      <ImageIcon size={64} />
                      <p className="text-xs font-bold uppercase">No Image to Edit</p>
                    </div>
                  )}
                  {isLoading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[101] flex items-center justify-center">
                      <RefreshCw size={32} className="text-primary animate-spin" />
                    </div>
                  )}
                  {/* Preview Comparison Overlay */}
                  {previewImage && (
                    <div className="absolute inset-0 z-[102] flex flex-col bg-black">
                      <div className="flex-1 relative">
                        <img src={previewImage} className="w-full h-full object-contain" alt="Preview" />
                        <div className="absolute top-4 left-4 px-3 py-1.5 bg-primary/90 rounded-lg text-[10px] font-black uppercase tracking-wider">
                          {t('assembly.editor.previewNew')}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-white backdrop-blur-xl border-t border-zinc-100">
                        <button
                          type="button"
                          onClick={handleDiscardPreview}
                          className="flex-1 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all text-zinc-700"
                        >
                          <X size={14} /> {t('assembly.editor.previewDiscard')}
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyPreview}
                          className="flex-[2] py-3 bg-primary hover:bg-primary/90 rounded-xl text-sm font-black uppercase flex items-center justify-center gap-2 transition-all text-white shadow-[0_0_20px_rgba(41,52,99,0.25)]"
                        >
                          <Check size={16} /> {t('assembly.editor.previewApply')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cropper Toolbar */}
                <div className="p-6 bg-zinc-50 backdrop-blur-xl border-t border-zinc-100 flex items-center justify-between gap-8 shrink-0">
                  <div className="flex items-center gap-4 flex-1">
                    <ZoomIn size={18} className="text-zinc-400" />
                    <button
                      type="button"
                      onClick={() => setZoom(Math.max(1, +(zoom - 0.05).toFixed(2)))}
                      className="p-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-lg transition-all"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="range"
                      value={zoom}
                      min={1}
                      max={3}
                      step={0.05}
                      aria-labelledby="Zoom"
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setZoom(Math.min(3, +(zoom + 0.05).toFixed(2)))}
                      className="p-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-lg transition-all"
                    >
                      <Plus size={14} />
                    </button>
                    <span className="text-[10px] font-bold text-zinc-500 w-12">{zoom.toFixed(2)}x</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleApplyCrop}
                      disabled={isLoading || !editingScene.image_url}
                      className="px-6 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Scissors size={14} /> {t('assembly.editor.trimArtifacts')}
                    </button>
                    <button
                      type="button"
                      onClick={() => modalFileRef.current?.click()}
                      className="px-6 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all"
                    >
                      <Upload size={14} /> {t('assembly.editor.swapImage')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!editingScene?.image_url) return;
                        const link = document.createElement('a');
                        link.href = editingScene.image_url;
                        const sceneIdx = project.scenes.findIndex(s => s.id === editingScene.id);
                        link.download = `REMO_Scene_${String(sceneIdx + 1).padStart(2, '0')}.png`;
                        link.click();
                      }}
                      disabled={!editingScene?.image_url}
                      className="px-6 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Download size={14} /> {t('assembly.editor.downloadImage')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Data & AI Generation Form */}
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                <form onSubmit={handleSaveSceneEdit} className="flex-1 p-8 space-y-6 overflow-y-auto custom-scrollbar">
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Type size={12} /> {t('planning.editModal.visualContentKr')}</label>
                      <textarea value={editingScene.content_kr} onChange={(e) => setEditingScene({...editingScene, content_kr: e.target.value})} className="w-full h-20 bg-white border border-zinc-200 rounded-[1.2rem] p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all text-zinc-900" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Type size={12} /> {t('planning.editModal.visualContentEn')}</label>
                      <textarea value={editingScene.content_en || ''} onChange={(e) => setEditingScene({...editingScene, content_en: e.target.value})} className="w-full h-20 bg-white border border-zinc-200 rounded-[1.2rem] p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all text-zinc-900" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                         <span className="flex items-center gap-2"><Type size={12} /> {t('planning.editModal.imagePromptEn')}</span>
                         <button type="button" onClick={() => handleTranslate('visual')} className="text-primary hover:text-primary/80 flex items-center gap-1"><RefreshCw size={10} /> Auto-Sync</button>
                      </label>
                      <textarea value={editingScene.image_prompt_en} onChange={(e) => setEditingScene({...editingScene, image_prompt_en: e.target.value})} className="w-full h-20 bg-white border border-zinc-200 rounded-[1.2rem] p-4 text-sm focus:border-primary focus:outline-none resize-none transition-all text-zinc-900 font-mono" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Layers size={12} /> {t('planning.editModal.audioScriptKr')}</label>
                        <textarea value={editingScene.script_kr} onChange={(e) => setEditingScene({...editingScene, script_kr: e.target.value})} className="w-full h-20 bg-white border border-zinc-200 rounded-[1.2rem] p-4 text-xs focus:border-primary focus:outline-none resize-none text-zinc-900" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Layers size={12} /> {t('planning.editModal.audioScriptEn')}</label>
                        <textarea value={editingScene.script_en} onChange={(e) => setEditingScene({...editingScene, script_en: e.target.value})} className="w-full h-20 bg-white border border-zinc-200 rounded-[1.2rem] p-4 text-xs focus:border-primary focus:outline-none resize-none text-zinc-900" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('assembly.editModal.motionKr')}</label>
                        <input value={editingScene.video_motion_kr || ''} onChange={(e) => setEditingScene({...editingScene, video_motion_kr: e.target.value})} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-xs focus:border-primary focus:outline-none transition-all font-bold text-zinc-900" placeholder={t('planning.editModal.motionKrPlaceholder')} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('planning.editModal.motionEn')}</label>
                        <input value={editingScene.video_motion_en} onChange={(e) => setEditingScene({...editingScene, video_motion_en: e.target.value})} className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-xs focus:border-primary focus:outline-none transition-all font-bold uppercase tracking-tighter text-zinc-900" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-6 border-t border-zinc-100 space-y-5">
                    {/* Reference Toggle */}
                    <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                      <button
                        type="button"
                        onClick={() => setUseExistingAsRef(!useExistingAsRef)}
                        className={`w-11 h-6 rounded-full transition-all relative flex items-center px-1 shrink-0 ${useExistingAsRef ? 'bg-primary shadow-[0_0_12px_rgba(41,52,99,0.3)]' : 'bg-zinc-300'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full transition-all ${useExistingAsRef ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                      <span className="text-xs font-bold text-zinc-700">{t('assembly.existingRefStyle')}</span>
                    </div>

                    {/* Edit Instruction */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('assembly.editor.editInstruction')}</label>
                      <textarea
                        value={editInstruction}
                        onChange={(e) => setEditInstruction(e.target.value)}
                        placeholder={t('assembly.editor.editInstructionPlaceholder')}
                        className="w-full h-16 bg-white border border-zinc-200 rounded-xl p-3 text-xs focus:border-primary focus:outline-none resize-none text-zinc-900 placeholder:text-zinc-400"
                      />
                    </div>

                    {/* Additional References */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                        <span>{t('assembly.additionalRefs', { count: localRefImages.length })}</span>
                        {localRefImages.length < 5 && (
                          <button
                            type="button"
                            onClick={() => modalRefUploadRef.current?.click()}
                            className="w-6 h-6 flex items-center justify-center rounded-md border border-primary/50 text-primary hover:bg-primary/20 hover:border-primary transition-all shadow-[0_0_8px_rgba(41,52,99,0.15)]"
                          >
                            <Plus size={12} strokeWidth={3} />
                          </button>
                        )}
                      </label>
                      {localRefImages.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {localRefImages.map((img, i) => (
                            <div key={i} className="aspect-square rounded-xl overflow-hidden relative group border border-zinc-200">
                              <img src={img} className="w-full h-full object-cover" />
                              <button type="button" onClick={() => removeLocalRef(i)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"><X size={14} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input type="file" ref={modalRefUploadRef} className="hidden" accept="image/*" onChange={handleModalRefUpload} />
                    </div>

                    {/* AI Regenerate */}
                    <button
                      type="button"
                      onClick={handleGenerateLocalImage}
                      disabled={isLoading}
                      className="w-full py-5 bg-primary/20 border border-primary/40 rounded-2xl font-black flex items-center justify-center gap-4 hover:bg-primary transition-all text-primary hover:text-white uppercase disabled:opacity-50"
                    >
                      {isLoading
                        ? <><RefreshCw size={18} className="animate-spin" /> <span className="text-sm">{t('assembly.editor.processing')}</span></>
                        : <><Sparkles size={18} /> <span className="text-sm">{t('assembly.editor.aiRegenerateUpscale')}</span></>
                      }
                    </button>

                    <button type="submit" className="w-full py-5 bg-primary rounded-full text-sm font-black shadow-[0_8px_20px_rgba(41,52,99,0.25)] flex items-center justify-center gap-3 hover:bg-[#1E2650] transition-all text-white uppercase mt-2">
                      <Save size={18} /> {t('assembly.editor.updateStoryboard')}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Hidden Input */}
            <input type="file" ref={modalFileRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
          </div>
        </div>
      )}

      {/* Refine Full Story Comparison Modal */}
      {refineResults && (
        <RefineFullStoryModal
          originalScenes={refineResults.originalScenes}
          refinedResults={refineResults.refinedResults}
          viewLanguage={viewLanguage}
          onApply={handleRefineApply}
          onCancel={handleRefineCancel}
        />
      )}
    </div>
  );
};
