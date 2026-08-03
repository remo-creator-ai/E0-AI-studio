// =============================================================
//  단건 영상 제작 서비스 — 사이드바 "동영상 생성" 도구용
//
//  ⚠️ 격리 원칙 — services/geminiService.generateSceneVideo() 는 프로젝트 씬 재생성
//  경로에서 쓰이며, 그 경로는 씬 컨텍스트(image_prompt_en + video_motion_en) 를
//  자체 조립한다. 여기서는 사용자가 입력한 프롬프트를 있는 그대로 Kling 에 넘기고
//  옵션(길이, 시작/끝 프레임, 종횡비) 만 처리한다.
//
//  Kling API 는 klingService 에서 이미 프록시 경유로 구성돼 있어 그것을 재사용한다.
//  다만 klingService.generateKlingVideo 는 duration 5s 고정이므로, 여기서 직접
//  프록시를 호출해 duration 파라미터를 노출한다.
// =============================================================

import { MOCK_MODE } from '../lib/mockAuth';
import { accessToken, PROXY_BASE, proxyClient } from '../lib/aiProxy';
import { normalizeImageInput } from './imageUtils';

// ---------- 종횡비 ----------
// Kling API 에 실제로 전달되는 값은 concrete 3종. 'auto' 는 UI 개념으로,
// 시작 이미지의 실제 비율을 감지해 가장 근접한 concrete 값으로 해석한다.
// 시작 이미지가 없을 때(T2V) 'auto' 는 16:9 로 fallback.
export type ConcreteAspect = '16:9' | '9:16' | '1:1';
export type VideoAspect = 'auto' | ConcreteAspect;
export const VIDEO_ASPECTS: VideoAspect[] = ['auto', '16:9', '9:16', '1:1'];
export const CONCRETE_ASPECTS: ConcreteAspect[] = ['16:9', '9:16', '1:1'];
export const DEFAULT_VIDEO_ASPECT: VideoAspect = 'auto';

/** data URL / http URL 이미지의 자연 크기를 로드해 3종 종횡비 중 가장 가까운 값으로 매핑. */
export function detectAspectFromImage(url: string): Promise<ConcreteAspect> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      const ratio = w / h;
      // 목표 비율: 16:9=1.777, 1:1=1.0, 9:16=0.5625
      // 로그 스케일로 비교하면 상하 대칭이라 정확도가 낫다.
      const targets: Array<[ConcreteAspect, number]> = [
        ['16:9', 16 / 9],
        ['1:1', 1],
        ['9:16', 9 / 16],
      ];
      let best: ConcreteAspect = '16:9';
      let bestDist = Infinity;
      for (const [name, t] of targets) {
        const d = Math.abs(Math.log(ratio) - Math.log(t));
        if (d < bestDist) { bestDist = d; best = name; }
      }
      resolve(best);
    };
    img.onerror = () => resolve('16:9');
    img.src = url;
  });
}

// ---------- 길이 ----------
// Kling 은 5초 또는 10초만 지원. 3초 옵션은 향후 다른 모델 추가시 대비해 미노출.
export const VIDEO_DURATIONS = [5, 10] as const;
export type VideoDuration = typeof VIDEO_DURATIONS[number];
export const DEFAULT_VIDEO_DURATION: VideoDuration = 5;

// ---------- 해상도 ----------
// Kling v2-6 는 std=720p · pro=1080p 로 mode 에 따라 해상도가 결정된다.
// UI 는 해상도를 노출하고, 서비스가 내부에서 mode 를 매핑한다.
// 향후 별도 resolution 파라미터를 갖는 신모델 지원 시 매핑을 확장한다.
export const VIDEO_RESOLUTIONS = ['720p', '1080p'] as const;
export type VideoResolution = typeof VIDEO_RESOLUTIONS[number];
export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = '720p';

// ---------- 크레딧 단가 ----------
// 규칙 하나: 크레딧 = CREDIT_PER_UNIT × 유닛수
//
// Kling 리소스팩은 "유닛" 단위로 차감되며 5초 std 영상 1건이 1유닛이다
// (docs/KLING_API_GUIDE.md §2·§3). 길이는 비례하고, pro 는 2배 소모한다.
//
//   길이 \ 해상도    720p(std)    1080p · 끝프레임(pro)
//   5초                30cr              60cr
//   10초               60cr             120cr
//
// 유닛당 크레딧이 전 조합에서 균일해 어떤 옵션을 고르든 마진이 같다.
// 또 프로젝트 씬 영상(CREDIT_COSTS.VIDEO_STANDARD = 5초 30cr)과 값이 맞아,
// 같은 산출물이 경로에 따라 3배 차이 나던 차익거래가 사라진다.
//
// 이전 단가(std 10/15 · pro 20/30)는 kling-v1 시절 산정치였다. v2-6 로
// 원가가 오른 뒤에도 남아 있었고, 10초가 유닛당 25% 싸서 길게 쓸수록
// 마진이 깎이는 문제도 있었다.
export const CREDIT_PER_UNIT = 30;

