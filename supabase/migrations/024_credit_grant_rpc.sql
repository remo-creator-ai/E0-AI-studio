-- 024: 크레딧 지급/신청 처리 RPC (PRD §9.7, §10.1)
--
-- 마스터 직접 지급과 사용자 인앱 신청 승인이 동일한 60,000 pool 을 공유하며,
-- 지급은 pool 한도 검증 → user_credits 증액 → credit_transactions 기록 →
-- (신청 승인 시) credit_requests 갱신을 하나의 트랜잭션으로 처리한다(REQUEST-08).
--
-- 선행: 013(is_master), 022(credit_requests), 023(credit_transactions.manual_grant).

-- 마스터 pool 한도. 추후 admin_config('master_credit_pool') 로 옮길 수 있으나
-- MVP 는 상수. 값 변경은 리모 협의(§10.1).
--   현재 값과의 정합: lib/mockMasterData.MASTER_CREDIT_QUOTA = 60000

-- 1) pool 현황: 한도 / 부여 누계(manual_grant 양수 합) / 잔여
CREATE OR REPLACE FUNCTION public.get_master_credit_pool()
RETURNS TABLE(pool_limit INTEGER, granted INTEGER, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit   INTEGER := 60000;
  v_granted INTEGER;
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'forbidden: master role required';
  END IF;
  SELECT COALESCE(SUM(amount), 0)::INTEGER INTO v_granted
  FROM public.credit_transactions
  WHERE type = 'manual_grant' AND amount > 0;
  RETURN QUERY SELECT v_limit, v_granted, (v_limit - v_granted);
END;
$$;

-- 2) 크레딧 지급 (마스터 직접 지급 + 신청 승인 공용)
--    p_request_id 를 넘기면 해당 신청을 approved 로 갱신하고 지급을 연결한다.
CREATE OR REPLACE FUNCTION public.master_grant_credit(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_reason     TEXT DEFAULT '',
  p_request_id UUID DEFAULT NULL
)
RETURNS TABLE(ok BOOLEAN, new_balance INTEGER, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit       INTEGER := 60000;
  v_granted     INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF NOT public.is_master() THEN
    RETURN QUERY SELECT false, 0, 'forbidden'; RETURN;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, 'amount must be positive'; RETURN;
  END IF;

  -- pool 집계~증액 구간을 직렬화해 동시 지급의 한도 초과를 DB 수준에서 차단(MASTER-10).
  -- 트랜잭션 종료 시 자동 해제되는 advisory lock 사용.
  PERFORM pg_advisory_xact_lock(hashtext('master_credit_pool'));

  SELECT COALESCE(SUM(amount), 0)::INTEGER INTO v_granted
  FROM public.credit_transactions
  WHERE type = 'manual_grant' AND amount > 0;

  IF v_granted + p_amount > v_limit THEN
    RETURN QUERY SELECT false, 0, 'pool limit exceeded'; RETURN;
  END IF;

  -- 수혜자 잔액 증액(없으면 생성). max_credits 는 잔액 이상으로 함께 올려 게이지 정합 유지.
  INSERT INTO public.user_credits (user_id, balance, max_credits)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance     = public.user_credits.balance + p_amount,
        max_credits = GREATEST(public.user_credits.max_credits, public.user_credits.balance + p_amount),
        updated_at  = now()
  RETURNING balance INTO v_new_balance;

  -- 지급 이력(누계 집계 대상). 신청 승인이면 원 신청과 연결.
  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after, related_request_id)
  VALUES (p_user_id, p_amount, 'manual_grant', COALESCE(p_reason, ''), v_new_balance, p_request_id);

  -- 신청 승인 처리(조정 승인: 실제 지급량 = p_amount).
  IF p_request_id IS NOT NULL THEN
    UPDATE public.credit_requests
    SET status = 'approved', granted_amount = p_amount, reviewer = auth.uid(), reviewed_at = now()
    WHERE id = p_request_id AND status = 'pending';
  END IF;

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;
END;
$$;

-- 3) 사용자 본인 pending 신청 취소 (REQUEST-06)
CREATE OR REPLACE FUNCTION public.cancel_credit_request(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner
  FROM public.credit_requests
  WHERE id = p_request_id AND status = 'pending';
  -- 본인 소유 pending 이 아니면 거부(승인/반려된 건은 취소 불가).
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RETURN false;
  END IF;
  UPDATE public.credit_requests SET status = 'cancelled'
  WHERE id = p_request_id AND status = 'pending';
  RETURN true;
END;
$$;

-- 4) 마스터 신청 반려 (REQUEST-09)
CREATE OR REPLACE FUNCTION public.reject_credit_request(p_request_id UUID, p_note TEXT DEFAULT '')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RETURN false;
  END IF;
  UPDATE public.credit_requests
  SET status = 'rejected', reviewer = auth.uid(), reviewer_note = COALESCE(p_note, ''), reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_master_credit_pool()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.master_grant_credit(UUID, INTEGER, TEXT, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_credit_request(UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_credit_request(UUID, TEXT)               TO authenticated;

-- 검증(마스터 세션):
--   SELECT * FROM get_master_credit_pool();               -> (60000, 0, 60000)
--   SELECT * FROM master_grant_credit('<uuid>', 100, '테스트', NULL);
--                                                         -> (true, <잔액>, null)
--   일반 세션에서 master_grant_credit -> (false, 0, 'forbidden')
