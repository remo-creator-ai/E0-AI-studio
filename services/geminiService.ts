
import { GoogleGenAI } from "@google/genai";
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

export async function generateAdScript(idea: string, duration: AdDuration, sceneCount?: number, aspectRatio?: string, language: 'ko' | 'en' = 'ko') {
  const ai = await getAI();
  const prompt = `Idea: ${idea}\nDuration: ${duration} seconds. Generate the full script in JSON format according to the system instruction.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: sceneCount && aspectRatio ? getSystemInstruction(sceneCount, aspectRatio, language) : SYSTEM_INSTRUCTION,
      responseMimeType: "application/json"
    },
  });

  try {
    let text = response.text || '{}';
    // Strip markdown code fences if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      text = jsonMatch[1].trim();
    }
    // Extract JSON object if extra text exists
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse script JSON", e);
    return null;
  }
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

export async function generateSingleImage(prompt: string, referenceImagesBase64?: string[], aspectRatio?: string, imageModel?: string) {
  if (isOpenAIImageModel(imageModel)) {
    return generateSingleImageOpenAI(prompt, referenceImagesBase64, aspectRatio);
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

  const styleInstruction = (referenceImagesBase64 && referenceImagesBase64.length > 0)
    ? "REFERENCE INSTRUCTION: Strictly match the visual style, atmosphere, characters, and specific artistic details from the attached reference images."
    : "";

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: imageModel || 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          ...imageParts,
          { text: `${styleInstruction}\n\nPROMPT: ${prompt}. Cinematic, high-quality, professional photography, 4k, detailed.` }
        ]
      },
      config: {
        responseModalities: ["Image"],
        imageConfig: {
          aspectRatio: (aspectRatio || "16:9") as "16:9" | "9:16",
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
  });
}

export async function upscaleImage(
  imageBase64: string,
  imagePrompt: string,
  targetSize: '2K' | '4K',
  aspectRatio?: string
): Promise<string> {
  const ai = await getAI();
  const { mimeType, base64: base64Data } = await normalizeImageInput(imageBase64);

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: `UPSCALE INSTRUCTION: Reproduce this EXACT image at maximum fidelity ${targetSize} resolution. Preserve ALL details, textures, composition, lighting, and colors EXACTLY as they are. Do NOT add, remove, or modify any elements. This is a pure quality enhancement. Original scene context: ${imagePrompt}. Output: Ultra high resolution ${targetSize}, sharp details, no artifacts.`,
          },
        ],
      },
      config: {
        responseModalities: ['Image'],
        imageConfig: {
          aspectRatio: (aspectRatio || '16:9') as '16:9' | '9:16',
          imageSize: targetSize,
        },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error('Upscale failed: No candidates returned.');
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Upscale blocked. Reason: ${candidate.finishReason}`);
    }
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error('No image data found in upscale response.');
  });
}

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
      config: { responseMimeType: "application/json" }
    });

    let text = response.text || '{}';
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1].trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(text);
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
      config: { responseMimeType: "application/json" }
    });

    let text = response.text || '[]';
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1].trim();
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      text = text.substring(firstBracket, lastBracket + 1);
    }
    return JSON.parse(text);
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
