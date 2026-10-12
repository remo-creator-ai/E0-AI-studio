/**
 * 생성 실패 메시지 중앙 매퍼.
 *
 * Gemini / OpenAI / Kling 이 던지는 영어 원문(예: "Generation blocked by safety
 * settings. Reason: PROHIBITED_CONTENT") 을 사용자가 읽고 다음 행동을 알 수 있는
 * 한국어 문구로 바꾼다. 원문은 버리지 않고 `detail` 로 넘겨 모달 하단에 접어둔다.
 *
 * 기존에는 ImageStudio / VideoStudio 두 곳에만 각자 매핑이 있었고 나머지
 * (Visualizing / Assembly / Production) 는 원문을 그대로 alert 에 찍었다.
 * 매핑 규칙은 여기 한 곳에만 둔다.
 */

/** 실패 분류. i18n 키(errors.gen.<kind>) 와 1:1 대응한다. */
export type GenErrorKind =
  | 'previewOnly'
  | 'blockedContent'     // PROHIBITED_CONTENT, moderation_blocked — 정책 위반 소재
  | 'blockedSafety'      // SAFETY, IMAGE_SAFETY — 안전 필터
  | 'blockedRecitation'  // RECITATION, BLOCKLIST, SPII — 저작물/금칙어/개인정보
  | 'rateLimit'          // 429, quota, RESOURCE_EXHAUSTED
  | 'noApiKey'           // 관리자 콘솔에 키 미등록
  | 'auth'               // 키 만료·무효 (401/403, API_KEY_EXPIRED)
  | 'timeout'            // 폴링 타임아웃
  | 'noResult'           // 후보/이미지/영상 URL 없음
  | 'network'            // fetch 실패
  | 'unknown';

/** 어떤 작업이 실패했는지. 모달 제목을 고르는 데 쓴다. */
export type GenContext = 'image' | 'video' | 'upscale';

/** i18n 의 t() 와 호환되는 최소 시그니처. react-i18next 를 여기서 import 하지 않는다. */
type TFunc = (key: string, options?: Record<string, unknown>) => string;

/** Error / 문자열 / 서비스가 돌려준 {failure, message} 무엇이든 원문 문자열로 편다. */
function rawText(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (input instanceof Error) {
    // Gemini/fetch 계열 오류는 상태 코드를 message 가 아니라 status/code 에 담아 온다.
    // 그것까지 이어붙여야 429·401 을 놓치지 않는다.
    const e = input as Error & { status?: unknown; code?: unknown };
    const extra = [e.status, e.code].filter((v) => v != null).join(' ');
    return `${input.name}: ${input.message}${extra ? ` ${extra}` : ''}`;
  }
  if (typeof input === 'object') {
    const o = input as { failure?: unknown; message?: unknown; error?: unknown; status?: unknown };
    const parts = [o.failure, o.message, o.error, o.status]
      .filter((v) => v != null)
      .map((v) => String(v));
    if (parts.length > 0) return parts.join(' ');
  }
  return String(input);
}

/**
 * 원문에서 실패 종류를 판별한다.
 *
 * 순서가 중요하다: 차단 사유가 먼저다. Kling 이 돌려주는 문자열에는
 * "failed" 같은 일반 단어가 섞여 있어서, 구체적인 신호부터 걸러야 한다.
 */
