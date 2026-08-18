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
// 유일한 예외적 참조: 모델 라우팅. GPT Image 2 는 Google SDK 를 타지 않으므로
// geminiService 가 생성 경로에서 하는 것과 같은 분기를 업스케일에도 둔다.
import { isOpenAIImageModel, upscaleImageOpenAI } from './openaiImageService';
import { ladderFrom, isImageSizeRejection } from './imageSizeLadder';

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
  /**
   * 실제로 성공한 해상도 단계. 요청값과 다를 수 있다 —
   * 모델이 요청 해상도를 거부하면 한 단계 낮춰 재시도하기 때문이다.
   * 호출부는 **이 값으로** 과금하고 upscale_level 을 기록해야 한다.
   * 요청은 4K 인데 결과가 2K 인데도 5cr 을 받으면 그건 그냥 오과금이다.
   */
  appliedSize?: UpscaleTargetSize;
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
    return { ok: true, dataUrl: input.imageUrl, appliedSize: input.targetSize ?? '2K' };
  }

  const targetSize: UpscaleTargetSize = input.targetSize ?? '2K';
  const model = input.model || UPSCALE_MODEL;

  // GPT Image 2 로 만든 프로젝트는 업스케일도 OpenAI 로 가야 한다.
  // (이 분기가 없어서 'gpt-image-2' 가 Gemini 로 가 404 가 났다)
  if (isOpenAIImageModel(model)) {
    try {
      const dataUrl = await upscaleImageOpenAI(
        input.imageUrl,
        buildUpscalePrompt(input.aspect, targetSize),
        input.aspect,
        targetSize,
      );
      // OpenAI 는 픽셀 크기를 직접 지정하므로 요청 해상도가 곧 결과 해상도다.
      return { ok: true, dataUrl, appliedSize: targetSize };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('no_api_key')) return { ok: false, failure: 'no_api_key', message: msg };
      // OpenAI 는 정책 차단을 moderation_blocked / content_policy 로 알려준다.
      if (/moderation|content_policy|safety/i.test(msg)) {
        return { ok: false, failure: 'blocked', message: msg };
      }
      return { ok: false, failure: 'error', message: msg };
    }
  }

  const ai = await proxyClient();
  if (!ai) return { ok: false, failure: 'no_api_key', message: 'no_session' };

  const { mimeType, base64 } = await normalizeImageInput(input.imageUrl);

  // 모델마다 지원하는 imageSize 상한이 다르다. 생성 경로는 예전부터 사다리를
  // 타고 내려갔는데 업스케일만 단일 해상도로 요청해서, 4K 를 지원하지 않는
  // 모델(Nano Banana 2)에서 4K 버튼이 매번 실패했다. 같은 사다리를 쓴다.
  try {
    let lastError: unknown = null;

    // 1K 는 업스케일 등급이 아니다. 거기까지 내려가면 "돈은 받고 해상도는
    // 그대로" 가 되므로 시도 자체를 하지 않고 실패로 알린다.
    const sizes = ladderFrom(model, targetSize).filter((s): s is UpscaleTargetSize => s !== '1K');

    for (const imageSize of sizes) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: buildUpscalePrompt(input.aspect, targetSize) },
            ],
          },
          config: {
            responseModalities: ['Image'],
            imageConfig: { aspectRatio: input.aspect, imageSize },
          },
        });

        const candidate = response.candidates?.[0];
        if (!candidate) return { ok: false, failure: 'error', message: 'no_candidates' };
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          return { ok: false, failure: 'blocked', message: candidate.finishReason };
        }
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData) {
            return { ok: true, dataUrl: `data:image/png;base64,${part.inlineData.data}`, appliedSize: imageSize };
          }
        }
        return { ok: false, failure: 'error', message: 'no_image_data' };
      } catch (e) {
        lastError = e;
        // 해상도 거부만 낮춰서 재시도한다. 차단·쿼터는 낮춰도 결과가 같다.
        if (!isImageSizeRejection(e)) throw e;
        console.warn(`[upscale] imageSize=${imageSize} 거부됨 (${model}). 한 단계 낮춰 재시도합니다.`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('GEMINI_API_KEY') || msg.includes('503')) {
      return { ok: false, failure: 'no_api_key', message: msg };
    }
    return { ok: false, failure: 'error', message: msg };
  }
}
