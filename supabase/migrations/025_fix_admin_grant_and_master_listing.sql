-- 025: 마스터 직접 크레딧 지급 복구 + 계정 목록에 마스터 포함
--
-- (1) admin_grant_credit() 컬럼 모호성 — 마스터 직접 지급이 처음부터 실패했다.
--       ERROR 42702: column reference "balance" is ambiguous
--       CONTEXT: PL/pgSQL function admin_grant_credit(uuid,integer,text) line 20
--     RETURNS TABLE(balance INTEGER, ...) 의 OUT 파라미터 balance 가
--     `UPDATE user_credits SET balance = balance + p_amount` 의 컬럼과 충돌한다.
--     크레딧 "신청 승인" 경로(approve_credit_request)는 RETURNS UUID 라 충돌이
--     없어 정상 동작했고, 그래서 직접 지급만 조용히 실패하고 있었다.
--
--     018(enforce_user_capacity), 023(list_accounts_with_credits)에 이은 세 번째
--     같은 유형이라 RETURNS TABLE 함수를 전수 점검했다. 나머지
--     initialize_user_credits / get_project_summaries 는 실행 확인 결과 정상.
--
--     수정: OUT 파라미터와 이름이 겹치는 컬럼을 전부 테이블 별칭으로 한정한다.
--
-- (2) 계정 목록에 마스터 포함 — 기존에는 WHERE p.role='user' 라 마스터가 목록에
--     없었고, 그래서 마스터가 자기 자신에게 크레딧을 지급할 수단이 없었다.
--     운영상 마스터도 생성 기능을 쓰므로 목록에 포함시킨다. role 을 함께
--     반환해 UI 가 구분해 표시할 수 있게 한다.

-- ---------- (1) admin_grant_credit ----------
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

  -- uc 별칭으로 한정해 OUT 파라미터 balance 와의 충돌을 없앤다.
  UPDATE public.user_credits AS uc
    SET balance     = uc.balance + p_amount,
        max_credits = uc.max_credits + p_amount,
        updated_at  = now()
    WHERE uc.user_id = p_target_user_id
    RETURNING uc.balance INTO v_balance;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits AS uc (user_id, balance, max_credits)
      VALUES (p_target_user_id, 60 + p_amount, 60 + p_amount)
      RETURNING uc.balance INTO v_balance;
  END IF;

  INSERT INTO public.credit_transactions
      (user_id, amount, type, description, balance_after)
    VALUES (p_target_user_id, p_amount, 'manual_grant',
            COALESCE(p_note, 'master_direct_grant'),
            v_balance);

  RETURN QUERY SELECT v_balance, public.master_quota_remaining();
END;
$$;

-- ---------- (2) 계정 목록에 마스터 포함 ----------
DROP FUNCTION IF EXISTS public.list_accounts_with_credits();

CREATE FUNCTION public.list_accounts_with_credits()
RETURNS TABLE(
  id            UUID,
  email         TEXT,
  display_name  TEXT,
  role          TEXT,
  balance       INTEGER,
  max_credits   INTEGER,
  granted_total INTEGER,
  last_active   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
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
      p.role,
      COALESCE(uc.balance, 0)     AS balance,
      COALESCE(uc.max_credits, 0) AS max_credits,
      COALESCE((
        SELECT SUM(t.amount)::INTEGER
        FROM public.credit_transactions t
        WHERE t.user_id = p.id AND t.type = 'manual_grant' AND t.amount > 0
      ), 0) AS granted_total,
      (SELECT MAX(t2.created_at) FROM public.credit_transactions t2 WHERE t2.user_id = p.id) AS last_active,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.user_credits uc ON uc.user_id = p.id
    -- 마스터 포함. 마스터를 먼저 보여 자기 계정을 쉽게 찾게 한다.
    ORDER BY (p.role = 'master') DESC, p.created_at DESC;
END;
$$;

-- 검증(마스터 세션에서):
--   SELECT email, role, balance FROM public.list_accounts_with_credits();
--   SELECT * FROM public.admin_grant_credit('<uuid>'::uuid, 10, 'test');
