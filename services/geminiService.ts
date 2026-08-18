
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { SYSTEM_INSTRUCTION, getSystemInstruction } from "../constants";
import { AdDuration, AspectRatio, SceneCount, CategorizedRefImage, REFERENCE_CATEGORY_INFO } from "../types";
import { generateKlingVideo } from './klingService';
import { normalizeImageInput } from './imageUtils';
import { proxyClient, proxyFetch } from '../lib/aiProxy';
import {
  isOpenAIImageModel,
  generateGridImageOpenAI,
  generateSingleImageOpenAI,
} from './openaiImageService';

/**
 * 과거 admin_config 에서 읽은 Gemini 키를 세션 캐시하던 흔적.
 * 이제 키는 브라우저에 오지 않으므로 캐시할 것이 없다.
 * authStore 가 로그인/로그아웃 시 호출하므로 시그니처만 유지한다.
 */
export function clearApiKeyCache() {
  /* no-op: 키는 서버(ai-proxy Function Secret)에만 존재한다 */
}

/**
 * 프록시를 경유하는 클라이언트를 만든다.
 * 프롬프트·모델·응답 파싱은 이 함수 아래로 전혀 바뀌지 않는다 — 전송 경로만 다르다.
 */
const getAI = async () => {
  const ai = await proxyClient();
  if (!ai) {
    throw new Error('로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.');
  }
  return ai;
};

/**
 * Retries an async operation with exponential backoff on 429 errors.
 */