export function videoStudioCreditCost(input: {
  durationSec: number;
  resolution?: VideoResolution;
  hasEndFrame?: boolean;
}): number {
  // 끝 프레임은 v2-6/std 가 image_tail 을 지원하지 않아 pro 로 강제 승격된다.
  const isPro = input.resolution === '1080p' || !!input.hasEndFrame;
  const units = Math.ceil(input.durationSec / 5) * (isPro ? 2 : 1);
  return CREDIT_PER_UNIT * units;
}

// ---------- 모델 ----------
// Kling v2.6 (Motion Control) — 2025년 후반 릴리스, v1 대비 정체성 보존과
// 카메라 무빙 정확도가 크게 개선. 안정성·품질 균형이 좋아 기본값으로 사용한다.
// 향후 kling-v3 (4K · 멀티샷) 옵션 추가 시 여기서 분기.
export const VIDEO_STUDIO_MODEL = 'kling-v2-6';

// Kling API 프롬프트 상한. 초과 시 400 (code 1201). 안전을 위해 여유(2400) 잡음.
export const KLING_PROMPT_MAX = 2400;

/** 상한 초과 시 자연스러운 지점(문장·줄바꿈)에서 자른다. 강제 자르기는 최후 수단. */
export function clampKlingPrompt(prompt: string): string {
  const p = prompt.trim();
  if (p.length <= KLING_PROMPT_MAX) return p;
  const truncated = p.slice(0, KLING_PROMPT_MAX);
  // 마지막 온전한 문장 끝(., !, ?, 줄바꿈)에서 자르기 시도
  const lastBoundary = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('.\n'),
    truncated.lastIndexOf('!\n'),
    truncated.lastIndexOf('?\n'),
    truncated.lastIndexOf('\n\n'),
  );
  // 최소 절반은 남아야 문장 경계 자르기 적용 (너무 앞에서 자르면 손실이 큼)
  if (lastBoundary > KLING_PROMPT_MAX / 2) {
    return truncated.slice(0, lastBoundary + 1).trim();
  }
  return truncated.trim();
}

const KLING_API_BASE = `${PROXY_BASE}/kling`;

export type GenerateVideoFailure =
  | 'no_api_key'
  | 'blocked'
  | 'timeout'
  | 'error';

export interface GenerateVideoResult {
  ok: boolean;
  /** 성공 시 원격 mp4 URL (Kling 반환) — 저장을 원하면 videoHistoryService.saveVideoHistory 로 넘긴다 */
  videoUrl?: string;
  failure?: GenerateVideoFailure;
  message?: string;
}

export interface GenerateVideoInput {
  prompt: string;
  /** 반드시 concrete 값 (16:9|9:16|1:1). UI 의 'auto' 는 호출 전에 detectAspectFromImage 로 해석. */
  aspect: ConcreteAspect;
  durationSec: VideoDuration;
  /** 720p (std) 또는 1080p (pro). endImage 가 있으면 항상 pro 로 승격. */
  resolution?: VideoResolution;
  /** data URL 또는 http URL. 있으면 I2V, 없으면 T2V. */
  startImage?: string;
  /** 끝 프레임 (선택). 있으면 mode 가 pro 로 자동 승격 (v2-6/std 미지원). */
  endImage?: string;
  signal?: AbortSignal;
}

async function proxyHeaders(json = false): Promise<Record<string, string>> {
  const token = await accessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

interface KlingTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: string;
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{ id: string; url: string; duration: string }>;
    };
  };
}

