
export enum ProjectStep {
  DASHBOARD = 'DASHBOARD',
  IMAGE_STUDIO = 'IMAGE_STUDIO',
  VIDEO_STUDIO = 'VIDEO_STUDIO',
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

export enum ImageModel {
  GEMINI_3_1_FLASH = 'gemini-3.1-flash-image-preview',
  GEMINI_3_PRO = 'gemini-3-pro-image-preview',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash-image'
}

export const IMAGE_MODEL_INFO: Record<ImageModel, { label: string; description: string; creditCost: number }> = {
  [ImageModel.GEMINI_3_1_FLASH]: {
    label: 'Nano Banana 2',
    description: 'Fast + High Quality (Default)',
    creditCost: 3,
  },
  [ImageModel.GEMINI_3_PRO]: {
    label: 'Gemini 3 Pro',
    description: 'Best Quality (Nano Banana Pro)',
    creditCost: 5,
  },
  [ImageModel.GEMINI_2_5_FLASH]: {
    label: 'Gemini 2.5 Flash',
    description: 'Fast & Efficient',
    creditCost: 2,
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
