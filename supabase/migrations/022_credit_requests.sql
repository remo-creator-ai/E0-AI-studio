-- 022: 인앱 크레딧 신청 (credit_requests)
--
-- PRD §9.7 / §11.1. 사용자가 마스터에게 크레딧을 신청하고, 마스터가 대기함에서
-- 승인(지급량 조정 가능)·반려한다. 마스터 직접 지급(§9.2)과 동일 60,000 pool 공유.
--
-- 선행: 013_roles.sql(is_master).

CREATE TABLE IF NOT EXISTS public.credit_requests (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL CHECK (amount > 0),          -- 요청 수량
  reason         TEXT NOT NULL,                                -- 신청 사유(필수)
  attachments    TEXT[] NOT NULL DEFAULT '{}',                 -- Storage 경로(선택, 최대 3장은 앱 검증)
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  granted_amount INTEGER CHECK (granted_amount IS NULL OR granted_amount >= 0),  -- 실제 승인·지급량(조정 승인)
  reviewer       UUID REFERENCES auth.users(id),               -- 처리 마스터
  reviewer_note  TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사용자당 pending 1건 강제(REQUEST-03).
CREATE UNIQUE INDEX IF NOT EXISTS credit_requests_one_pending_per_user
  ON public.credit_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON public.credit_requests (status);
CREATE INDEX IF NOT EXISTS idx_credit_requests_user   ON public.credit_requests (user_id);

ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

-- 조회: 본인 또는 마스터(REQUEST-11).
DROP POLICY IF EXISTS "Read own or master credit requests" ON public.credit_requests;
CREATE POLICY "Read own or master credit requests"
  ON public.credit_requests FOR SELECT
  USING (auth.uid() = user_id OR public.is_master());

-- 신청: 본인이 pending 으로만 생성.
DROP POLICY IF EXISTS "Users can insert own credit request" ON public.credit_requests;
CREATE POLICY "Users can insert own credit request"
  ON public.credit_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- UPDATE(취소/승인/반려)는 RLS 로 열지 않는다.
--   이유: RLS 는 컬럼 단위 제약이 안 되므로, 사용자 취소를 열면 reviewer 등 다른 필드
--   위조가 가능하고, 마스터 승인은 pool 한도 검증·user_credits 증액·거래 이력 기록을
--   하나의 트랜잭션으로 묶어야 한다(REQUEST-08). 따라서 상태 전이는 전부
--   SECURITY DEFINER RPC 로 처리한다(§9.7 기능 구현 시: 사용자 취소 RPC,
--   master_grant/approve RPC). 여기서는 테이블·INSERT·SELECT 만 확정한다.
