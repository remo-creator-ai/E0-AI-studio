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
import { accessToken, PROXY_BASE } from '../lib/aiProxy';
import { normalizeImageInput } from './imageUtils';

// ---------- 종횡비 ----------
export type VideoAspect = '16:9' | '9:16' | '1:1';
export const VIDEO_ASPECTS: VideoAspect[] = ['16:9', '9:16', '1:1'];
export const DEFAULT_VIDEO_ASPECT: VideoAspect = '16:9';

// ---------- 길이 ----------
// Kling 은 5초 또는 10초만 지원. 3초 옵션은 향후 다른 모델 추가시 대비해 미노출.
export const VIDEO_DURATIONS = [5, 10] as const;
export type VideoDuration = typeof VIDEO_DURATIONS[number];
export const DEFAULT_VIDEO_DURATION: VideoDuration = 5;

// ---------- 크레딧 단가 ----------
// 5초: 10cr, 10초: 15cr (Kling std 기준).
// 시작+끝 프레임 조합은 프리미엄이라 +5cr.
// 씬 영상 배치 생성(모드 A/B)과는 별도 단가 — 여기는 스탠드얼론 생성 프리미엄.
export function videoStudioCreditCost(input: { durationSec: number; hasEndFrame?: boolean }): number {
  const base = input.durationSec >= 10 ? 15 : 10;
  return base + (input.hasEndFrame ? 5 : 0);
}

// ---------- 모델 ----------
// Kling v1 기본. 향후 kling-v1-6, kling-v2 추가시 여기 확장.
export const VIDEO_STUDIO_MODEL = 'kling-v1';

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
  aspect: VideoAspect;
  durationSec: VideoDuration;
  /** data URL 또는 http URL. 있으면 I2V, 없으면 T2V. */
  startImage?: string;
  /** 끝 프레임 (선택). 모델이 지원하지 않으면 무시됨. */
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

  const body: Record<string, unknown> = {
    model_name: VIDEO_STUDIO_MODEL,
    prompt,
    negative_prompt: '',
    cfg_scale: 0.5,
    mode: 'std',
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
