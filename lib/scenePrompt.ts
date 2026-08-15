// =============================================================
//  씬 프롬프트 해석 (Korean-only 전환 1단계)
//
//  Scene 은 오랫동안 image_prompt_en(영문) 하나만 들고 있었고, 사용자는 한국어로
//  쓴 뒤 "Auto-Sync" 로 번역해 넣어야 했다. 최신 이미지 모델(Nano Banana 2,
//  Gemini 3 Pro Image, GPT Image 2)은 한국어 프롬프트를 충분히 소화하므로
//  번역 왕복은 뉘앙스만 깎는다.
//
//  전환 전략: image_prompt_kr 을 1급 필드로 추가하되 기존 영문 필드는 남긴다.
//  읽기는 항상 이 헬퍼를 거쳐 kr → en 순으로 폴백하므로, 기존 프로젝트는
//  아무것도 바뀌지 않고 신규 입력만 한국어로 쌓인다.
// =============================================================

import type { Scene } from '../types';

type PromptSource = Pick<Scene, 'image_prompt_kr' | 'image_prompt_en' | 'content_kr'>;

/** 이미지 생성에 실제로 보낼 프롬프트. 한국어 우선, 없으면 영문, 그것도 없으면 씬 설명. */
export function scenePromptForImage(scene: PromptSource): string {
  return (
    scene.image_prompt_kr?.trim() ||
    scene.image_prompt_en?.trim() ||
    scene.content_kr?.trim() ||
    ''
  );
}

/** 편집기 입력창에 보여줄 값과, 그 값이 어느 필드에서 왔는지. */
export function scenePromptField(scene: PromptSource): { value: string; source: 'kr' | 'en' | 'none' } {
  if (scene.image_prompt_kr?.trim()) return { value: scene.image_prompt_kr, source: 'kr' };
  if (scene.image_prompt_en?.trim()) return { value: scene.image_prompt_en, source: 'en' };
  return { value: '', source: 'none' };
}
