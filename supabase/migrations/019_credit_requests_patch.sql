-- ============================================
-- 019: credit_requests 보정 (PRD §9.7 REQUEST-03, REQUEST-06)
--   - cancelled 상태 추가 (사용자 스스로 pending 취소 가능)
--   - 사용자당 pending 1건만 허용하는 부분 UNIQUE 인덱스
--   - 사용자 셀프 취소 RPC (cancel_credit_request)
-- ============================================

-- 1. status CHECK 확장: pending, approved, rejected, cancelled
ALTER TABLE public.credit_requests
  DROP CONSTRAINT IF EXISTS credit_requests_status_check;

ALTER TABLE public.credit_requests
  ADD CONSTRAINT credit_requests_status_check
  CHECK (status IN ('pending','approved','rejected','cancelled'));

-- 2. 사용자당 pending 1건 강제 (부분 UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS credit_requests_one_pending_per_user
  ON public.credit_requests (user_id) WHERE status = 'pending';

-- 3. 사용자 셀프 취소 RPC
CREATE OR REPLACE FUNCTION public.cancel_credit_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner UUID;
  v_status TEXT;
BEGIN
  SELECT user_id, status INTO v_owner, v_status
    FROM public.credit_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'only_pending_can_be_cancelled' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.credit_requests
    SET status = 'cancelled', reviewed_at = now()
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_credit_request(UUID) TO authenticated;
