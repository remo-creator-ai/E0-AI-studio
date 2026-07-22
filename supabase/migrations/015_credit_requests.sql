-- ============================================
-- 015: 사용자 크레딧 신청/승인 흐름
-- 근거: docs/PRD.md §4.3, §7.3-#1
--   - 사용자: 인앱에서 크레딧 신청(사유·요청량)
--   - 마스터: 대기함에서 승인/반려/조정. 승인 시 user_credits 증액 + credit_transactions 감사 로그
--   - 마스터 부여 누계 한도(app_config: master_credit_quota_lifetime) 체크
-- ============================================

-- 1. credit_requests 테이블
CREATE TABLE IF NOT EXISTS public.credit_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL CHECK (amount > 0),
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  granted_amount INTEGER,           -- 승인 시 실제 부여량 (요청과 다를 수 있음)
  reviewer_id    UUID REFERENCES public.profiles(id),
  reviewer_note  TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_requests_user_id     ON public.credit_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status      ON public.credit_requests (status);
CREATE INDEX IF NOT EXISTS idx_credit_requests_created_at  ON public.credit_requests (created_at DESC);

-- 2. RLS
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own credit requests') THEN
    CREATE POLICY "Users can view own credit requests"
      ON public.credit_requests FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create own credit requests') THEN
    CREATE POLICY "Users can create own credit requests"
      ON public.credit_requests FOR INSERT
      WITH CHECK (auth.uid() = user_id AND status = 'pending' AND reviewer_id IS NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Master can view all credit requests') THEN
    CREATE POLICY "Master can view all credit requests"
      ON public.credit_requests FOR SELECT
      USING (public.is_master());
  END IF;

  -- 마스터의 UPDATE 는 RPC(approve/reject) 를 통해서만 수행. 직접 UPDATE 는 막음.
  -- (정책을 아예 만들지 않으면 UPDATE 는 거부됨.)
END $$;

-- 3. 마스터 부여 누계 잔여 계산 (편의 함수)
CREATE OR REPLACE FUNCTION public.master_quota_remaining()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT GREATEST(
    COALESCE((SELECT (value)::INTEGER FROM public.app_config WHERE key = 'master_credit_quota_lifetime'), 0)
    - COALESCE((
        SELECT SUM(amount)::INTEGER
        FROM public.credit_transactions
        WHERE type = 'manual' AND amount > 0
      ), 0),
    0
  );
$$;

-- 4. 승인 RPC (원자적: 잔여 한도 검사 → user_credits 증액 → credit_transactions 로그 → 요청 상태 갱신)
CREATE OR REPLACE FUNCTION public.approve_credit_request(
  p_request_id     UUID,
  p_granted_amount INTEGER DEFAULT NULL,   -- NULL 이면 요청량 그대로
  p_note           TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req      public.credit_requests%ROWTYPE;
  v_grant    INTEGER;
  v_remain   INTEGER;
  v_balance  INTEGER;
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_req FROM public.credit_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_processed' USING ERRCODE = 'check_violation';
  END IF;

  v_grant := COALESCE(p_granted_amount, v_req.amount);
  IF v_grant <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'check_violation';
  END IF;

  v_remain := public.master_quota_remaining();
  IF v_grant > v_remain THEN
    RAISE EXCEPTION 'quota_exceeded: remaining=%, requested=%', v_remain, v_grant
      USING ERRCODE = 'check_violation';
  END IF;

  -- 크레딧 증액 (balance + max_credits)
  UPDATE public.user_credits
    SET balance     = balance + v_grant,
        max_credits = max_credits + v_grant,
        updated_at  = now()
    WHERE user_id = v_req.user_id
    RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    -- 아직 초기화되지 않은 사용자면 즉시 초기화 후 재적용
    INSERT INTO public.user_credits (user_id, balance, max_credits)
      VALUES (v_req.user_id, 60 + v_grant, 60 + v_grant)
      RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (v_req.user_id, v_grant, 'manual',
            COALESCE(p_note, 'credit_request:' || p_request_id::TEXT),
            v_balance);

  UPDATE public.credit_requests
    SET status         = 'approved',
        granted_amount = v_grant,
        reviewer_id    = auth.uid(),
        reviewer_note  = p_note,
        reviewed_at    = now()
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

-- 5. 반려 RPC
CREATE OR REPLACE FUNCTION public.reject_credit_request(
  p_request_id UUID,
  p_note       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.credit_requests
    SET status        = 'rejected',
        reviewer_id   = auth.uid(),
        reviewer_note = p_note,
        reviewed_at   = now()
    WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found_or_already_processed' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN p_request_id;
END;
$$;

-- 6. 실행 권한
GRANT EXECUTE ON FUNCTION public.master_quota_remaining()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_credit_request(UUID,INTEGER,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_credit_request(UUID,TEXT)  TO authenticated;
