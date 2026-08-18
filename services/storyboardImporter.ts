import {
  Project, Scene, AdDuration, VisualStyle, StoryboardLayout,
  AspectRatio, SceneCount, ImageModel, SCENE_DURATION_MAP,
} from '../types';
import { getSceneGridUnits } from '../lib/sceneGrid';

interface RawScene {
  order?: number;
  content_kr?: string;
  script_kr?: string;
  script_en?: string;
  image_prompt_en?: string;
  video_motion_en?: string;
}

interface RawUnit {
  section?: string;
  scenes?: RawScene[];
}

interface RawStoryboard {
  title?: string;
  key_message?: string;
  duration?: number | string;
  style?: string;
  idea?: string;
  units?: RawUnit[];
  scenes?: RawScene[];
  global_grid_prompt?: string;
  layout?: string;
}

export interface ImportResult {
  project?: Project;
  error?: string;
  warnings: string[];
}

const REQUIRED_SCENE_FIELDS: (keyof RawScene)[] = [
  'content_kr',
  'script_kr',
  'image_prompt_en',
  'video_motion_en',
];

export function parseStoryboardJSON(raw: string): ImportResult {
  const warnings: string[] = [];

  let data: RawStoryboard;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: 'JSON 형식이 올바르지 않습니다. 파일을 다시 확인해주세요.', warnings };
  }

  if (!data || typeof data !== 'object') {
    return { error: '루트가 객체(JSON object)가 아닙니다.', warnings };
  }

  const duration = Number(data.duration);
  if (![15, 30, 45, 60].includes(duration)) {
    return {
      error: `duration은 15/30/45/60 중 하나여야 합니다. (현재: ${data.duration ?? '없음'})`,
      warnings,
    };
  }
  const expectedScenes = (duration / 15) * 9;

  const idea = (data.idea || '').trim();
  if (!idea) {
    return { error: 'idea(아이디어 텍스트) 필드는 비어있을 수 없습니다.', warnings };
  }

  const styleValues = Object.values(VisualStyle) as string[];
  let style: VisualStyle;
  if (data.style && styleValues.includes(data.style)) {
    style = data.style as VisualStyle;
  } else {
    if (data.style) warnings.push(`style "${data.style}" 알 수 없음 → Cinematic으로 대체합니다.`);
    style = VisualStyle.CINEMATIC;
  }

  let rawScenes: RawScene[] = [];
  if (Array.isArray(data.units) && data.units.length > 0) {
    rawScenes = data.units.flatMap((u) => (Array.isArray(u.scenes) ? u.scenes : []));
  } else if (Array.isArray(data.scenes)) {
    rawScenes = data.scenes;
  } else {
    return { error: 'units[].scenes[] 또는 scenes[] 배열이 필요합니다.', warnings };
  }

  if (rawScenes.length !== expectedScenes) {
    return {
      error: `${duration}초 스토리보드는 정확히 ${expectedScenes}개의 씬이 필요합니다. (업로드: ${rawScenes.length}개)`,
      warnings,
    };
  }

  const scenes: Scene[] = rawScenes.map((s, idx) => {
    const missing = REQUIRED_SCENE_FIELDS.filter((f) => !s[f]);
    if (missing.length > 0) {
      warnings.push(`씬 ${idx + 1}: 누락 필드 [${missing.join(', ')}] → 빈 값으로 채웁니다.`);
    }
    return {
      id: crypto.randomUUID(),
      order: idx + 1,
      content_kr: s.content_kr || '',
      content_en: '',
      script_kr: s.script_kr || '',
      script_en: s.script_en || '',
      image_prompt_en: s.image_prompt_en || '',
      video_motion_en: s.video_motion_en || 'STATIC',
      video_motion_kr: '',
    };
  });

  const layoutValues = Object.values(StoryboardLayout) as string[];
  let layout: StoryboardLayout;
  if (data.layout && layoutValues.includes(data.layout)) {
    layout = data.layout as StoryboardLayout;
  } else {
    if (data.layout) warnings.push(`layout "${data.layout}" 알 수 없음 → 2x5 기본값 적용.`);
    layout = StoryboardLayout.GRID_2X5;
  }

  const fallbackTitle = idea.substring(0, 20) + (idea.length > 20 ? '...' : '');
  const title = (data.title || fallbackTitle).trim();

  const project: Project = {
    id: crypto.randomUUID(),
    title,
    key_message: data.key_message || undefined,
    duration: duration as AdDuration,
    style,
    idea,
    scenes,
    grid_images: new Array(duration / 15).fill(null),
    global_grid_prompt: data.global_grid_prompt,
    layout,
  };

  return { project, warnings };
}

