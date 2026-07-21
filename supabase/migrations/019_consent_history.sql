-- 019: 약관 동의 이력 (consent_history)
--
-- PRD §9.1(약관 동의 팝업) / §11.1. 최초 로그인 시 필수 3종 동의를 기록하고,
-- 약관 개정(버전 상승) 시 재동의를 판정하는 근거가 된다.
--
-- 선행: 013_roles.sql(is_master) 적용 필요. 참조 스타일은 011_credit_transactions.sql.

CREATE TABLE IF NOT EXISTS public.consent_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy', 'ai_content')),
  document_version TEXT NOT NULL,
  agreed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동일 사용자·문서종류·버전 조합은 한 번만 (AUTH-07 멱등성).
-- 앱은 INSERT ... ON CONFLICT DO NOTHING 으로 재시도/새로고침 중복을 흡수한다.
CREATE UNIQUE INDEX IF NOT EXISTS consent_history_user_doc_ver_unique
  ON public.consent_history (user_id, document_type, document_version);
CREATE INDEX IF NOT EXISTS idx_consent_history_user ON public.consent_history (user_id);

ALTER TABLE public.consent_history ENABLE ROW LEVEL SECURITY;

-- 본인 조회/기록
DROP POLICY IF EXISTS "Users can read own consent"   ON public.consent_history;
DROP POLICY IF EXISTS "Users can insert own consent" ON public.consent_history;
CREATE POLICY "Users can read own consent"
  ON public.consent_history FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own consent"
  ON public.consent_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 마스터 전체 조회 (AUTH-04: 동의 문서 버전·시각을 관리자 데이터에서 확인)
DROP POLICY IF EXISTS "Master can read all consent" ON public.consent_history;
CREATE POLICY "Master can read all consent"
  ON public.consent_history FOR SELECT
  USING (public.is_master());

-- 동의 이력은 사용자가 자산을 삭제해도 별도 보존한다(§12). auth.users 삭제 시에만
-- CASCADE 로 정리된다. UPDATE/DELETE 정책은 두지 않아 이력을 사실상 append-only 로 유지.