async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    const err = error as { status?: number; code?: number; message?: string };
    const isRateLimit = err?.status === 429 || err?.code === 429 ||
                        err?.message?.includes('429') || err?.message?.includes('quota') ||
                        err?.message?.includes('RESOURCE_EXHAUSTED');

    if (retries > 0 && isRateLimit) {
      let waitTime = delay;
      // Try to parse wait time from error message (e.g., "retry in 50.8s")
      const match = err?.message?.match(/retry in (\d+(\.\d+)?)s/);
      if (match) {
        waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 2000; // Add 2s buffer
      }

      console.warn(`Quota exceeded. Retrying in ${waitTime/1000}s... (Attempts left: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return withRetry(operation, retries - 1, delay * 2); // Fallback to exponential backoff if regex fails or for next attempt
    }
    throw error;
  }
}

/**
 * 모델 응답에서 JSON 본문만 떼어낸다.
 *
 * responseSchema 를 태우면 코드펜스가 붙을 일이 사실상 없지만,
 * 스키마를 못 붙이는 경로(모델 교체 등)를 위해 방어선은 남겨둔다.
 * 빈 응답을 예전처럼 '{}' 로 눙치지는 않는다 — 파싱에 "성공" 해 버려서
 * units 없는 빈 객체가 조용히 흘러가는 게 더 나쁜 실패였다.
 */
function extractJson(raw: string, open: '{' | '[', close: '}' | ']'): string {
  let text = (raw ?? '').trim();
  if (!text) throw new Error('모델이 빈 응답을 반환했습니다.');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  const first = text.indexOf(open);
  const last = text.lastIndexOf(close);
  if (first !== -1 && last > first) text = text.substring(first, last + 1);
  return text;
}

function parseScriptJson(raw: string) {
  return JSON.parse(extractJson(raw, '{', '}'));
}

/**
 * 정상 종료(STOP)가 아닌 종료 사유를 돌려준다.
 *
 * MAX_TOKENS 로 잘린 응답은 JSON 이 반쪽이라 파싱이 반드시 실패하는데,
 * 같은 요청을 재생성해도 길이는 그대로라 또 잘린다. 즉 재시도 대상이 아니라
 * 진단 대상이다. 확률적 실패(이스케이프 깨짐)와 반드시 구분해야 한다.
 */
function abnormalFinishReason(response: { candidates?: Array<{ finishReason?: string }> }): string | undefined {
  const reason = response.candidates?.[0]?.finishReason;
  return reason && reason !== 'STOP' ? reason : undefined;
}

/** 종료 사유를 사용자가 다음 행동을 알 수 있는 한국어 문구로 바꾼다. */
function finishReasonMessage(reason: string): string {
  if (reason === 'MAX_TOKENS') {
    return '대본이 너무 길어 응답이 중간에 잘렸습니다. 씬 수를 줄이거나 아이디어를 짧게 정리한 뒤 다시 시도해 주세요.';
  }
  return `대본 생성이 중단되었습니다 (사유: ${reason}). 아이디어에 민감한 표현이 있는지 확인한 뒤 다시 시도해 주세요.`;
}

/** 씬 하나의 스키마. 필드 이름은 constants.ts 의 [Output Format] 예시와 같아야 한다. */
const SCENE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    order: { type: Type.INTEGER, description: '씬 순번 (1부터)' },
    content_kr: { type: Type.STRING },
    content_en: { type: Type.STRING },
    script_kr: { type: Type.STRING },
    script_en: { type: Type.STRING },
    image_prompt_kr: { type: Type.STRING },
    image_prompt_en: { type: Type.STRING },
    video_motion_en: { type: Type.STRING },
    video_motion_kr: { type: Type.STRING },
  },
  required: [
    'order', 'content_kr', 'content_en', 'script_kr', 'script_en',
    'image_prompt_kr', 'image_prompt_en', 'video_motion_en', 'video_motion_kr',
  ],
  propertyOrdering: [
    'order', 'content_kr', 'content_en', 'script_kr', 'script_en',
    'image_prompt_kr', 'image_prompt_en', 'video_motion_en', 'video_motion_kr',
  ],
};

/**
 * 대본 응답 스키마.
 *
 * responseMimeType 만으로는 "JSON 처럼 써줘" 라는 힌트에 그친다. 그래서 대사 안에
 * 따옴표가 섞이면 이스케이프가 깨진 문자열이 그대로 나왔고 파싱이 확률적으로 실패했다.
 * responseSchema 를 함께 주면 디코딩 단계에서 문법이 강제되므로 이 실패 모드가
 * 구조적으로 사라진다. 재시도는 일시 오류용 백스톱으로만 남긴다.
 */
const AD_SCRIPT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    units: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING, description: '예: 0-15s' },
          scenes: { type: Type.ARRAY, items: SCENE_SCHEMA },
        },
        required: ['section', 'scenes'],
        propertyOrdering: ['section', 'scenes'],
      },
    },
    global_grid_prompt: { type: Type.STRING },
  },
  required: ['units', 'global_grid_prompt'],
  propertyOrdering: ['units', 'global_grid_prompt'],
};

/**
 * 대본 출력 상한.
 *
 * 36컷 × 9필드(한/영 병기 + 이미지 프롬프트)면 1만 토큰을 훌쩍 넘는다.
 * 기본값에 기대면 어디서 잘리는지 알 수 없으므로 넉넉히 명시한다.
 * (gemini-2.5-flash 의 출력 상한보다 충분히 낮게 잡아 값 자체가 거부되지 않게 한다)
 */
const MAX_SCRIPT_OUTPUT_TOKENS = 32768;

/** 이미지 기반 씬 보정 응답 스키마. 네 필드 모두 문자열이다. */
const REFINED_SCENE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    content_kr: { type: Type.STRING },
    content_en: { type: Type.STRING },
    script_kr: { type: Type.STRING },
    script_en: { type: Type.STRING },
  },
  required: ['content_kr', 'content_en', 'script_kr', 'script_en'],
  propertyOrdering: ['content_kr', 'content_en', 'script_kr', 'script_en'],
};

/** 전체 스토리 보정 응답 스키마. 씬 순서를 그대로 유지한 배열이다. */
const REFINED_STORY_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: REFINED_SCENE_SCHEMA,
};

export async function generateAdScript(idea: string, duration: AdDuration, sceneCount?: number, aspectRatio?: string, language: 'ko' | 'en' = 'ko') {
  const ai = await getAI();
  const prompt = `Idea: ${idea}\nDuration: ${duration} seconds. Generate the full script in JSON format according to the system instruction.`;
  const config = {
    systemInstruction: sceneCount && aspectRatio ? getSystemInstruction(sceneCount, aspectRatio, language) : SYSTEM_INSTRUCTION,
    responseMimeType: "application/json",
    responseSchema: AD_SCRIPT_SCHEMA,
    maxOutputTokens: MAX_SCRIPT_OUTPUT_TOKENS,
  };

  // 스키마로 문법이 강제되므로 파싱 실패는 이제 예외적이다.
  // 그래도 일시 오류는 남으니 1회 재시도는 백스톱으로 유지한다.
  const MAX_ATTEMPTS = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config,
    });

    // 잘림·차단은 재생성해도 같은 결과다. 재시도하지 않고 바로 알린다.
    const abnormal = abnormalFinishReason(response);
    if (abnormal) throw new Error(finishReasonMessage(abnormal));

    try {
      const parsed = parseScriptJson(response.text || '');
      if (!parsed?.units?.length) throw new Error('units 가 비어 있습니다.');
      return parsed;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Failed to parse script JSON (attempt ${attempt}/${MAX_ATTEMPTS}), retrying...`, e);
      } else {
        console.error("Failed to parse script JSON", e);
      }
    }
  }

  // 예전에는 null 을 돌려줬고 호출부가 그것을 조용히 무시해서
  // "눌러도 아무 일이 없는" 화면이 됐다. 실패는 반드시 사용자에게 보이도록 던진다.
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`대본 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요. (${detail})`);
}

