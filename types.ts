
export enum ProjectStep {
  DASHBOARD = 'DASHBOARD',
  IMAGE_STUDIO = 'IMAGE_STUDIO',
  VIDEO_STUDIO = 'VIDEO_STUDIO',
  VOICE_STUDIO = 'VOICE_STUDIO',
  ASSETS = 'ASSETS',
  PLANNING = 'PLANNING',
  VISUALIZING = 'VISUALIZING',
  ASSEMBLY = 'ASSEMBLY',
  PRODUCTION = 'PRODUCTION',
  SETTINGS = 'SETTINGS',
  ADMIN = 'ADMIN'
}

export enum AdDuration {
  S15 = 15,
  S30 = 30,
  S45 = 45,
  S60 = 60
}

export enum VisualStyle {
  CINEMATIC = 'Cinematic',
  REALISTIC = 'Realistic',
  TOSS_3D = '3D Render',
  FLAT_2D_PINK = '2D Flat Pink',
  MOTION_GRAPHICS = 'Motion Graphics',
  PIXAR_3D = 'Pixar 3D',
  JAPANESE_ANIME = 'Japanese Anime',
  WATERCOLOR = 'Watercolor',
  CYBERPUNK = 'Cyberpunk',
  SIMPLE_LINE_ART = 'Simple Line Art'
}

export enum StoryboardLayout {
  GRID_2X5 = '2x5',
  GRID_2X4 = '2x4',
  GRID_1X4 = '1x4'
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16'
}

export enum SceneCount {
  CUTS_4 = 4,
  CUTS_8 = 8,
  CUTS_9 = 9,
  CUTS_18 = 18
}

export const SCENE_DURATION_MAP: Record<SceneCount, number> = {
  [SceneCount.CUTS_4]: 15,
  [SceneCount.CUTS_8]: 30,
  [SceneCount.CUTS_9]: 30,
  [SceneCount.CUTS_18]: 60,
};

// 라벨은 "Nano Banana" 별명 축으로 통일한다. 예전에는 3.1 Flash 만 별명으로,
// 2.5 Flash 는 모델명으로 표기해 같은 계열의 구/신 세대가 서로 다른 것처럼 보였다.
// (gemini-2.5-flash-image = 1세대 Nano Banana 는 구세대라 2026-08 목록에서 제외)
export enum ImageModel {
  GEMINI_3_1_FLASH = 'gemini-3.1-flash-image-preview',
  GEMINI_3_PRO = 'gemini-3-pro-image-preview',
  GPT_IMAGE_2 = 'gpt-image-2'
}

export const IMAGE_MODEL_INFO: Record<ImageModel, { label: string; description: string; creditCost: number }> = {
  [ImageModel.GEMINI_3_1_FLASH]: {
    label: 'Nano Banana 2',
    description: 'Fast + High Quality (Default)',
    creditCost: 3,
  },
  [ImageModel.GEMINI_3_PRO]: {
    label: 'Nano Banana Pro',
    description: 'Best Quality',
    creditCost: 5,
  },
  // GPT Image 2 는 임의 해상도를 지원해 시트를 3840x2160(4K)로 뽑는다.
  // 3×3 그리드 기준 컷 1개가 1280x720 으로, Kling std 입력 해상도와 정확히 맞는다.
  // 원가 ~$0.06/장(₩82) → 5cr(₩250) 기준 마진 약 +205%.
  [ImageModel.GPT_IMAGE_2]: {
    label: 'GPT Image 2',
    description: '4K Sheet · Sharpest Cuts',
    creditCost: 5,
  },
};

export interface Scene {
  id: string;
  order: number;
  content_kr: string;
  content_en: string;
  script_kr: string;
  script_en: string;
  image_prompt_en: string;
  video_motion_en: string;
  video_motion_kr: string;
  image_url?: string;
  video_url?: string;
  upscale_level?: '2K' | '4K' | null;
}

export interface Project {
  id: string;
  title: string;
  key_message?: string;
  duration: AdDuration;
  style: VisualStyle;
  idea: string;
  scenes: Scene[];
  grid_images: (string | null)[];
  global_grid_prompt?: string;
  layout: StoryboardLayout;
  thumbnail?: string | null;
  current_stage?: string | null;
  original_creator_id?: string | null;
  creator_display_name?: string | null;
  creator_avatar_url?: string | null;
  aspect_ratio?: AspectRatio;
  scene_count?: SceneCount;
  generation_language?: 'ko' | 'en';
}

export type BatchSceneStatus = 'idle' | 'queued' | 'generating' | 'completed' | 'failed';

export interface BatchQueueItem {
  sceneId: string;
  status: BatchSceneStatus;
  error?: string;
}

export type ReferenceCategory = 'character' | 'product' | 'accessory' | 'background';

export interface CategorizedRefImage {
  image: string;
  category: ReferenceCategory;
}

export const REFERENCE_CATEGORY_INFO: Record<ReferenceCategory, { label: string; labelKr: string; promptInstruction: string }> = {
  character: {
    label: 'Character',
    labelKr: '인물',
    promptInstruction: 'This is the MAIN CHARACTER reference. Maintain exact facial features, body type, hair style, and overall appearance consistency.',
  },
  product: {
    label: 'Product',
    labelKr: '상품',
    promptInstruction: 'This is the HERO PRODUCT reference. Reproduce exact shape, color, branding, and design details faithfully.',
  },
  accessory: {
    label: 'Accessory',
    labelKr: '악세사리',
    promptInstruction: 'This is an ACCESSORY/OUTFIT reference. Follow the clothing style, props, and fashion details as a style guide.',
  },
  background: {
    label: 'Background',
    labelKr: '배경',
    promptInstruction: 'This is a BACKGROUND/ENVIRONMENT reference. Match the spatial layout, lighting mood, and atmosphere.',
  },
};

export const UPSCALE_CREDIT_COST: Record<string, number> = {
  '2K': 3,
  '4K': 5,
};
