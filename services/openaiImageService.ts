// =============================================================
//  GPT Image 2 이미지 생성 서비스
//
//  스토리보드 시트(3×3 그리드)와 단건 이미지를 OpenAI 로 생성한다.
//  키는 브라우저에 없다 — ai-proxy Edge Function 의 /openai 라우트를 경유한다.
//
//  ⚠️ Gemini 경로(geminiService)와 프롬프트 로직을 공유하지 않는다.
//  호출부가 모델만 바꿔 끼울 수 있도록 반환 형태(data URL)만 맞춘다.
//
//  API 계약 (developers.openai.com/api/reference — 2026-08 확인):
//    POST /v1/images/generations   참조 이미지 없음. JSON.
//    POST /v1/images/edits         참조 이미지 있음. multipart/form-data.
//    size  — 임의 WIDTHxHEIGHT. 가로·세로 모두 16의 배수, 종횡비 1:3~3:1,
//            최대 3840x2160. 2560x1440 초과는 experimental 로 표기돼 있다.
//    응답  — { data: [{ b64_json }] }
// =============================================================

import { accessToken, PROXY_BASE } from '../lib/aiProxy';
import { normalizeImageInput } from './imageUtils';

const OPENAI_API_BASE = `${PROXY_BASE}/openai`;

/** 지원 모델 식별자. types.ts 의 ImageModel 과 값을 맞춘다. */
export const GPT_IMAGE_MODEL = 'gpt-image-2';

/** 이 서비스가 처리해야 하는 모델인지 판별. 라우팅 분기용. */
export function isOpenAIImageModel(model?: string): boolean {
  return !!model && model.startsWith('gpt-image');
}

/**
 * 종횡비 → 실제 픽셀 크기.
 *
 * 3×3 그리드로 9등분하는 것을 전제로 고른 값이다.
 *   16:9  3840x2160 → 컷 1개 1280x720  (Kling std 입력과 정확히 일치)
 *   9:16  2160x3840 → 컷 1개  720x1280
 *   1:1   2160x2160 → 컷 1개  720x720
 *
 * 모두 16의 배수이며 1:3~3:1 범위 안이다. 1:1 을 2160 으로 잡은 이유는
 * 4K 랜드스케이프(3840x2160 ≈ 8.3MP)와 픽셀 수를 맞춰 상한을 넘기지 않기
 * 위해서다. 3072x3072(9.4MP)는 상한을 넘길 소지가 있다.
 */
const SIZE_BY_ASPECT: Record<string, string> = {
  '16:9': '3840x2160',
  '9:16': '2160x3840',
  '1:1': '2160x2160',
};

function sizeFor(aspectRatio?: string): string {
  return SIZE_BY_ASPECT[aspectRatio ?? '16:9'] ?? SIZE_BY_ASPECT['16:9'];
}

async function authHeader(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.');
  return `Bearer ${token}`;
}

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string; type?: string; code?: string };
}

/** 공통 응답 처리 — 성공 시 data URL, 실패 시 throw. */
async function readImage(res: Response): Promise<string> {
  const text = await res.text();

  let body: OpenAIImageResponse;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI 응답 파싱 실패 (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    // 프록시가 키 미설정을 503 으로 알려준다. 호출부가 구분할 수 있게 표식을 남긴다.
    if (res.status === 503) throw new Error('no_api_key: OPENAI_API_KEY 가 설정되지 않았습니다.');
    throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? text.slice(0, 200)}`);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI 응답에 이미지 데이터가 없습니다.');
  return `data:image/png;base64,${b64}`;
}

/**
 * 참조 이미지 없이 생성.
 * quality 는 'high' 고정 — 스토리보드 시트는 9컷을 한 장에 담으므로
 * 컷당 디테일이 곧 결과 품질이다.
 */
async function generate(prompt: string, aspectRatio?: string): Promise<string> {
  const res = await fetch(`${OPENAI_API_BASE}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({
      model: GPT_IMAGE_MODEL,
      prompt,
      size: sizeFor(aspectRatio),
      quality: 'high',
      n: 1,
      output_format: 'png',
    }),
  });
  return readImage(res);
}

/**
 * 참조 이미지를 붙여서 생성 (/v1/images/edits).
 *
 * 스토리보드는 캐릭터 시트·스타일 참조가 정체성 유지의 핵심이라
 * 이 경로가 사실상 기본이다. multipart 라서 FormData 로 보내며,
 * Content-Type 은 브라우저가 boundary 와 함께 자동으로 채우게 둔다
 * (직접 지정하면 boundary 가 빠져 400 이 난다).
 */
async function generateWithRefs(
  prompt: string,
  refs: string[],
  aspectRatio?: string,
): Promise<string> {
  const form = new FormData();
  form.append('model', GPT_IMAGE_MODEL);
  form.append('prompt', prompt);
  form.append('size', sizeFor(aspectRatio));
  form.append('quality', 'high');
  form.append('n', '1');
  form.append('output_format', 'png');

  for (let i = 0; i < refs.length; i++) {
    const { mimeType, base64 } = await normalizeImageInput(refs[i]);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    // 필드명은 배열 표기 'image[]' 를 쓴다. 단수 'image' 는 1장짜리 계약이다.
    form.append('image[]', new Blob([bytes], { type: mimeType }), `ref_${i}.${ext}`);
  }

  const res = await fetch(`${OPENAI_API_BASE}/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: await authHeader() },
    body: form,
  });
  return readImage(res);
}

/**
 * 스토리보드 시트(그리드) 생성.
 * geminiService.generate3x3GridImage 와 반환 계약(data URL)이 같아
 * 호출부에서 모델만 보고 분기하면 된다.
 */
export async function generateGridImageOpenAI(
  prompt: string,
  referenceImages?: string[],
  aspectRatio?: string,
): Promise<string> {
  const full = `${prompt}. High quality, detailed textures, natural lighting. No text or captions of any kind on the image.`;
  return referenceImages && referenceImages.length > 0
    ? generateWithRefs(full, referenceImages, aspectRatio)
    : generate(full, aspectRatio);
}

/** 단건 이미지 생성. geminiService.generateSingleImage 대응판. */
export async function generateSingleImageOpenAI(
  prompt: string,
  referenceImages?: string[],
  aspectRatio?: string,
): Promise<string> {
  const full = `${prompt}. High quality, detailed, professional photography.`;
  return referenceImages && referenceImages.length > 0
    ? generateWithRefs(full, referenceImages, aspectRatio)
    : generate(full, aspectRatio);
}
