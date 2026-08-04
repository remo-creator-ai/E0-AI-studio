-- 038: 신규 가입 크레딧 60 → 100
--
-- 배경: Kling v2-6 std 5초 = 30cr. 60cr 로는 영상 2편이 한계이고,
--       업스케일(3cr)까지 감안하면 실질 1~2편 만들면 소진. 사용자가
--       AI 영상 체험 자체를 완주 못 하는 문제.
--       100cr = 5초 720p 3편 + 업스케일 몇 회 여유.
--
-- 영향:
--   - 신규 가입자만 100cr 로 시작 (기존 사용자 잔액은 변경 없음)
--   - user_credits.max_credits default 도 60 → 100 (RLS 파티션 없음, 안전)
--   - credit_transactions.description 'signup_bonus:initial' 도 100 반영

CREATE OR REPLACE FUNCTION public.initialize_user_credits(p_user_id UUID)
RETURNS TABLE(balance INTEGER, max_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO public.user_credits (user_id, balance, max_credits)
    VALUES (p_user_id, 100, 100)
    ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
      VALUES (p_user_id, 100, 'signup_bonus', 'signup_bonus:initial', 100);
  END IF;

  RETURN QUERY
    SELECT uc.balance, uc.max_credits
    FROM public.user_credits uc
    WHERE uc.user_id = p_user_id;
END;
$$;

-- 검증:
--   SELECT prosrc FROM pg_proc WHERE proname = 'initialize_user_credits';
