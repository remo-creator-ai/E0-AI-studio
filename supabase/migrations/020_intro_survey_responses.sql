-- 020: 인트로 설문 응답 (intro_survey_responses)
--
-- PRD §9.0 / §11.1. 대시보드 최초 진입 시 6문항 설문 모달. 제출(completed) 또는
-- 건너뛰기(skipped) 모두 로우를 1건 남겨 재노출을 막는다(SURVEY-04/05).
--
-- 문항 문구는 오픈놀 확정 대상이나, 저장 스키마(선택지 코드값)는 PRD §9.0 초안으로 확정.
-- 선행: 013_roles.sql(is_master).

CREATE TABLE IF NOT EXISTS public.intro_survey_responses (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('completed', 'skipped')),
  survey_version     TEXT NOT NULL DEFAULT 'v1',
  -- 모든 문항은 선택 입력(NULL 허용). status='skipped' 이면 전 문항 NULL.
  -- CHECK (col IN (...)) 는 NULL 을 통과시키므로 별도 NULL 허용 표기 불필요.
  q1_role            TEXT CHECK (q1_role            IN ('creator', 'smb', 'marketer', 'freelancer', 'other')),
  q2_content_type    TEXT CHECK (q2_content_type    IN ('product_promo', 'brand_story', 'education', 'sns_shorts', 'other')),
  q3_industry        TEXT,
  q4_expected_volume TEXT CHECK (q4_expected_volume IN ('lt_5', '5_to_20', '20_to_50', 'gte_50')),
  q5_ai_experience   TEXT,
  q6_referral        TEXT,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_id UNIQUE(테이블 정의)로 사용자당 1건 강제. 앱은 ON CONFLICT (user_id) DO NOTHING.
-- 문항 개편 시 survey_version 만 올리고 과거 응답은 보존(SURVEY-09).

ALTER TABLE public.intro_survey_responses ENABLE ROW LEVEL SECURITY;

-- 본인 조회/기록 (수정은 없음 — 1회성)
DROP POLICY IF EXISTS "Users can read own survey"   ON public.intro_survey_responses;
DROP POLICY IF EXISTS "Users can insert own survey" ON public.intro_survey_responses;
CREATE POLICY "Users can read own survey"
  ON public.intro_survey_responses FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own survey"
  ON public.intro_survey_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 마스터 전체 조회 + 집계 (SURVEY-08: 문항별 분포·응답률·스킵률)
DROP POLICY IF EXISTS "Master can read all surveys" ON public.intro_survey_responses;
CREATE POLICY "Master can read all surveys"
  ON public.intro_survey_responses FOR SELECT
  USING (public.is_master());

-- 집계 뷰는 마스터 콘솔 구현 시 추가(위 마스터 SELECT 정책으로 앱단 집계 가능).
