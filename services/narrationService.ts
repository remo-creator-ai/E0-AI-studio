// =============================================================
//  나레이션 생성 (통짜 · 씬별 자를 지점 포함)
//
//  왜 통짜인가:
//    씬별로 따로 TTS 를 돌리면 같은 목소리 프리셋이어도 톤·속도가 미묘하게
//    달라져서 이어붙였을 때 사람 목소리가 바뀐 것처럼 들린다. 그래서 전체
//    대사를 한 번에 합성하고, 편집에서 잘라 쓰는 방식이 맞다.
//
//  그러면 "어디서 자르냐" 가 문제인데, Google TTS v1beta1 의 타임포인트
//  기능이 이걸 정확히 알려준다. SSML 에 <mark name="s1"/> 을 심어 보내면
//  응답의 timepoints[] 가 각 mark 의 실제 오디오 시각(초)을 돌려준다.
//  추정이 아니라 합성 결과 기준의 값이라 그대로 자르면 맞는다.
//
//  ttsService(음성 생성 스튜디오)와는 별도 경로다. 저쪽은 사용자가 쓴 문장
//  하나를 v1 로 합성하고, 이쪽은 스토리보드 전체를 v1beta1 로 합성한다.
//  프록시(/google/tts)는 뒤 경로를 그대로 흘려보내므로 서버 변경은 없다.
// =============================================================

import { accessToken, PROXY_BASE } from '../lib/aiProxy';
import { MOCK_MODE } from '../lib/mockAuth';
import { VOICE_PRESETS, DEFAULT_VOICE, ttsCreditCost } from './ttsService';

const TTS_BASE = `${PROXY_BASE}/google/tts`;

/**
 * 한 번에 합성할 수 있는 상한.
 *
 * Google 문서상 요청당 5,000바이트이고 SSML 태그도 그 바이트에 포함된다.
 * 한글은 UTF-8 에서 3바이트라 글자 수로는 훨씬 빨리 찬다. 태그 오버헤드까지
 * 감안해 넉넉히 낮춰 잡고, 넘으면 자르지 않고 실패로 알린다 —
 * 쪼개서 합성하면 목소리가 갈리므로 그건 해결이 아니다.
 */
export const NARRATION_MAX_CHARS = 1200;

/** 씬 사이에 넣는 무음. 자를 때 경계가 분명해진다. */
const SCENE_GAP_MS = 600;

export interface NarrationScene {
  /** 씬 번호 (1부터) — 자를 지점 라벨에 그대로 쓴다 */
  order: number;
  /** 이 씬의 대사. 빈 씬은 호출부에서 걸러 넣는다. */
  script: string;
}

/** 나레이션 안에서 이 씬의 대사가 시작되는 시각 */
export interface NarrationCue {
  order: number;
  startSeconds: number;
}

export type NarrationFailure = 'no_api_key' | 'too_long' | 'empty' | 'error';

export interface NarrationResult {
  ok: boolean;
  /** 성공 시 data:audio/mpeg;base64,... */
  audioUrl?: string;
  /** 씬별 시작 시각 (오름차순). 타임포인트를 못 받으면 비어 있다. */
  cues?: NarrationCue[];
  /** 실제 합성된 글자 수 (크레딧 정산용) */
  charCount?: number;
  failure?: NarrationFailure;
  message?: string;
}

/** SSML 에 그대로 넣으면 안 되는 문자들 */
function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 씬 번호 → mark 이름. 응답에서 다시 번호로 되돌린다. */
function markName(order: number): string {
  return `s${order}`;
}