/* ===================================================================
 *  제작 의뢰 첨부(storyboard.json) 되읽기
 * =================================================================== */

/** 내보낸 프로젝트의 씬. RawScene 보다 필드가 많다(이미지·영상 URL 포함). */
interface RawExportedScene extends RawScene {
  content_en?: string;
  image_prompt_kr?: string;
  video_motion_kr?: string;
  image_url?: string;
  video_url?: string;
  upscale_level?: string | null;
}

/** enum 의 값 목록. 숫자 enum 은 역방향 키가 섞이므로 타입으로 걸러낸다. */
function numericEnumValues<T extends Record<string, unknown>>(e: T): number[] {
  return Object.values(e).filter((v): v is number => typeof v === 'number');
}

/**
 * 제작 의뢰에 첨부된 storyboard.json 을 프로젝트로 되읽는다.
 *
 * parseStoryboardJSON 과 입력이 다르다. 저쪽은 사람이 손으로 쓴 "대본 JSON"
 * (units[] + 15초 단위 규칙)이고, 이쪽은 CommissionModal 이
 * JSON.stringify(project) 로 만든 **완성된 프로젝트 스냅샷**이다. 그래서
 * 씬 이미지·영상 URL, 격자 시트, 비율, 이미지 모델까지 그대로 살린다.
 *
 * 검증은 느슨하게 간다 — 이미 이 앱이 만든 파일이므로 형식 오류보다
 * 필드 누락(구버전 스냅샷)이 훨씬 흔하다. 씬이 하나도 없을 때만 실패로 본다.
 *
 * id 는 프로젝트·씬 모두 새로 발급한다. 원본 id 를 그대로 쓰면 가져온 쪽의
 * 자동 저장이 의뢰자의 행을 upsert 로 덮어쓴다.
 */
