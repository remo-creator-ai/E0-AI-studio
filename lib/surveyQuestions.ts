// 인트로 설문 문항 정의 (PRD §9.0)
//
// 문항 문구·선택지 라벨은 i18n(survey.*), 여기서는 저장 스키마(컬럼·코드값)만 확정한다.
// 문항 개편 시 SURVEY_VERSION 을 올리면 과거 응답은 보존된다(SURVEY-09).
//
// SURVEY-02: 모든 문항은 선택 입력이며(필수 문항 없음), 최소 1개만 응답해도 제출 가능.
// 건너뛰기는 항상 허용(SURVEY-03). 아래 required 는 사용하지 않되, PRD §9.0 초안의
// 권장 필수 표시를 참고용으로 남긴다.

export const SURVEY_VERSION = 'v1';

export type SurveyFieldId =
  | 'q1_role'
  | 'q2_content_type'
  | 'q3_industry'
  | 'q4_expected_volume'
  | 'q5_ai_experience'
  | 'q6_referral';

export interface SurveyQuestion {
  id: SurveyFieldId;
  /** 참고용 권장 필수 표시(§9.0 초안). 실제 제출 조건은 "최소 1개 응답"(SURVEY-02). */
  recommended: boolean;
  options: string[];
}

export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  { id: 'q1_role',            recommended: true,  options: ['creator', 'smb', 'marketer', 'freelancer', 'other'] },
  { id: 'q2_content_type',    recommended: true,  options: ['product_promo', 'brand_story', 'education', 'sns_shorts', 'other'] },
  { id: 'q3_industry',        recommended: false, options: ['food', 'fashion_beauty', 'retail', 'service', 'education', 'it_startup', 'other'] },
  { id: 'q4_expected_volume', recommended: true,  options: ['lt_5', '5_to_20', '20_to_50', 'gte_50'] },
  { id: 'q5_ai_experience',   recommended: false, options: ['first', 'few', 'frequent'] },
  { id: 'q6_referral',        recommended: false, options: ['openknowl', 'referral', 'search', 'sns', 'other'] },
] as const;

export type SurveyAnswers = Partial<Record<SurveyFieldId, string>>;
