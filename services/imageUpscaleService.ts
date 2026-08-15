// =============================================================
//  이미지 업스케일 서비스 (Option A · Gemini 재생성 기반)
//
//  스토리보드 씬 이미지가 저해상도(예: 512px 정사각)일 때 Kling I2V 가
//  "Image pixel is invalid" 로 거부한다. 이 서비스는 Gemini 3.1 Flash Image
//  를 사용해 원본과 시각적으로 동일하지만 해상도만 높인 이미지를 얻는다.
//
//  핵심: 재생성이 아닌 "무손실 업스케일" 톤으로 프롬프트 설계.
//        재해석·창작·색 변경·구도 변경을 명시적으로 금지해 원본 정체성을
//        유지한다. Gemini 는 이런 지시를 잘 따르는 편이지만 100% 보장은
//        불가하므로, 사용자가 결과를 눈으로 비교할 수 있는 UI 를 붙이는
//        것이 실전 대응.
//
//  격리 원칙: imageStudioService(단건 이미지) 나 geminiService(씬 재생성)
//  와 별도 경로. 서로 참조하지 않는다.
// =============================================================

import { MOCK_MODE } from '../lib/mockAuth';
import { proxyClient } from '../lib/aiProxy';
import { normalizeImageInput } from './imageUtils';
import { DEFAULT_IMAGE_MODEL, UPSCALE_CREDIT_COST } from '../types';

// ---------- 해상도 ----------
export type UpscaleTargetSize = '2K' | '4K';

// ---------- 크레딧 ----------
// 2K 3cr / 4K 5cr (docs/CREDIT_PRICING_SPEC.md §3-2 확정값).
// 배치는 서비스 레이어가 아닌 호출부에서 반복 호출.
export function imageUpscaleCost(targetSize: UpscaleTargetSize = '2K'): number {
  return UPSCALE_CREDIT_COST[targetSize] ?? UPSCALE_CREDIT_COST['2K'];
}
/** @deprecated imageUpscaleCost(targetSize) 를 쓸 것. 2K 단가와 같다. */
export const IMAGE_UPSCALE_COST = UPSCALE_CREDIT_COST['2K'];

// ---------- 종횡비 힌트 ----------
export type UpscaleAspect = '16:9' | '9:16' | '1:1';
const ASPECT_TARGET_SIZE: Record<UpscaleAspect, string> = {
  '16:9': '1280x720 landscape (16:9)',
  '9:16': '720x1280 portrait (9:16)',
  '1:1':  '1024x1024 square (1:1)',
};

// 기본 모델은 types.DEFAULT_IMAGE_MODEL 단일 정의를 따른다. 호출부가 프로젝트에
// 기억된 모델(project.image_model)을 넘기면 그 모델로 업스케일한다 — 생성과 업스케일이
// 다른 모델이면 같은 컷인데 그림체가 미묘하게 갈린다.
const UPSCALE_MODEL = DEFAULT_IMAGE_MODEL;

export type UpscaleFailure =
  | 'no_api_key'
  | 'blocked'
  | 'error';

export interface UpscaleResult {
  ok: boolean;
  /** 성공 시 data:image/png;base64,... */
  dataUrl?: string;
  failure?: UpscaleFailure;
  message?: string;
}

export interface UpscaleInput {
  imageUrl: string;
  /** ⚠️ 프로젝트 비율이 아니라 **원본 이미지에서 감지한** 비율을 넘길 것.
   *  프로젝트 값을 넘기면 원본과 다를 때 그림이 잘리거나 늘어난다
   *  (videoStudioService.detectAspectFromImage 사용). */
  aspect: UpscaleAspect;
  /** 기본 2K. 4K 는 5cr. */
  targetSize?: UpscaleTargetSize;
  /** 기본 DEFAULT_IMAGE_MODEL. 보통 project.image_model 을 넘긴다. */
  model?: string;
}