export function parseExportedProject(raw: string): ImportResult {
  const warnings: string[] = [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { error: 'JSON 형식이 올바르지 않습니다. 첨부 파일을 다시 확인해 주세요.', warnings };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: '루트가 객체(JSON object)가 아닙니다.', warnings };
  }

  const rawScenes: RawExportedScene[] = Array.isArray(data.scenes)
    ? (data.scenes as RawExportedScene[])
    : Array.isArray(data.units)
      ? (data.units as RawUnit[]).flatMap((u) => (Array.isArray(u.scenes) ? (u.scenes as RawExportedScene[]) : []))
      : [];
  if (rawScenes.length === 0) {
    return { error: '씬이 없는 스토리보드입니다. 첨부 파일을 확인해 주세요.', warnings };
  }

  const scenes: Scene[] = rawScenes.map((s, idx) => ({
    id: crypto.randomUUID(),
    order: idx + 1,
    content_kr: s.content_kr || '',
    content_en: s.content_en || '',
    script_kr: s.script_kr || '',
    script_en: s.script_en || '',
    image_prompt_kr: s.image_prompt_kr || undefined,
    image_prompt_en: s.image_prompt_en || '',
    video_motion_en: s.video_motion_en || 'STATIC',
    video_motion_kr: s.video_motion_kr || '',
    // 이미지·영상은 공개 버킷 URL 이라 그대로 참조한다. 원본이 지워지면 함께 끊긴다.
    image_url: typeof s.image_url === 'string' ? s.image_url : undefined,
    video_url: typeof s.video_url === 'string' ? s.video_url : undefined,
    upscale_level: s.upscale_level === '2K' || s.upscale_level === '4K' ? s.upscale_level : null,
  }));

  const sceneCountValues = numericEnumValues(SceneCount);
  const exportedSceneCount = Number(data.scene_count);
  let sceneCount: SceneCount;
  if (sceneCountValues.includes(exportedSceneCount)) {
    sceneCount = exportedSceneCount as SceneCount;
  } else if (sceneCountValues.includes(scenes.length)) {
    sceneCount = scenes.length as SceneCount;
    warnings.push(`scene_count 가 없어 실제 씬 개수(${scenes.length})로 추정했습니다.`);
  } else {
    sceneCount = SceneCount.CUTS_9;
    warnings.push(`씬 개수(${scenes.length})가 지원 구성과 달라 9컷으로 기록합니다. 격자 화면이 어긋날 수 있습니다.`);
  }

  const exportedDuration = Number(data.duration);
  const duration = (numericEnumValues(AdDuration).includes(exportedDuration)
    ? exportedDuration
    : SCENE_DURATION_MAP[sceneCount]) as AdDuration;

  const styleValues = Object.values(VisualStyle) as string[];
  const style = typeof data.style === 'string' && styleValues.includes(data.style)
    ? (data.style as VisualStyle)
    : VisualStyle.CINEMATIC;
  if (data.style && style !== data.style) warnings.push(`style "${String(data.style)}" 알 수 없음 → Cinematic 으로 대체합니다.`);

  const layoutValues = Object.values(StoryboardLayout) as string[];
  const layout = typeof data.layout === 'string' && layoutValues.includes(data.layout)
    ? (data.layout as StoryboardLayout)
    : StoryboardLayout.GRID_2X5;

  const aspectValues = Object.values(AspectRatio) as string[];
  const aspect_ratio = typeof data.aspect_ratio === 'string' && aspectValues.includes(data.aspect_ratio)
    ? (data.aspect_ratio as AspectRatio)
    : AspectRatio.LANDSCAPE;

  const modelValues = Object.values(ImageModel) as string[];
  const image_model = typeof data.image_model === 'string' && modelValues.includes(data.image_model)
    ? (data.image_model as ImageModel)
    : undefined;

  // 격자 시트는 유닛 수만큼. 스냅샷에 있으면 그대로, 없으면 빈 칸으로 채운다.
  const grid_images: (string | null)[] = Array.isArray(data.grid_images)
    ? (data.grid_images as unknown[]).map((g) => (typeof g === 'string' ? g : null))
    : new Array(getSceneGridUnits(sceneCount)).fill(null);

  const idea = typeof data.idea === 'string' ? data.idea.trim() : '';
  if (!idea) warnings.push('idea(아이디어) 가 비어 있습니다.');
  const exportedTitle = typeof data.title === 'string' ? data.title.trim() : '';
  const title = exportedTitle
    || (idea ? idea.substring(0, 20) + (idea.length > 20 ? '...' : '') : '가져온 의뢰 스토리보드');

  const project: Project = {
    id: crypto.randomUUID(),
    title,
    key_message: typeof data.key_message === 'string' ? data.key_message : undefined,
    duration,
    style,
    idea,
    scenes,
    grid_images,
    global_grid_prompt: typeof data.global_grid_prompt === 'string' ? data.global_grid_prompt : undefined,
    layout,
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : null,
    // 원 제작자는 남긴다 — 대시보드가 "원 제작자" 뱃지로 출처를 보여준다.
    original_creator_id: typeof data.original_creator_id === 'string' ? data.original_creator_id : null,
    aspect_ratio,
    scene_count: sceneCount,
    generation_language: data.generation_language === 'en' || data.generation_language === 'ko'
      ? data.generation_language
      : undefined,
    image_model,
  };

  return { project, warnings };
}
