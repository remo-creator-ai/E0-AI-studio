// =============================================================
//  음성 생성 (TTS) 서비스 · Google Cloud Text-to-Speech
//
//  키는 브라우저에 없다 — ai-proxy Edge Function 의 /google/tts 라우트 경유.
//  API 계약: https://cloud.google.com/text-to-speech/docs/reference/rest
//    POST /v1/text:synthesize
//    body: { input, voice, audioConfig }
//    response: { audioContent: base64 }
//
//  가격 (2026-08 기준):
//    Standard  — 월 4M chars 무료 · 초과 $4/1M
//    WaveNet   — 월 1M chars 무료 · 초과 $16/1M
//    Neural2   — 월 1M chars 무료 · 초과 $16/1M
//    한국어 스크립트 100자 = 100 chars. 100자당 우리 크레딧 1개.
// =============================================================

import { accessToken, PROXY_BASE } from '../lib/aiProxy';

const TTS_BASE = `${PROXY_BASE}/google/tts`;

/** 100자당 1cr. 짧은 문장은 최소 1cr. */
export const TTS_CREDIT_PER_100_CHARS = 1;
export function ttsCreditCost(charCount: number): number {
  return Math.max(1, Math.ceil(charCount / 100));
}

/** MVP · 한국어 · 4가지 목소리 프리셋. 확장 시 en-US, ja-JP 등 추가.
 *  gender · type 는 UI 라벨용. 실제 인증은 voice.name 만 씀. */
export interface VoicePreset {
  id: string;
  label: string;
  languageCode: string;
  name: string;             // Google TTS voice.name (예: 'ko-KR-Wavenet-A')
  gender: 'FEMALE' | 'MALE';
  tier: 'Standard' | 'WaveNet' | 'Neural2';
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'wave-a', label: '수아 · 여성 (자연스러움)',   languageCode: 'ko-KR', name: 'ko-KR-Wavenet-A', gender: 'FEMALE', tier: 'WaveNet' },
  { id: 'wave-b', label: '지호 · 여성 (밝음)',        languageCode: 'ko-KR', name: 'ko-KR-Wavenet-B', gender: 'FEMALE', tier: 'WaveNet' },
  { id: 'wave-c', label: '민재 · 남성 (차분함)',       languageCode: 'ko-KR', name: 'ko-KR-Wavenet-C', gender: 'MALE',   tier: 'WaveNet' },
  { id: 'wave-d', label: '동현 · 남성 (신뢰감)',       languageCode: 'ko-KR', name: 'ko-KR-Wavenet-D', gender: 'MALE',   tier: 'WaveNet' },
];

export const DEFAULT_VOICE = VOICE_PRESETS[0];

/** 최대 스크립트 길이 · Google TTS 는 5000 자 상한. UI 는 조금 여유 있게 1500 로 우선 제한. */
export const TTS_MAX_CHARS = 1500;

export type GenerateTtsFailure = 'no_api_key' | 'too_long' | 'empty' | 'error';

export interface GenerateTtsInput {
  text: string;
  voiceId?: string;         // VOICE_PRESETS.id · 미지정이면 DEFAULT_VOICE
  speakingRate?: number;    // 0.25 ~ 4.0 (기본 1.0)
  pitch?: number;           // -20.0 ~ 20.0 (기본 0)
}

export interface GenerateTtsResult {
  ok: boolean;
  /** 성공 시 audio/mpeg data URL */
  audioUrl?: string;
  /** 실제 charCount (크레딧 정산에 씀) */
  charCount?: number;
  failure?: GenerateTtsFailure;
  message?: string;
}

async function authHeader(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.');
  return `Bearer ${token}`;
}

/** 실 호출. base64 audioContent 를 mp3 data URL 로 변환해 반환. */
export async function generateTts(input: GenerateTtsInput): Promise<GenerateTtsResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, failure: 'empty', message: '스크립트가 비어 있습니다.' };
  if (text.length > TTS_MAX_CHARS) {
    return { ok: false, failure: 'too_long', message: `최대 ${TTS_MAX_CHARS}자까지 지원합니다.` };
  }

  const voice = VOICE_PRESETS.find((v) => v.id === input.voiceId) ?? DEFAULT_VOICE;

  const res = await fetch(`${TTS_BASE}/v1/text:synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
        ssmlGender: voice.gender,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: input.speakingRate ?? 1.0,
        pitch: input.pitch ?? 0,
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    if (res.status === 503) return { ok: false, failure: 'no_api_key', message: 'Google TTS 키가 설정되지 않았습니다.' };
    return { ok: false, failure: 'error', message: `TTS ${res.status}: ${raw.slice(0, 200)}` };
  }

  let body: { audioContent?: string; error?: { message?: string } };
  try { body = JSON.parse(raw); }
  catch { return { ok: false, failure: 'error', message: 'TTS 응답 파싱 실패' }; }

  if (body.error?.message) return { ok: false, failure: 'error', message: body.error.message };
  if (!body.audioContent) return { ok: false, failure: 'error', message: '오디오 데이터가 비어있습니다.' };

  return { ok: true, audioUrl: `data:audio/mpeg;base64,${body.audioContent}`, charCount: text.length };
}

/** 키 등록 여부만 확인 (UI 게이팅용). */
export async function isTtsReady(): Promise<boolean> {
  const { proxyHealth } = await import('../lib/aiProxy');
  const health = await proxyHealth();
  return Boolean(health?.googleTts);
}