/**
 * 재생성이 아닌 "무손실 업스케일" 을 명시적으로 요구하는 프롬프트.
 *
 * 왜 이렇게 장황한가?
 *   Gemini 는 짧은 지시 ("upscale this") 만 주면 재해석의 여지를 크게 잡는다.
 *   특히 사람 얼굴·의상 세부·소품 위치가 미묘하게 바뀐다. 반드시 유지해야 할
 *   축(정체성/구도/조명/스타일/텍스트)을 하나씩 열거해 안전하게 잠근다.
 *   반대로 "개선해도 되는 축(선명도/디테일/노이즈)" 도 명시해서, "왜 아무것도
 *   바꾸지 말라고 하면서 뭘 시키는 거지?" 하는 혼란을 없앤다.
 *
 * 실전 팁: 아래 문구를 한국어로 번역해 넣지 말 것. Gemini 는 영어 인스트럭션에
 *          더 안정적으로 반응한다.
 */
function buildUpscalePrompt(aspect: UpscaleAspect, size: UpscaleTargetSize): string {
  const targetSize = `${ASPECT_TARGET_SIZE[aspect]} at ${size} resolution`;
  return `CRITICAL TASK: Perform a LOSSLESS UPSCALE of the reference image.
This is NOT a redraw, NOT a reinterpretation, NOT a stylistic remake.
The output must be visually identical to the reference — same photograph/artwork, just at higher resolution.

═══ MUST PRESERVE (100% identical) ═══
• SUBJECT: every character's exact face, features, age, expression, pose, hair, clothing,
  jewelry, and accessories — the same specific person or object, not a lookalike
• COMPOSITION: same framing, same crop, same angles, same perspective, same depth
• LIGHTING: same direction, same intensity, same color temperature, same shadows and highlights
• COLORS: same exact palette, same saturation, same white balance — no color grading shift
• BACKGROUND: every environment element (props, walls, sky, texture) in the exact same
  position and appearance
• STYLE: same rendering style (photorealistic vs illustration vs 3D), same medium, same mood
• TEXT & GRAPHICS: any letters, numbers, logos, or symbols — identical content, font, and placement

═══ ONLY IMPROVE (mechanical quality) ═══
• Sharpness: crisp edges without motion blur (unless motion blur exists in the reference)
• Detail: fine textures (skin pores, fabric weave, surface detail) become clearer
• Cleanliness: remove JPEG artifacts, compression banding, sensor noise, upscaling artifacts
• Resolution: reproduce the same visual content at ${targetSize}, cleanly rasterized

═══ FORBIDDEN ═══
✗ Do NOT change poses, expressions, or subject placement
✗ Do NOT alter clothing, colors, hair, or accessories
✗ Do NOT add or remove any element from the scene
✗ Do NOT change the artistic style or medium
✗ Do NOT apply new color grading or filters
✗ Do NOT add text, watermarks, captions, or signatures
✗ Do NOT crop or reframe the image

Think of it as: "same photograph re-scanned at higher DPI" — every pixel corresponds to
the same content, just represented with more information. Not "similar image, better quality".

Return only the upscaled image with no text overlays.`;
}

export async function upscaleSceneImage(input: UpscaleInput): Promise<UpscaleResult> {
  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1500));
    // MOCK: 원본을 그대로 돌려줌 (UI 흐름만 검증). 실제 해상도 변화 없음.
    return { ok: true, dataUrl: input.imageUrl };
  }

  const ai = await proxyClient();
  if (!ai) return { ok: false, failure: 'no_api_key', message: 'no_session' };

  const { mimeType, base64 } = await normalizeImageInput(input.imageUrl);
  const targetSize: UpscaleTargetSize = input.targetSize ?? '2K';

  try {
    const response = await ai.models.generateContent({
      model: input.model || UPSCALE_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: buildUpscalePrompt(input.aspect, targetSize) },
        ],
      },
      config: {
        responseModalities: ['Image'],
        imageConfig: { aspectRatio: input.aspect, imageSize: targetSize },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) return { ok: false, failure: 'error', message: 'no_candidates' };
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      return { ok: false, failure: 'blocked', message: candidate.finishReason };
    }
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return { ok: true, dataUrl: `data:image/png;base64,${part.inlineData.data}` };
      }
    }
    return { ok: false, failure: 'error', message: 'no_image_data' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('GEMINI_API_KEY') || msg.includes('503')) {
      return { ok: false, failure: 'no_api_key', message: msg };
    }
    return { ok: false, failure: 'error', message: msg };
  }
}