export async function generateStudioVideo(input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, failure: 'error', message: 'empty_prompt' };

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 2000));
    // 목 모드: 소담이 서버에 올려둔 샘플 mp4 대신 zero-byte data URL 로 대체
    return { ok: true, videoUrl: mockVideoDataUrl() };
  }

  // Kling 은 프롬프트 2500자 상한 (code 1201). 자동 잘라내기.
  const safePrompt = clampKlingPrompt(prompt);

  // 모드 결정:
  //   - kling-v2-6 는 std=720p · pro=1080p 로 해상도가 mode 에 결정됨
  //   - 사용자가 1080p 선택 시 pro 승격
  //   - 끝 프레임(image_tail) 은 v2-6/std 미지원이라 pro 강제
  //     (에러 code 1201: "not supported with image_tail in standard mode")
  const mode = input.endImage || input.resolution === '1080p' ? 'pro' : 'std';

  const body: Record<string, unknown> = {
    model_name: VIDEO_STUDIO_MODEL,
    prompt: safePrompt,
    negative_prompt: '',
    cfg_scale: 0.5,
    mode,
    duration: String(input.durationSec),
    aspect_ratio: input.aspect,
  };

  let endpoint = `${KLING_API_BASE}/v1/videos/text2video`;

  if (input.startImage) {
    const { base64 } = await normalizeImageInput(input.startImage);
    body.image = base64;
    endpoint = `${KLING_API_BASE}/v1/videos/image2video`;

    if (input.endImage) {
      const { base64: endB64 } = await normalizeImageInput(input.endImage);
      body.image_tail = endB64;
    }
  }

  try {
    const submitRes = await fetch(endpoint, {
      method: 'POST',
      headers: await proxyHeaders(true),
      body: JSON.stringify(body),
      signal: input.signal,
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      if (submitRes.status === 503) {
        return { ok: false, failure: 'no_api_key', message: errText };
      }
      return { ok: false, failure: 'error', message: `Kling ${submitRes.status}: ${errText}` };
    }

    const submitData: KlingTaskResponse = await submitRes.json();
    if (submitData.code !== 0) {
      return { ok: false, failure: 'error', message: submitData.message };
    }

    const taskId = submitData.data.task_id;
    const queryEndpoint = input.startImage
      ? `${KLING_API_BASE}/v1/videos/image2video/${taskId}`
      : `${KLING_API_BASE}/v1/videos/text2video/${taskId}`;

    // Poll (5초 간격, 최대 5분)
    for (let attempts = 0; attempts < 60; attempts++) {
      if (input.signal?.aborted) {
        return { ok: false, failure: 'error', message: 'cancelled' };
      }
      await new Promise((r) => setTimeout(r, 5000));

      const pollRes = await fetch(queryEndpoint, {
        headers: await proxyHeaders(),
        signal: input.signal,
      });
      if (!pollRes.ok) continue;

      const pollData: KlingTaskResponse = await pollRes.json();

      if (pollData.data.task_status === 'succeed') {
        const url = pollData.data.task_result?.videos?.[0]?.url;
        if (!url) return { ok: false, failure: 'error', message: 'no_video_url' };
        return { ok: true, videoUrl: url };
      }

      if (pollData.data.task_status === 'failed') {
        const msg = pollData.data.task_status_msg || 'kling_failed';
        // 콘텐츠 정책 차단은 상당수 케이스에서 'blocked' 유사 문자열이 온다
        const isBlocked = /block|policy|prohibit|content/i.test(msg);
        return { ok: false, failure: isBlocked ? 'blocked' : 'error', message: msg };
      }
    }

    return { ok: false, failure: 'timeout', message: 'polling_timeout_5min' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, failure: 'error', message: msg };
  }
}

function mockVideoDataUrl(): string {
  // 재생 가능한 미니멀 mp4 를 만드는 대신, 목 UI 에서는 빈 문자열을 안전하게 처리하도록 안내.
  // 실제 videoHistoryService.saveVideoHistory 는 MOCK 모드에서 이 URL 을 그대로 저장한다.
  return '';
}

// ==========================================================
//  프롬프트 자동 추천 (이미지 → 영상 프롬프트)
//
//  사용자가 시작 이미지를 넣었지만 프롬프트를 안 썼을 때, Gemini vision 으로
//  이미지 내용 분석 후 영상 프롬프트(모션·카메라·무드 포함)를 제안한다.
//  Gemini 2.5 Flash 사용 — 1회 호출 비용 낮음. 크레딧 1cr 차감(호출부에서).
// ==========================================================
export const SUGGEST_PROMPT_COST = 1;

export interface SuggestPromptResult {
  ok: boolean;
  prompt?: string;
  error?: string;
}

/**
 * 시작 이미지 하나로부터 영상용 프롬프트를 추천한다.
 * priorDescription: 자산 보관함 등에서 이미지 메타데이터가 이미 있으면 힌트로 활용
 *                   → Gemini 는 참고만 하고 새로 작성 (품질이 대체로 더 낫다).
 */
export async function suggestVideoPromptFromImage(
  startImage: string,
  opts?: { language?: 'ko' | 'en'; priorDescription?: string },
): Promise<SuggestPromptResult> {
  const language = opts?.language ?? 'ko';
  const prior = opts?.priorDescription?.trim() ?? '';

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: true, prompt: language === 'ko' ? '카메라가 천천히 줌인하며 부드러운 자연광 속 피사체를 포착합니다.' : 'Slow camera zoom-in on the subject with soft natural light.' };
  }

  const ai = await proxyClient();
  if (!ai) return { ok: false, error: 'no_session' };

  const { mimeType, base64 } = await normalizeImageInput(startImage);
  const langInstr = language === 'ko'
    ? '한국어로 답하세요. 반환은 오직 프롬프트 텍스트만 (설명·인사·따옴표 없이).'
    : 'Answer in English. Return ONLY the prompt text (no intros, no quotes).';

  const priorPart = prior
    ? `\nContext hint (from image metadata, use as reference only): "${prior}"`
    : '';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text:
              `You are a short-form video prompt writer. Given this image as a start frame, ` +
              `write a compelling 1~3 sentence video prompt describing motion, camera work, and mood. ` +
              `Keep it under 60 words. ${langInstr}${priorPart}`,
          },
        ],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => (p as { text?: string }).text ?? '').join('').trim();
    if (!text) return { ok: false, error: 'no_response' };
    return { ok: true, prompt: text.replace(/^["'`]|["'`]$/g, '') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
