/**
 * Kling AI Video Generation Service
 * API Docs: https://docs.qingque.cn/d/home/eZQB2yS9R7fKMFGdcXjlU_d1p
 */

import { normalizeImageInput } from './imageUtils';
import { accessToken, PROXY_BASE } from '../lib/aiProxy';

// ai-proxy Edge Function 경유. 키와 JWT 서명은 서버에만 있다.
//
// 이전에는 브라우저가 admin_config 에서 accessKeySecret 을 읽어 직접 HS256 JWT 를
// 서명했다. 그래서 (1) secret 이 브라우저에 노출되고, (2) 호출 경로가 '/api/kling'
// 이라 vite dev 프록시에 의존해 프로덕션 빌드에서는 아예 동작하지 않았다.
// 프록시로 옮기면서 둘 다 해결된다.
const KLING_API_BASE = `${PROXY_BASE}/kling`;

/** 프록시 호출용 헤더 — Supabase 세션 토큰. Kling 인증은 서버가 붙인다. */
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
      videos?: Array<{
        id: string;
        url: string;
        duration: string;
      }>;
    };
  };
}

export async function generateKlingVideo(
  prompt: string,
  startImageBase64?: string,
  aspectRatio?: string,
  signal?: AbortSignal
): Promise<string | null> {
  const body: Record<string, unknown> = {
    model_name: 'kling-v2-6',
    prompt: prompt,
    negative_prompt: '',
    cfg_scale: 0.5,
    mode: 'std',
    duration: '5',
    aspect_ratio: aspectRatio || '16:9',
  };

  let endpoint = `${KLING_API_BASE}/v1/videos/text2video`;

  if (startImageBase64) {
    const { base64 } = await normalizeImageInput(startImageBase64);
    body.image = base64;
    endpoint = `${KLING_API_BASE}/v1/videos/image2video`;
  }

  // Submit task
  const submitRes = await fetch(endpoint, {
    method: 'POST',
    headers: await proxyHeaders(true),
    body: JSON.stringify(body),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Kling API error (${submitRes.status}): ${errText}`);
  }

  const submitData: KlingTaskResponse = await submitRes.json();
  if (submitData.code !== 0) {
    throw new Error(`Kling task submit failed: ${submitData.message}`);
  }

  const taskId = submitData.data.task_id;
  const queryEndpoint = startImageBase64
    ? `${KLING_API_BASE}/v1/videos/image2video/${taskId}`
    : `${KLING_API_BASE}/v1/videos/text2video/${taskId}`;

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max (5s intervals)

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new DOMException('Kling video generation cancelled', 'AbortError');
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;

    // Kling JWT 는 서버가 매 요청마다 새로 서명하므로 클라이언트는 갱신할 게 없다.
    const pollRes = await fetch(queryEndpoint, {
      headers: await proxyHeaders(),
    });

    if (!pollRes.ok) continue;

    const pollData: KlingTaskResponse = await pollRes.json();

    if (pollData.data.task_status === 'succeed') {
      const videoUrl = pollData.data.task_result?.videos?.[0]?.url;
      return videoUrl || null;
    }

    if (pollData.data.task_status === 'failed') {
      const msg = pollData.data.task_status_msg || 'Unknown error';
      // Kling 은 차단 사유를 자유 문장으로 돌려준다. 그대로 던지면 UI 매퍼가
      // 'unknown' 으로 뭉개므로, videoStudioService 와 같은 규칙으로 판별해
      // 'blocked' 신호를 메시지에 심는다.
      const isBlocked = /block|policy|prohibit|content/i.test(msg);
      throw new Error(`Kling video generation failed${isBlocked ? ' (blocked)' : ''}: ${msg}`);
    }

    // Still processing, continue polling
  }

  throw new Error('Kling video generation timed out after 5 minutes');
}
