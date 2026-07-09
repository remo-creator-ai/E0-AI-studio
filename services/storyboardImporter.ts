import { Project, Scene, AdDuration, VisualStyle, StoryboardLayout } from '../types';

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
