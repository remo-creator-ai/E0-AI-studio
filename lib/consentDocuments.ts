// 약관 동의 문서 정의 (PRD §9.1 / AUTH-03)
//
// 최초 로그인 시 아래 3종에 모두 동의해야 앱에 진입할 수 있다. 문서를 개정하면
// 해당 항목의 version 을 올린다 — 그러면 기존 동의(구버전)와 매칭되지 않아
// 다음 로그인 시 재동의 팝업이 뜬다(AUTH-10). 재동의는 크레딧을 재지급하지 않는다.

export type ConsentDocType = 'terms' | 'privacy' | 'ai_content';

export interface ConsentDocument {
  type: ConsentDocType;
  /** 문서 버전. 개정 시 올리면 재동의가 요구된다. consent_history.document_version 과 대조. */
  version: string;
  /** 게이트 체크박스 라벨 i18n 키 */
  labelKey: string;
}

export const CONSENT_DOCUMENTS: readonly ConsentDocument[] = [
  { type: 'terms',      version: '1.0', labelKey: 'consent.items.terms' },
  { type: 'privacy',    version: '1.0', labelKey: 'consent.items.privacy' },
  { type: 'ai_content', version: '1.0', labelKey: 'consent.items.aiContent' },
] as const;

/** 현재 버전 3종을 (type,version) 집합으로. 로드된 동의 이력과 대조해 미동의를 판정한다. */
export function currentConsentKeys(): Set<string> {
  return new Set(CONSENT_DOCUMENTS.map((d) => `${d.type}:${d.version}`));
}