export async function generate3x3GridImage(prompt: string, referenceImagesBase64?: string[], aspectRatio?: string, imageModel?: string, categorizedRefs?: CategorizedRefImage[]) {
  // GPT Image 2 는 Google SDK 를 타지 않는다. 프록시의 /openai 라우트로 우회.
  // 반환 계약(data URL)이 같아 호출부는 바뀌지 않는다.
  if (isOpenAIImageModel(imageModel)) {
    const refs = [...(referenceImagesBase64 ?? []), ...((categorizedRefs ?? []).map(r => r.image))];
    return generateGridImageOpenAI(prompt, refs, aspectRatio);
  }

  const ai = await getAI();
  const imageParts = await Promise.all((referenceImagesBase64 || []).map(async (imgBase64) => {
    const { mimeType, base64: base64Data } = await normalizeImageInput(imgBase64);
    return {
      inlineData: {
        mimeType,
        data: base64Data
      }
    };
  }));

  // Build categorized reference parts if provided
  const categorizedParts = await Promise.all((categorizedRefs || []).map(async (ref) => {
    const { mimeType, base64: base64Data } = await normalizeImageInput(ref.image);
    return {
      inlineData: {
        mimeType,
        data: base64Data
      }
    };
  }));

  const categorizedInstruction = (categorizedRefs && categorizedRefs.length > 0)
    ? categorizedRefs.map((ref, i) => {
        const info = REFERENCE_CATEGORY_INFO[ref.category];
        return `REFERENCE IMAGE ${i + 1} (${info.label}): ${info.promptInstruction}`;
      }).join('\n')
    : '';

  // Explicit instruction to follow reference images if they exist
  const styleInstruction = (categorizedRefs && categorizedRefs.length > 0)
    ? `REFERENCE INSTRUCTION: Carefully analyze all attached reference images with their specific roles:\n${categorizedInstruction}\nUse them as the absolute source of truth for the visual style, character appearance, lighting environment, and color palette. Ensure the generated grid matches these references perfectly.`
    : (referenceImagesBase64 && referenceImagesBase64.length > 0)
      ? "REFERENCE INSTRUCTION: Carefully analyze all attached reference images. Use them as the absolute source of truth for the visual style, character appearance, lighting environment, and color palette. Ensure the generated grid matches these references perfectly."
      : "";

  const model = imageModel || 'gemini-3-pro-image-preview';

  return withRetry(async () => {
    // 시트 1장에 9컷이 들어가므로 컷 1개는 시트 픽셀의 1/9 이다. imageSize 를
    // 생략하면 기본 1K 라서 컷당 350px 안팎으로 떨어지고, 그 저해상도 컷이
    // 그대로 Kling 시작 프레임이 되어 영상 품질까지 끌어내린다.
    // 모델별 최대 지원 해상도가 달라 실패하면 한 단계씩 낮춰 재시도한다.
    let lastError: unknown;

    for (const imageSize of IMAGE_SIZE_LADDER[model] ?? DEFAULT_IMAGE_SIZE_LADDER) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              ...imageParts,
              ...categorizedParts,
              // "cinematic, professional studio lighting" 은 광고 시트 톤을 유발해 모델이
              // 하단에 브랜드 캡션("○○ AI Studio | 상상을 현실로." 같은)을 환각으로 그려 넣는
              // 원인이 된다. 품질 신호는 유지하되 광고 어휘는 제거한다.
              { text: `${styleInstruction}\n\nPROMPT: ${prompt}. High quality, 4k resolution, detailed textures, natural lighting. No text or captions of any kind on the image.` }
            ],
          },
          config: {
            responseModalities: ["Image"],
            imageConfig: {
              aspectRatio: (aspectRatio || "16:9") as "16:9" | "9:16",
              imageSize,
            }
          }
        });

        // Error handling for blocked content
        const candidate = response.candidates?.[0];
        if (!candidate) {
           throw new Error("Generation failed: No candidates returned.");
        }
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
           throw new Error(`Generation blocked by safety settings. Reason: ${candidate.finishReason}`);
        }

        for (const part of candidate.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data found in response.");
      } catch (e) {
        lastError = e;
        // 해상도 때문에 거부된 경우에만 낮춰서 재시도한다. 안전성 차단·쿼터
        // 초과 등은 낮춰도 결과가 같으므로 즉시 던져 withRetry 판단에 맡긴다.
        if (!isImageSizeRejection(e)) throw e;
        console.warn(`[grid] imageSize=${imageSize} 거부됨 (${model}). 한 단계 낮춰 재시도합니다.`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  });
}

