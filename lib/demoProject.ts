import { AdDuration, AspectRatio, Project, ProjectStep, SceneCount, StoryboardLayout, VisualStyle } from '../types';

/** Local review fixture, never presented as an AI-generated result. */
export function createDemoProject(en = false): Project {
  const descriptions = en
    ? ['Introduce the product silhouette.', 'Show the label and material.', 'Place the product in its everyday setting.', 'Close with the brand message.']
    : ['제품의 실루엣을 소개합니다.', '라벨과 소재의 디테일을 보여줍니다.', '제품이 사용되는 일상 공간을 보여줍니다.', '브랜드의 핵심 메시지로 마무리합니다.'];
  return {
    id: crypto.randomUUID(),
    title: en ? '[Sample] FORM product story' : '[샘플] FORM 제품 소개',
    key_message: en ? 'A new perspective on everyday essentials.' : '일상의 제품을 새로운 관점으로.',
    idea: en ? 'A prewritten example for reviewing the studio workflow. Not AI generated.' : '제작 흐름을 살펴보기 위한 사전 작성 예시입니다. AI 생성 결과가 아닙니다.',
    duration: AdDuration.S15,
    style: VisualStyle.REALISTIC,
    layout: StoryboardLayout.GRID_1X4,
    aspect_ratio: AspectRatio.LANDSCAPE,
    scene_count: SceneCount.CUTS_4,
    current_stage: ProjectStep.ASSEMBLY,
    thumbnail: '/e0-content.svg',
    grid_images: [],
    scenes: descriptions.map((description, index) => ({
      id: crypto.randomUUID(), order: index + 1,
      content_kr: description, content_en: description,
      script_kr: '', script_en: '', image_prompt_kr: description, image_prompt_en: description,
      video_motion_kr: '느린 카메라 이동 · 샘플', video_motion_en: 'Slow camera movement · sample',
      image_url: '/e0-content.svg',
    })),
  };
}
