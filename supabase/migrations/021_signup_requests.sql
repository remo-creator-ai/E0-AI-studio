-- 021: 가입 신청 (signup_requests)
--
-- PRD §9.8 / §11.1. 사용자 상한(§8.1)이 가득 찬 상태에서 신규 방문자가 Google
-- OAuth 를 통과하면, 프로필을 만들지 않고 이 테이블에 신청을 남긴 뒤 마스터 승인을
-- 기다린다. 승인 시 마스터가 상한을 증분하면 재로그인으로 통상 가입 진입.
--
-- 선행: 013_roles.sql(is_master).

CREATE TABLE IF NOT EXISTS public.signup_requests (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT NOT NULL,               -- Google OAuth 실이메일
  google_sub    TEXT,                        -- Google 신원 식별자(재시도 동일 신청 판정)
  display_name  TEXT,                        -- Google 프로필 이름 기본값(수정 가능)
  contact       TEXT,                        -- 이메일 외 연락처(선택)
  reason        TEXT NOT NULL,               -- 신청 사유(필수)
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer      UUID REFERENCES auth.users(id),  -- 처리 마스터
  reviewer_note TEXT,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동일 이메일의 pending 중복 방지(WAITLIST-03). approved/rejected 후 재신청은 허용.
CREATE UNIQUE INDEX IF NOT EXISTS signup_requests_email_pending_unique
  ON public.signup_requests (email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON public.signup_requests (status);

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

-- INSERT: authenticated 허용.
--   구현 노트(§9.8): OAuth 성공 직후(세션 보유, 프로필 미생성) 상태에서 신청을 INSERT 하고
--   그 다음 signOut 한다. 즉 "즉시 로그아웃"을 신청 완료 이후로 미룬다.
--   anon(완전 비로그인) 신청까지 열면 스팸 위험이 크므로, 그 경우엔 Edge Function
--   (service_role + rate limit/CAPTCHA)으로 전환할 것. 지금은 authenticated 로 제한한다.
DROP POLICY IF EXISTS "Authenticated can insert signup request" ON public.signup_requests;
CREATE POLICY "Authenticated can insert signup request"
  ON public.signup_requests FOR INSERT TO authenticated
  WITH CHECK (status = 'pending');

-- 조회·처리는 마스터 전용 (대기함).
DROP POLICY IF EXISTS "Master can read signup requests"   ON public.signup_requests;
DROP POLICY IF EXISTS "Master can update signup requests" ON public.signup_requests;
CREATE POLICY "Master can read signup requests"
  ON public.signup_requests FOR SELECT
  USING (public.is_master());
CREATE POLICY "Master can update signup requests"
  ON public.signup_requests FOR UPDATE
  USING (public.is_master())
  WITH CHECK (public.is_master());
