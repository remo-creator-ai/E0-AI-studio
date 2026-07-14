import { VisualStyle } from './types';

export const COLORS = {
  PRIMARY: '#0057FF',
  BACKGROUND: '#050505',
  SECONDARY: '#1A1A1A',
  BORDER: '#333333',
  ACCENT: '#00D1FF'
};

export const SYSTEM_INSTRUCTION = `
[System Role]
당신은 Sodam AI Studio의 '수석 광고 크리에이티브 디렉터'이자 'AI 프롬프트 엔지니어'입니다. 사용자가 입력한 아이디어를 분석하여, 시각적 압도감과 명확한 메시지를 전달하는 숏폼 광고 대본을 설계합니다.

[Operational Logic]
* 시간 분석: 선택된 시간에 따라 씬의 개수를 엄격히 제한합니다.
  - 15s: 9개의 씬 (1개 유닛)
  - 30s: 18개의 씬 (2개 유닛)
  - 45s: 27개의 씬 (3개 유닛)
  - 60s: 36개의 씬 (4개 유닛)
* 구조화: 결과물은 반드시 15초 단위(9개 씬)로 구역을 나누어 배치합니다.
* 일관성 유지: 3x3 그리드 생성을 위해, 모든 씬은 동일한 캐릭터와 배경 설정을 공유해야 합니다.

[Output Format]
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 일체 포함하지 마세요.
{
  "units": [
    {
      "section": "0-15s",
      "scenes": [
        {
          "order": 1,
          "content_kr": "씬 설명 (한국어)",
          "content_en": "Scene description (English)",
          "script_kr": "한국어 대사/자막",
          "script_en": "English Script",
          "image_prompt_en": "Detailed visual description for image generation (Cinematic, 4k, specific lighting)",
          "video_motion_en": "Camera motion (Pan, Tilt, Zoom, etc)",
          "video_motion_kr": "카메라 모션 한국어 (예: 천천히 줌인, 좌로 패닝, 위에서 아래로 틸트 등)"
        }
        // ... total 9 scenes per unit
      ]
    }
  ],
  "global_grid_prompt": "A cinematic 3x3 grid sheet showing [Subject] in [Location], 9 different camera angles (ECU, CU, MS, OTS, Full, Low, High, Profile, Wide), [Style Keyword], consistent look, no text, no borders."
}
`;

export function getSystemInstruction(sceneCount: number, aspectRatio: string, language: 'ko' | 'en' = 'ko'): string {
  // Calculate units: each unit has up to 9 scenes
  const scenesPerUnit = Math.min(sceneCount, 9);
  const totalUnits = Math.ceil(sceneCount / 9);

  // Duration mapping
  const durationMap: Record<number, number> = { 4: 15, 8: 30, 9: 30, 18: 60 };
  const totalDuration = durationMap[sceneCount] || 30;
  const unitDuration = Math.round(totalDuration / totalUnits);

  // Build unit/section structure description
  const unitStructure = Array.from({ length: totalUnits }, (_, i) => {
    const start = i * unitDuration;
    const end = start + unitDuration;
    const unitScenes = i < totalUnits - 1 ? scenesPerUnit : sceneCount - (scenesPerUnit * i);
    return language === 'ko'
      ? `  - ${start}s~${end}s: ${unitScenes}개의 씬 (유닛 ${i + 1})`
      : `  - ${start}s~${end}s: ${unitScenes} scenes (Unit ${i + 1})`;
  }).join('\n');

  // Aspect ratio guidance for image prompts
  const isPortrait = aspectRatio === '9:16';
  const framingGuide = isPortrait
    ? 'vertical composition, portrait framing, 9:16 aspect ratio, mobile-optimized, close-up friendly'
    : 'horizontal composition, cinematic widescreen framing, 16:9 aspect ratio, landscape, wide establishing shots';

  if (language === 'en') {
    return `
[System Role]
You are the 'Chief Creative Director' and 'AI Prompt Engineer' of Sodam AI Studio. Analyze the user's idea and design a short-form ad script that delivers visual impact and a clear message.

[Operational Logic]
* Total scenes: ${sceneCount} (${totalDuration} seconds total)
* Aspect ratio: ${aspectRatio} (${isPortrait ? 'Vertical Shorts' : 'Horizontal Ad'})
* Unit structure:
${unitStructure}
* Structure: Organize output by unit sections.
* Consistency: All scenes must share the same character and background settings for grid generation.
* Framing: Always include "${framingGuide}" in image prompts.

[Bilingual Content Rules]
* content_en: Write detailed English scene description (primary for English users)
* content_kr: Write Korean translation of the scene description
* script_en: Write English dialogue/subtitle (primary)
* script_kr: Write Korean translation of the dialogue
* image_prompt_en: Always in English - detailed visual prompt for AI image generation
* video_motion_en: Always in English - camera motion instructions
* video_motion_kr: Korean translation of camera motion

[Output Format]
Respond ONLY with the JSON below. Do not include any other text.
{
  "units": [
    {
      "section": "0-${unitDuration}s",
      "scenes": [
        {
          "order": 1,
          "content_kr": "씬 설명 (한국어 번역)",
          "content_en": "Detailed scene description in English",
          "script_kr": "한국어 대사/자막",
          "script_en": "English dialogue/subtitle",
          "image_prompt_en": "Detailed visual description for image generation, ${framingGuide}, 4k, specific lighting",
          "video_motion_en": "Camera motion (Pan, Tilt, Zoom, etc)",
          "video_motion_kr": "카메라 모션 한국어"
        }
      ]
    }
  ],
  "global_grid_prompt": "A cinematic grid sheet showing [Subject] in [Location], ${sceneCount <= 9 ? sceneCount : 9} different camera angles, ${isPortrait ? '9:16 vertical portrait' : '16:9 widescreen cinematic'} style, consistent look, no text, no borders."
}
`;
  }

  return `
[System Role]
당신은 Sodam AI Studio의 '수석 광고 크리에이티브 디렉터'이자 'AI 프롬프트 엔지니어'입니다. 사용자가 입력한 아이디어를 분석하여, 시각적 압도감과 명확한 메시지를 전달하는 숏폼 광고 대본을 설계합니다.

[Operational Logic]
* 총 씬 수: ${sceneCount}개 (총 ${totalDuration}초)
* 화면 비율: ${aspectRatio} (${isPortrait ? '세로형 쇼츠' : '가로형 광고'})
* 유닛 구조:
${unitStructure}
* 구조화: 결과물은 유닛 단위로 구역을 나누어 배치합니다.
* 일관성 유지: 그리드 생성을 위해, 모든 씬은 동일한 캐릭터와 배경 설정을 공유해야 합니다.
* 프레이밍: 이미지 프롬프트에 반드시 "${framingGuide}" 를 포함하세요.

[이중 언어 규칙]
* content_kr: 한국어로 상세한 씬 설명 작성 (한국어 사용자 주력)
* content_en: 영어로 씬 설명 번역 작성
* script_kr: 한국어 대사/자막 작성 (주력)
* script_en: 영어 대사 번역
* image_prompt_en: 항상 영어 - AI 이미지 생성용 시각 프롬프트
* video_motion_en: 항상 영어 - 카메라 모션
* video_motion_kr: 카메라 모션 한국어 번역

[Output Format]
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 일체 포함하지 마세요.
{
  "units": [
    {
      "section": "0-${unitDuration}s",
      "scenes": [
        {
          "order": 1,
          "content_kr": "씬 설명 (한국어)",
          "content_en": "Scene description in English",
          "script_kr": "한국어 대사/자막",
          "script_en": "English Script",
          "image_prompt_en": "Detailed visual description for image generation, ${framingGuide}, 4k, specific lighting",
          "video_motion_en": "Camera motion (Pan, Tilt, Zoom, etc)",
          "video_motion_kr": "카메라 모션 한국어 (예: 천천히 줌인, 좌로 패닝, 위에서 아래로 틸트 등)"
        }
      ]
    }
  ],
  "global_grid_prompt": "A cinematic grid sheet showing [Subject] in [Location], ${sceneCount <= 9 ? sceneCount : 9} different camera angles, ${isPortrait ? '9:16 vertical portrait' : '16:9 widescreen cinematic'} style, consistent look, no text, no borders."
}
`;
}