/**
 * 모델별 시도 해상도 순서 (높은 것 → 낮은 것).
 *
 * 4K 시트는 3×3 기준 컷당 1280x720 으로 Kling std 입력과 정확히 맞는다.
 * 다만 preview 모델의 지원 여부가 공식 문서에 명시돼 있지 않아, 검증된
 * 모델만 4K 로 시작하고 나머지는 2K 부터 시도한 뒤 실패 시 내려간다.
 * (gemini-3-pro-image-preview 는 upscaleImage 에서 4K 실동작이 확인됨)
 */
const IMAGE_SIZE_LADDER: Record<string, string[]> = {
  'gemini-3-pro-image-preview': ['4K', '2K', '1K'],
  'gemini-3.1-flash-image-preview': ['2K', '1K'],
};
const DEFAULT_IMAGE_SIZE_LADDER = ['2K', '1K'];

/** 해상도 파라미터가 거부된 응답인지 판별. 다른 실패와 섞이면 안 된다. */
function isImageSizeRejection(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const looksLikeBadRequest = msg.includes('400') || msg.includes('invalid') || msg.includes('not supported');
  return looksLikeBadRequest && (msg.includes('imagesize') || msg.includes('image_size') || msg.includes('resolution') || msg.includes('size'));
}

/** generateSingleImage 의 텍스트 파트를 만든다 (Gemini·OpenAI 공용). */
function buildSingleImageInstruction(args: {
  prompt: string;
  styleGuide?: string;
  hasRefs: boolean;
  refCount: number;
  editInstruction?: string;
}): string {
  const { prompt, styleGuide, hasRefs, refCount, editInstruction } = args;

  if (editInstruction) {
    // 편집 모드 — IMAGE 1 이 원본. 바꿔도 되는 축을 지시문 하나로 좁힌다.
    const extraRefs = refCount > 1
      ? `\nIMAGE 2${refCount > 2 ? `-${refCount}` : ''}: style references ONLY. Do not copy their content, subjects, or composition.`
      : '';
    return `IMAGE EDIT TASK — this is an edit of an existing image, NOT a new illustration.

IMAGE 1 is the BASE image. Reproduce IMAGE 1 and change ONLY what the edit instruction below asks for.${extraRefs}

═══ EDIT INSTRUCTION (the only thing you may change) ═══
${editInstruction}

═══ MUST PRESERVE from IMAGE 1 ═══
• The same specific person/subject — face, features, age, hair, body, clothing (unless the edit says otherwise)
• Framing, crop, camera angle, perspective, and subject placement
• Lighting direction, intensity, and color temperature
• Color palette and white balance
• Background elements and their positions
• Rendering style and medium (photo vs illustration vs 3D)

═══ FORBIDDEN ═══
✗ Do NOT redraw the scene from scratch
✗ Do NOT reframe, re-crop, or change the aspect of the composition
✗ Do NOT add text, watermarks, captions, or signatures

Scene context (background information only — do not use it to redraw): ${prompt}

Return only the edited image.`;
  }

  if (hasRefs) {
    // 생성 모드 + 레퍼런스 — 레퍼런스가 스타일의 진실원천. 스타일 가이드는 붙이지 않는다.
    return `REFERENCE INSTRUCTION: Use the attached reference images as the source of truth for visual style, atmosphere, character appearance, lighting, and color palette. Match them closely.

PROMPT: ${prompt}

Return only the image, with no text overlays.`;
  }

  // 생성 모드 + 레퍼런스 없음 — 프로젝트 스타일 가이드를 붙인다.
  const style = styleGuide?.trim() ? `\n\nSTYLE: ${styleGuide.trim()}` : '';
  return `PROMPT: ${prompt}${style}

Return only the image, with no text overlays.`;
}

