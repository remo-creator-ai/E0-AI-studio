-- ============================================
-- 017: 마스터 직접 크레딧 지급 + 사용자 목록 실제 잔액 조회
-- 근거: docs/PRD.md v1.4 §9.2 (MASTER-04, MASTER-09, MASTER-10), §11.2, §20.1
--   - admin_grant_credit(target_user_id, amount, note): 마스터 직접 지급 (원자적)
--   - list_accounts_with_credits(): 사용자 목록 + 실제 잔액 + 마스터가 부여한 누계
-- ============================================

-- 1. 마스터 직접 지급 RPC
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
      VALUES (p_target_user_id, 20 + p_amount, 20 + p_amount)
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

GRANT EXECUTE ON FUNCTION public.admin_grant_credit(UUID,INTEGER,TEXT) TO authenticated;

-- 2. 사용자 목록 + 실제 잔액 + 마스터 부여 누계
CREATE OR REPLACE FUNCTION public.list_accounts_with_credits()
RETURNS TABLE(
  id             UUID,
  email          TEXT,
  display_name   TEXT,
  balance        INTEGER,
  max_credits    INTEGER,
  granted_total  INTEGER,     -- 이 사용자에게 마스터가 부여한 누계
  last_active    TIMESTAMPTZ, -- credit_transactions 최근 갱신 시각 (프록시)
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.email,
      p.display_name,
      COALESCE(uc.balance, 0)     AS balance,
      COALESCE(uc.max_credits, 0) AS max_credits,
      COALESCE((
        SELECT SUM(amount)::INTEGER
        FROM public.credit_transactions t
        WHERE t.user_id = p.id AND t.type = 'manual_grant' AND t.amount > 0
      ), 0) AS granted_total,
      (SELECT MAX(created_at) FROM public.credit_transactions t2 WHERE t2.user_id = p.id) AS last_active,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.user_credits uc ON uc.user_id = p.id
    WHERE p.role = 'user'
    ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_accounts_with_credits() TO authenticated;