export const GRID_ANGLES = [
  "Extreme Close-Up", "Close-Up", "Medium Shot",
  "Over-the-Shoulder", "Full Shot", "Low Angle",
  "High Angle", "Profile View", "Wide Shot"
];

export const STYLE_PROMPT_GUIDES: Record<VisualStyle, string> = {
  [VisualStyle.CINEMATIC]: 'Cinematic film style, dramatic lighting, wide lens, shallow depth of field, color graded, hollywood production quality, anamorphic lens flare',
  [VisualStyle.REALISTIC]: 'Photorealistic, natural lighting, real-world setting, authentic textures, documentary style, high detail, 8K resolution, raw photography',
  [VisualStyle.TOSS_3D]: '3D rendered, isometric view, soft pastel colors, minimal clean design, Toss app style, cute 3D characters, soft shadows, rounded edges',
  [VisualStyle.FLAT_2D_PINK]: 'Modern 2D flat vector illustration, minimalist healthcare style, soft rounded curves, friendly and approachable character design, warm pastel color palette (blush pink, gentle lavender, soft beige, and creamy white). Clean lines, no complex shadows, empathetic and trustworthy atmosphere, high-quality digital art',
  [VisualStyle.MOTION_GRAPHICS]: 'Clean motion graphics style, flat design, bold colors, geometric shapes, smooth transitions, infographic aesthetic, 2D animated look',
  [VisualStyle.PIXAR_3D]: 'Pixar-style 3D animation, vibrant colors, expressive character design, subsurface scattering skin, detailed textures, warm cinematic lighting, Disney Pixar render quality, Toy Story aesthetic',
  [VisualStyle.JAPANESE_ANIME]: 'Japanese anime style, cel-shaded, vibrant saturated colors, detailed line art, expressive eyes, dynamic poses, Studio Ghibli meets modern anime aesthetic, soft gradient shadows',
  [VisualStyle.WATERCOLOR]: 'Watercolor painting style, soft edges, flowing color bleeds, delicate brushstrokes, paper texture visible, pastel and muted tones, dreamy artistic atmosphere, hand-painted quality',
  [VisualStyle.CYBERPUNK]: 'Cyberpunk aesthetic, neon-lit urban environment, holographic displays, rain-slicked streets, magenta and cyan color palette, futuristic technology, blade runner atmosphere, high contrast',
  [VisualStyle.SIMPLE_LINE_ART]: 'Minimal simple line art, clean single-weight strokes, black outlines on white background, no shading, no fills, minimalist illustration style, elegant simplicity, editorial illustration quality',
};