export interface GenerateSingleImageInput {
  /** 씬 프롬프트. 한국어여도 된다 (모델이 충분히 소화). */
  prompt: string;
  /** 레퍼런스 이미지들. editInstruction 이 있으면 [0] 이 베이스 이미지다. */
  references?: string[];
  aspectRatio?: string;
  model?: string;
  /** 프로젝트 비주얼 스타일 가이드 (constants.STYLE_PROMPT_GUIDES 값).
   *  레퍼런스가 없을 때만 붙인다 — 레퍼런스가 있으면 그쪽이 스타일의 진실원천이다. */
  styleGuide?: string;
  /** 있으면 "처음부터 다시 그리기" 가 아니라 "베이스 이미지 편집" 으로 동작한다. */
  editInstruction?: string;
  /** editInstruction 과 함께 쓸 때 references[0] 이 편집 대상 원본인지 여부. */
  baseImageIsFirstReference?: boolean;
}

/**
 * 씬 이미지 1장 생성 / 편집.
 *
 * 두 가지 모드가 있고, 이 구분이 핵심이다.
 *
 *  1) 생성 모드 (editInstruction 없음)
 *     프롬프트로 새로 그린다. 레퍼런스는 스타일 참조.
 *
 *  2) 편집 모드 (editInstruction 있음 + baseImageIsFirstReference)
 *     IMAGE 1 을 그대로 두고 지시된 것만 바꾼다. 예전에는 이 구분이 없어서
 *     "배경만 어둡게" 같은 사소한 수정에도 원본 프롬프트로 전체를 다시 그렸고,
 *     그래서 인물·구도가 통째로 바뀌어 "레퍼런스를 못 따라간다" 는 피드백이 나왔다.
 *
 * 하드코딩 스타일 접미사("Cinematic, professional photography, 4k")는 제거했다.
 * 프로젝트 스타일이 일러스트·3D·애니인데도 사진 스타일을 강요해 레퍼런스와 싸웠다.
 */
export async function generateSingleImage(input: GenerateSingleImageInput) {
  const { prompt, references, aspectRatio, model: imageModel, styleGuide, editInstruction } = input;
  const hasRefs = !!references && references.length > 0;
  const isEdit = !!editInstruction?.trim() && !!input.baseImageIsFirstReference && hasRefs;

  const instruction = buildSingleImageInstruction({
    prompt,
    styleGuide,
    hasRefs,
    refCount: references?.length ?? 0,
    editInstruction: isEdit ? editInstruction!.trim() : undefined,
  });

  if (isOpenAIImageModel(imageModel)) {
    return generateSingleImageOpenAI(instruction, references, aspectRatio);
  }

  const ai = await getAI();
  const model = imageModel || 'gemini-3-pro-image-preview';
  const imageParts = await Promise.all((references || []).map(async (imgBase64) => {
    const { mimeType, base64: base64Data } = await normalizeImageInput(imgBase64);
    return {
      inlineData: {
        mimeType,
        data: base64Data
      }
    };
  }));

  return withRetry(async () => {
    // imageSize 를 생략하면 기본 1K 라서, 재생성한 컷만 시트에서 자른 컷(2K/4K 시트
    // 기준)보다 흐릿해지고 Kling 시작 프레임 품질까지 떨어졌다. 그래서 별도로
    // 업스케일을 한 번 더 돌려야 했는데(=크레딧 2배), 애초에 목표 해상도로 뽑으면
    // 호출 1회로 끝난다. 모델이 거부하면 시트와 같은 방식으로 한 단계씩 낮춘다.
    let lastError: unknown;

    for (const imageSize of IMAGE_SIZE_LADDER[model] ?? DEFAULT_IMAGE_SIZE_LADDER) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              ...imageParts,
              { text: instruction }
            ]
          },
          config: {
            responseModalities: ["Image"],
            imageConfig: {
              aspectRatio: (aspectRatio || "16:9") as "16:9" | "9:16",
              imageSize,
            }
          }
        });

        const candidate = response.candidates?.[0];
        if (!candidate) {
           throw new Error("Generation failed: No candidates returned.");
        }
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
           throw new Error(`Generation blocked by safety settings. Reason: ${candidate.finishReason}`);
        }

        for (const part of candidate.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        throw new Error("No image data found in response.");
      } catch (e) {
        lastError = e;
        // 해상도 거부일 때만 낮춰 재시도. 안전성 차단·쿼터는 낮춰도 같으므로 즉시 던진다.
        if (!isImageSizeRejection(e)) throw e;
        console.warn(`[single] imageSize=${imageSize} 거부됨 (${model}). 한 단계 낮춰 재시도합니다.`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  });
}

