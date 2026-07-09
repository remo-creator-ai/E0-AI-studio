/**
 * Kling AI Video Generation Service
 * API Docs: https://docs.qingque.cn/d/home/eZQB2yS9R7fKMFGdcXjlU_d1p
 */

import { getAdminConfig } from './adminConfigService';
import { normalizeImageInput } from './imageUtils';

const KLING_API_BASE = '/api/kling';

function base64url(str: string): string {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createJWT(accessKeyId: string, accessKeySecret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKeyId, exp: now + 1800, nbf: now - 5 };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(accessKeySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));

  return `${data}.${signatureB64}`;
}

async function getKlingKeys(): Promise<{ accessKeyId: string; accessKeySecret: string }> {
  const accessKeyId = await getAdminConfig('kling_access_key_id');
  const accessKeySecret = await getAdminConfig('kling_access_key_secret');
  if (!accessKeyId || !accessKeySecret) {
    throw new Error(
      'Kling API 키가 설정되지 않았습니다. 관리자에게 문의하세요.'
    );
  }
  return { accessKeyId, accessKeySecret };
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
  const { accessKeyId, accessKeySecret } = await getKlingKeys();
  const token = await createJWT(accessKeyId, accessKeySecret);

  const body: Record<string, unknown> = {
    model_name: 'kling-v1',
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
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
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

    const refreshedToken = await createJWT(accessKeyId, accessKeySecret);
    const pollRes = await fetch(queryEndpoint, {
      headers: {
        'Authorization': `Bearer ${refreshedToken}`,
      },
    });

    if (!pollRes.ok) continue;

    const pollData: KlingTaskResponse = await pollRes.json();

    if (pollData.data.task_status === 'succeed') {
      const videoUrl = pollData.data.task_result?.videos?.[0]?.url;
      return videoUrl || null;
    }

    if (pollData.data.task_status === 'failed') {
      throw new Error(`Kling video generation failed: ${pollData.data.task_status_msg || 'Unknown error'}`);
    }

    // Still processing, continue polling
  }

  throw new Error('Kling video generation timed out after 5 minutes');
}