export function classifyGenError(input: unknown): GenErrorKind {
  const raw = rawText(input);
  const s = raw.toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('preview_only') || s.includes('미리보기에서는')) return 'previewOnly';

  // 1) 콘텐츠 차단 — 사용자가 프롬프트를 고쳐야 하는 유일한 분류라 가장 먼저 판별한다.
  if (s.includes('prohibited_content') || s.includes('moderation_blocked') ||
      s.includes('content_policy') || s.includes('content policy')) {
    return 'blockedContent';
  }
  // Gemini 원문이 "Generation blocked by safety settings. Reason: RECITATION" 형태라
  // 'safety' 로 먼저 걸러버리면 세부 사유를 놓친다. 구체적인 Reason 부터 본다.
  if (s.includes('recitation') || s.includes('blocklist') || s.includes('spii')) {
    return 'blockedRecitation';
  }
  if (s.includes('image_safety') || /\bsafety\b/.test(s) || s.includes('safety_filter')) {
    return 'blockedSafety';
  }
  // 스튜디오 서비스가 코드로 넘겨주는 'blocked' 는 세부 사유가 없다 → 안전 필터로 묶는다.
  if (/\bblocked\b/.test(s)) return 'blockedSafety';

  // 2) 사용량 한도
  if (s.includes('429') || s.includes('quota') || s.includes('resource_exhausted') ||
      s.includes('rate limit') || s.includes('too many requests')) {
    return 'rateLimit';
  }

  // 3) 키 문제 — 미등록(관리자 조치)과 만료(관리자 조치)를 구분해 안내 문구를 다르게 준다.
  if (s.includes('no_api_key') || s.includes('api key is not') || s.includes('가 설정되지 않았')) {
    return 'noApiKey';
  }
  if (s.includes('api_key_expired') || s.includes('requested entity was not found') ||
      s.includes('api key not valid') || s.includes('401') || s.includes('403') ||
      s.includes('unauthenticated') || s.includes('permission_denied') ||
      s.includes('로그인이 필요합니다')) {
    return 'auth';
  }

  // 4) 시간 초과
  if (s.includes('timed out') || s.includes('timeout') || s.includes('deadline')) {
    return 'timeout';
  }

  // 5) 응답은 왔는데 결과물이 없음 — 대개 일시적이라 그대로 재시도가 정답이다.
  if (s.includes('no candidates') || s.includes('no_candidates') ||
      s.includes('no image data') || s.includes('no_image_data') ||
      s.includes('no_video_url') || s.includes('no video url')) {
    return 'noResult';
  }

  // 6) 네트워크
  if (s.includes('failed to fetch') || s.includes('networkerror') ||
      s.includes('err_internet') || s.includes('load failed')) {
    return 'network';
  }

  return 'unknown';
}

/**
 * 문의 시 첨부할 짧은 식별자. 원문에서 대문자 코드나 HTTP 상태를 뽑는다.
 * 못 찾으면 kind 자체를 코드로 쓴다(빈 값보다 낫다).
 */
export function extractErrorCode(input: unknown, kind?: GenErrorKind): string {
  const raw = rawText(input);
  const upper = raw.match(/\b(?:IMAGE_)?(?:PROHIBITED_CONTENT|IMAGE_SAFETY|SAFETY|RECITATION|BLOCKLIST|SPII|RESOURCE_EXHAUSTED|API_KEY_EXPIRED|MAX_TOKENS|OTHER)\b/);
  if (upper) return upper[0];
  const status = raw.match(/\b(4\d{2}|5\d{2})\b/);
  if (status) return `HTTP ${status[1]}`;
  return (kind ?? classifyGenError(input)).toUpperCase();
}

export interface GenErrorContent {
  /** 모달 제목 — 무엇이 실패했는지 */
  title: string;
  /** 본문 — 왜 실패했는지 */
  body: string;
  /** 다음 행동 안내 */
  hint: string;
  /** "오류 코드: PROHIBITED_CONTENT" */
  code: string;
  /** 원문(영어). 모달에서 접어두고, 필요할 때만 편다. */
  detail: string;
  kind: GenErrorKind;
}

/** 실패 원인 → 사용자용 문구 4종. i18n 을 통해 ko/en 모두 지원한다. */
export function genErrorContent(input: unknown, ctx: GenContext, t: TFunc): GenErrorContent {
  const kind = classifyGenError(input);
  const code = extractErrorCode(input, kind);
  return {
    title: t(`errors.gen.title.${ctx}`),
    body: t(`errors.gen.${kind}.body`),
    hint: t(`errors.gen.${kind}.hint`),
    code: t('errors.gen.codeLabel', { code }),
    detail: rawText(input),
    kind,
  };
}

/**
 * 배치 대시보드·씬 카드처럼 한 줄만 들어가는 자리에 쓰는 짧은 요약.
 * 모달을 띄우지 않는 인라인 표시 전용이다.
 */
export function genErrorSummary(input: unknown, t: TFunc): string {
  const kind = classifyGenError(input);
  return t(`errors.gen.${kind}.short`);
}