// upscaleImage 는 services/imageUpscaleService.upscaleSceneImage 로 통합됐다.
//
// 이 파일에 있던 구현은 프롬프트가 3줄뿐이라 인물·구도가 미묘하게 재해석됐고,
// aspectRatio 를 "프로젝트 값" 으로 강제해 원본 비율과 다르면 그림이 잘렸다.
// imageUpscaleService 쪽은 정체성·구도·조명·색·텍스트를 축별로 잠그는 프롬프트를
// 쓰고, 호출부가 detectAspectFromImage 로 감지한 실제 비율을 넘긴다.

/**
 * 이미지를 분석하여 씬의 대사/설명을 보정합니다.
 */
export async function refineSceneFromImage(
  imageBase64: string,
  currentContentKr: string,
  currentScriptKr: string,
  language: 'ko' | 'en' = 'ko'
): Promise<{ content_kr: string; content_en: string; script_kr: string; script_en: string } | null> {
  const ai = await getAI();
  const { mimeType, base64: base64Data } = await normalizeImageInput(imageBase64);

  const prompt = language === 'ko'
    ? `이 이미지를 분석하고, 아래 현재 씬 설명과 대사를 이미지에 맞게 개선해주세요.
더 감성적이고, 이미지의 분위기/조명/구도를 반영하여 메시지 전달력을 높여주세요.

현재 씬 설명: ${currentContentKr}
현재 대사: ${currentScriptKr}

반드시 아래 JSON만 응답하세요:
{"content_kr":"개선된 씬 설명 한글","content_en":"Improved scene description English","script_kr":"개선된 대사 한글","script_en":"Improved script English"}`
    : `Analyze this image and improve the scene description and script to better match the visual mood, lighting, and composition. Make the message more impactful and emotionally resonant.

Current description: ${currentContentKr}
Current script: ${currentScriptKr}

Respond ONLY with this JSON:
{"content_kr":"Improved Korean description","content_en":"Improved English description","script_kr":"Improved Korean script","script_en":"Improved English script"}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: REFINED_SCENE_SCHEMA,
      }
    });

    const abnormal = abnormalFinishReason(response);
    if (abnormal) throw new Error(finishReasonMessage(abnormal));

    return JSON.parse(extractJson(response.text || '', '{', '}'));
  } catch (e) {
    console.error("Failed to refine scene from image", e);
    return null;
  }
}

/** 전체 스토리의 이미지를 분석하여 씬 설명/대사를 일괄 보정합니다. */
export async function refineFullStory(
  scenes: Array<{ image_url: string; content_kr: string; script_kr: string }>,
  language: 'ko' | 'en' = 'ko'
): Promise<Array<{ content_kr: string; content_en: string; script_kr: string; script_en: string }> | null> {
  const ai = await getAI();

  const imageParts = await Promise.all(scenes.map(async (scene) => {
    const { mimeType, base64: base64Data } = await normalizeImageInput(scene.image_url);
    return {
      inlineData: {
        mimeType,
        data: base64Data
      }
    };
  }));

  const sceneSummaries = scenes.map((scene, i) =>
    `CUT ${i + 1}:\n  설명: ${scene.content_kr}\n  대사: ${scene.script_kr}`
  ).join('\n\n');

  const prompt = language === 'ko'
    ? `아래는 광고 스토리보드의 전체 씬입니다. 각 이미지를 순서대로 분석하고, 전체 스토리 흐름을 고려하여 모든 씬의 설명과 대사를 보정해주세요.\n더 감성적이고, 이미지의 분위기를 반영하여 전체적인 메시지 전달력과 스토리 연결성을 높여주세요.\n\n${sceneSummaries}\n\n반드시 아래 JSON 배열만 응답하세요 (씬 순서 동일):\n[{"content_kr":"보정된 씬 설명","content_en":"Refined description","script_kr":"보정된 대사","script_en":"Refined script"},...]`
    : `Below are all scenes from an ad storyboard. Analyze each image in order and refine all scene descriptions and scripts considering the overall story flow.\nMake the message more impactful, emotionally resonant, and improve story connectivity between scenes.\n\n${sceneSummaries}\n\nRespond ONLY with this JSON array (same scene order):\n[{"content_kr":"Refined Korean description","content_en":"Refined English description","script_kr":"Refined Korean script","script_en":"Refined English script"},...]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: REFINED_STORY_SCHEMA,
        // 씬 수만큼 되돌려줘야 호출부가 결과를 매칭할 수 있다. 잘리면 개수가 어긋난다.
        maxOutputTokens: MAX_SCRIPT_OUTPUT_TOKENS,
      }
    });

    const abnormal = abnormalFinishReason(response);
    if (abnormal) throw new Error(finishReasonMessage(abnormal));

    return JSON.parse(extractJson(response.text || '', '[', ']'));
  } catch (e) {
    console.error("Failed to refine full story", e);
    return null;
  }
}

