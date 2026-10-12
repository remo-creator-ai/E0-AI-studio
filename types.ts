
export enum ProjectStep {
  DASHBOARD = 'DASHBOARD',
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
  S60 = 60,
  /** 27컷(3x3 x 3유닛) 전용. SettingsPage 의 기본 길이 선택지에는 넣지 않는다. */
  S90 = 90
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
  CUTS_18 = 18,
  CUTS_27 = 27
}

export const SCENE_DURATION_MAP: Record<SceneCount, number> = {
  [SceneCount.CUTS_4]: 15,
  [SceneCount.CUTS_8]: 30,
  [SceneCount.CUTS_9]: 30,
  [SceneCount.CUTS_18]: 60,
  // 18컷 60초와 같은 컷당 3.33초 페이스 유지
  [SceneCount.CUTS_27]: 90,
};

// 라벨은 "Nano Banana" 별명 축으로 통일한다. 예전에는 3.1 Flash 만 별명으로,
// 2.5 Flash 는 모델명으로 표기해 같은 계열의 구/신 세대가 서로 다른 것처럼 보였다.
// (gemini-2.5-flash-image = 1세대 Nano Banana 는 구세대라 2026-08 목록에서 제외)
export enum ImageModel {
  GEMINI_3_1_FLASH = 'gemini-3.1-flash-image-preview',
  GEMINI_3_PRO = 'gemini-3-pro-image-preview',
  GPT_IMAGE_2 = 'gpt-image-2'
}

/** 이미지 생성·편집·업스케일의 단일 기본 모델.
 *  화면마다 다른 값을 하드코딩하던 것을 여기로 모은다. 프로젝트가
 *  `image_model` 을 들고 있으면 그 값이 우선하고, 없으면 이 값이 쓰인다. */
export const DEFAULT_IMAGE_MODEL = ImageModel.GEMINI_3_1_FLASH;

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
  /** 이미지 프롬프트 (한국어) — Korean-only 전환의 1급 필드.
   *  값이 있으면 생성·편집이 이 값을 쓰고, 없으면 image_prompt_en 으로 폴백한다.
   *  기존 프로젝트는 이 필드가 비어 있으므로 하위 호환이 유지된다. */
  image_prompt_kr?: string;
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
  /** 이 프로젝트에서 마지막으로 고른 이미지 모델. 스토리보드 만들기에서 고르면
   *  다듬기 단계의 편집기·업스케일도 같은 모델을 이어서 쓴다. 없으면 DEFAULT_IMAGE_MODEL. */
  image_model?: ImageModel;
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
