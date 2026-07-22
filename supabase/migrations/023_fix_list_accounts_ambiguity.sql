-- 023: list_accounts_with_credits() 컬럼 모호성 수정
--
-- 증상: 관리자 콘솔 > 사용자 관리가 항상 "0명"으로 나오고 계정 목록이 비어,
--       마스터가 크레딧을 지급할 대상을 고를 수 없었다.
--
-- 원인: RETURNS TABLE 의 OUT 파라미터 이름 created_at 이 서브쿼리 안의
--       credit_transactions.created_at 과 충돌해 실행 자체가 실패했다.
--         ERROR 42702: column reference "created_at" is ambiguous
--         DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--       018_fix_signup_cap_ambiguity.sql 이 enforce_user_capacity() 에서 고쳤던
--       것과 같은 유형인데 이 함수는 누락돼 있었다.
--
--       services/masterService.ts:67 이 `if (error) return []` 로 에러를 삼켜서
--       화면에는 원인 없이 빈 목록만 보였다.
--
-- 수정: 서브쿼리의 컬럼을 별칭으로 한정(t2.created_at). 나머지 로직은 동일하다.

CREATE OR REPLACE FUNCTION public.list_accounts_with_credits()
RETURNS TABLE(
  id            UUID,
  email         TEXT,
  display_name  TEXT,
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
      COALESCE(uc.balance, 0)     AS balance,
      COALESCE(uc.max_credits, 0) AS max_credits,
      COALESCE((
        SELECT SUM(t.amount)::INTEGER
        FROM public.credit_transactions t
        WHERE t.user_id = p.id AND t.type = 'manual_grant' AND t.amount > 0
      ), 0) AS granted_total,
      -- 여기가 문제였다. t2. 로 한정하지 않으면 OUT 파라미터 created_at 과 충돌한다.
      (SELECT MAX(t2.created_at) FROM public.credit_transactions t2 WHERE t2.user_id = p.id) AS last_active,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.user_credits uc ON uc.user_id = p.id
    WHERE p.role = 'user'
    ORDER BY p.created_at DESC;
END;
$$;

-- 검증(마스터 세션에서):
--   SELECT email, balance, granted_total FROM public.list_accounts_with_credits();