function orderFromMark(name: string): number | null {
  const m = name.match(/^s(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** 합성에 실제로 들어가는 대사만 남긴다 (빈 대사 제외). */
export function narratableScenes(scenes: NarrationScene[]): NarrationScene[] {
  return scenes
    .map((s) => ({ order: s.order, script: (s.script ?? '').trim() }))
    .filter((s) => s.script.length > 0);
}

/** 크레딧 계산·길이 검증에 쓰는 순수 대사 길이 (SSML 태그 제외) */
export function narrationCharCount(scenes: NarrationScene[]): number {
  return narratableScenes(scenes).reduce((sum, s) => sum + s.script.length, 0);
}

export function narrationCreditCost(scenes: NarrationScene[]): number {
  return ttsCreditCost(narrationCharCount(scenes));
}

/**
 * 씬 대사를 하나의 SSML 로 잇는다.
 * 각 씬 앞에 <mark> 를 심어야 응답에서 그 지점의 시각을 받을 수 있다.
 */
export function buildNarrationSsml(scenes: NarrationScene[]): string {
  const body = narratableScenes(scenes)
    .map((s) => `<mark name="${markName(s.order)}"/>${escapeSsml(s.script)}`)
    .join(`<break time="${SCENE_GAP_MS}ms"/>`);
  return `<speak>${body}</speak>`;
}

export interface GenerateNarrationInput {
  scenes: NarrationScene[];
  voiceId?: string;
  speakingRate?: number;
  pitch?: number;
}

async function authHeader(): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.');
  return `Bearer ${token}`;
}

/**
 * 전체 대사를 한 번에 합성하고, 씬별 시작 시각을 함께 돌려준다.
 */
export async function generateNarration(input: GenerateNarrationInput): Promise<NarrationResult> {
  const scenes = narratableScenes(input.scenes);
  if (scenes.length === 0) {
    return { ok: false, failure: 'empty', message: '대사가 있는 씬이 없습니다. 스토리보드에서 대사를 먼저 채워주세요.' };
  }

  const charCount = narrationCharCount(scenes);
  if (charCount > NARRATION_MAX_CHARS) {
    return {
      ok: false,
      failure: 'too_long',
      message: `전체 대사가 ${charCount}자입니다. 한 번에 합성할 수 있는 길이는 ${NARRATION_MAX_CHARS}자까지예요.\n`
        + '쪼개서 합성하면 목소리 톤이 갈리므로 나눠 만들지 않습니다. 대사를 줄이거나 씬을 나눠 진행해 주세요.',
    };
  }

  const voice = VOICE_PRESETS.find((v) => v.id === input.voiceId) ?? DEFAULT_VOICE;
  const ssml = buildNarrationSsml(scenes);

  if (MOCK_MODE) {
    await new Promise((r) => setTimeout(r, 1200));
    // MOCK: 오디오는 없고 큐만 그럴듯하게 — UI 흐름 검증용.
    let t = 0;
    const cues = scenes.map((s) => {
      const cue = { order: s.order, startSeconds: Number(t.toFixed(3)) };
      t += s.script.length / 5 + SCENE_GAP_MS / 1000;
      return cue;
    });
    return { ok: true, audioUrl: '', cues, charCount };
  }

  const res = await fetch(`${TTS_BASE}/v1beta1/text:synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({
      input: { ssml },
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
      // 이것 때문에 v1beta1 을 쓴다. v1 에는 없는 필드다.
      enableTimePointing: ['SSML_MARK'],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    if (res.status === 503) return { ok: false, failure: 'no_api_key', message: 'Google TTS 키가 설정되지 않았습니다.' };
    return { ok: false, failure: 'error', message: `TTS ${res.status}: ${raw.slice(0, 300)}` };
  }

  let body: {
    audioContent?: string;
    timepoints?: Array<{ markName?: string; timeSeconds?: number }>;
    error?: { message?: string };
  };
  try { body = JSON.parse(raw); }
  catch { return { ok: false, failure: 'error', message: '나레이션 응답 파싱 실패' }; }

  if (body.error?.message) return { ok: false, failure: 'error', message: body.error.message };
  if (!body.audioContent) return { ok: false, failure: 'error', message: '오디오 데이터가 비어있습니다.' };

  const cues: NarrationCue[] = (body.timepoints ?? [])
    .map((tp) => ({ order: orderFromMark(tp.markName ?? ''), startSeconds: tp.timeSeconds ?? 0 }))
    .filter((c): c is NarrationCue => c.order !== null)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  return {
    ok: true,
    audioUrl: `data:audio/mpeg;base64,${body.audioContent}`,
    cues,
    charCount,
  };
}
