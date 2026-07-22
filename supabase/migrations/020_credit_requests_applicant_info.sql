-- ============================================
-- 020: credit_requests 에 신청자 신원 정보 컬럼 추가
--   - 사유: 오픈놀 마스터가 지급 대상 확인 목적 (개인정보 확인용)
--   - 필드: applicant_name, company_name, phone
-- ============================================

ALTER TABLE public.credit_requests
  ADD COLUMN IF NOT EXISTS applicant_name TEXT,
  ADD COLUMN IF NOT EXISTS company_name   TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT;
