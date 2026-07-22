-- ============================================
-- 021: 신규 가입 크레딧을 60 으로 원복
-- 사용자 결정 (2026-07-22): 원격 트랙의 60→20 변경을 파기하고 기존 60 유지
-- 관련 함수:
--   - initialize_user_credits(): 초기 잔액 20 → 60
--   - approve_credit_request(): 신청 승인 시 신규 user_credits 초기 잔액 20 → 60
--   - admin_grant_credit():     마스터 직접 지급 시 신규 user_credits 초기 잔액 20 → 60
-- ============================================

-- 1. 초기 크레딧 지급 함수 (60 + signup_bonus 로그)
CREATE OR REPLACE FUNCTION public.initialize_user_credits(p_user_id UUID)
RETURNS TABLE(balance INTEGER, max_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO public.user_credits (user_id, balance, max_credits)
    VALUES (p_user_id, 60, 60)
    ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
      VALUES (p_user_id, 60, 'signup_bonus', 'signup_bonus:initial', 60);
  END IF;

  RETURN QUERY
    SELECT uc.balance, uc.max_credits
    FROM public.user_credits uc
    WHERE uc.user_id = p_user_id;
END;
$$;

-- 2. 크레딧 신청 승인 시 신규 user_credits 초기 잔액 60 + 지급량
CREATE OR REPLACE FUNCTION public.approve_credit_request(
  p_request_id     UUID,
  p_granted_amount INTEGER DEFAULT NULL,
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

  UPDATE public.user_credits
    SET balance     = balance + v_grant,
        max_credits = max_credits + v_grant,
        updated_at  = now()
    WHERE user_id = v_req.user_id
    RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, max_credits)
      VALUES (v_req.user_id, 60 + v_grant, 60 + v_grant)
      RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO public.credit_transactions
      (user_id, amount, type, description, balance_after, related_request_id)
    VALUES (v_req.user_id, v_grant, 'manual_grant',
            COALESCE(p_note, 'credit_request:' || p_request_id::TEXT),
            v_balance, p_request_id);

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

-- 3. 마스터 직접 지급 시 신규 user_credits 초기 잔액 60 + 지급량
CREATE OR REPLACE FUNCTION public.admin_grant_credit(
  p_target_user_id UUID,
  p_amount         INTEGER,
  p_note           TEXT DEFAULT NULL
)
RETURNS TABLE(balance INTEGER, remaining_quota INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remain  INTEGER;
  v_balance INTEGER;
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'check_violation';
  END IF;

  v_remain := public.master_quota_remaining();
  IF p_amount > v_remain THEN
    RAISE EXCEPTION 'quota_exceeded: remaining=%, requested=%', v_remain, p_amount
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.user_credits
    SET balance     = balance + p_amount,
        max_credits = max_credits + p_amount,
        updated_at  = now()
    WHERE user_id = p_target_user_id
    RETURNING user_credits.balance INTO v_balance;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, max_credits)
      VALUES (p_target_user_id, 60 + p_amount, 60 + p_amount)
      RETURNING user_credits.balance INTO v_balance;
  END IF;

  INSERT INTO public.credit_transactions
      (user_id, amount, type, description, balance_after)
    VALUES (p_target_user_id, p_amount, 'manual_grant',
            COALESCE(p_note, 'master_direct_grant'),
            v_balance);

  RETURN QUERY SELECT v_balance, public.master_quota_remaining();
END;
$$;