export async function translateText(text: string, context: string = 'storyboard content') {
  const ai = await getAI();
  if (!text) return '';
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Translate the following Korean text to English for a professional ${context}. Keep it concise, natural, and technical where appropriate.
    Only return the translated text.
    Text: ${text}`,
  });
  return response.text?.trim() || '';
}

/**
 * Veo 모델을 이용해 씬으로부터 비디오를 생성합니다.
 */
export async function generateSceneVideo(prompt: string, startImageBase64?: string, engine: 'veo31' | 'kling' = 'kling', aspectRatio?: string) {
  // Route to Kling API when engine is 'kling'
  if (engine === 'kling') {
    return generateKlingVideo(prompt, startImageBase64, aspectRatio);
  }

  // VEO 3.1 path
  const ai = await getAI();
  const modelName = 'veo-3.1-generate-preview';

  interface VideoGenerationParams {
    model: string;
    prompt: string;
    config: {
      numberOfVideos: number;
      resolution: string;
      aspectRatio: string;
    };
    image?: {
      imageBytes: string;
      mimeType: string;
    };
  }

  const videoParams: VideoGenerationParams = {
    model: modelName,
    prompt: `${prompt}. High resolution, cinematic quality, smooth movement, professional grading.`,
    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: aspectRatio || '16:9'
    }
  };

  if (startImageBase64) {
    let imageBytes: string;
    let mimeType = 'image/png';

    if (startImageBase64.startsWith('http')) {
      // Public URL (e.g. Supabase Storage) — fetch and convert to base64.
      // VEO accepts only raw base64 in imageBytes, not URLs.
      const res = await fetch(startImageBase64);
      const blob = await res.blob();
      if (blob.type) mimeType = blob.type;
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      imageBytes = dataUrl.split(',')[1];
    } else if (startImageBase64.startsWith('data:')) {
      const mimeMatch = startImageBase64.match(/^data:([^;]+);base64,/);
      if (mimeMatch) mimeType = mimeMatch[1];
      imageBytes = startImageBase64.split(',')[1];
    } else {
      imageBytes = startImageBase64;
    }

    videoParams.image = {
      imageBytes,
      mimeType,
    };
  }

  try {
    let operation = await ai.models.generateVideos(videoParams);

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) return null;

    // 키를 URL 에 붙이지 않는다. 프록시가 서버 키로 대신 인증한다.
    const videoResponse = await proxyFetch(downloadLink);
    const videoBlob = await videoResponse.blob();
    return URL.createObjectURL(videoBlob);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Requested entity was not found")) {
      throw new Error("API_KEY_EXPIRED");
    }
    throw error;
  }
}
