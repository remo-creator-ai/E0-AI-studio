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
