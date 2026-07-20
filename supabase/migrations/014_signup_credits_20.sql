-- 014: 신규 가입 크레딧 60 -> 20
--
-- 배경: 구글 셀프가입 재개(3d65b7b)로 불특정 다수가 가입 가능해지면서
--       초기 지급 크레딧을 20으로 하향. UI/i18n 은 이미 20 기준.
--
-- 정책: 신규 가입자만 20. 기존 사용자는 60 그대로 유지한다.
--       (아래 어디에도 기존 row 를 UPDATE 하는 문장이 없다 - 의도된 것)

-- 1. 컬럼 기본값 정합화
--    주의: 아래 RPC 가 INSERT 시 값을 명시하므로 이 DEFAULT 는 실제 가입 경로에서
--    쓰이지 않는다. 직접 INSERT 하는 코드가 생겼을 때를 대비한 정합성 조치.
--    ALTER ... SET DEFAULT 는 이후 INSERT 에만 적용되며 기존 row 를 바꾸지 않는다.
ALTER TABLE public.user_credits ALTER COLUMN balance     SET DEFAULT 20;
ALTER TABLE public.user_credits ALTER COLUMN max_credits SET DEFAULT 20;

-- 2. 실제 신규 가입자에게 지급되는 값 (핵심)
--    store/creditStore.ts 의 loadCredits() 가 로그인 때마다 이 RPC 를 호출한다.
--    ON CONFLICT DO NOTHING 이므로 기존 사용자의 잔액은 절대 덮어쓰지 않는다.
CREATE OR REPLACE FUNCTION public.initialize_user_credits(p_user_id UUID)
RETURNS TABLE(balance INTEGER, max_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance, max_credits)
  VALUES (p_user_id, 20, 20)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT uc.balance, uc.max_credits
  FROM public.user_credits uc
  WHERE uc.user_id = p_user_id;
END;
$$;

-- 검증용 (실행 후 수동 확인)
--   신규 지급값이 20인지:
--     SELECT prosrc LIKE '%20, 20%' FROM pg_proc WHERE proname = 'initialize_user_credits';
--   기존 사용자가 그대로 60인지 (이 마이그레이션 이전 가입자):
--     SELECT max_credits, count(*) FROM public.user_credits GROUP BY max_credits;
--     -> 60 그룹이 기존 인원 수만큼 남아 있어야 정상
