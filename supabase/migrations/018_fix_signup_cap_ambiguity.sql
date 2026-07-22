-- ============================================
-- 018: 014의 enforce_user_capacity 트리거 버그 수정
--   - 원인: plpgsql 변수 role/status가 profiles.role/status 컬럼과 이름 충돌 → ambiguous reference
--   - 증상: 신규 Google 로그인 → OAuth callback 에서 "Database error saving new user" 500
-- ============================================

CREATE OR REPLACE FUNCTION public.enforce_user_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_cap  INTEGER;
  v_cnt  INTEGER;
  v_role TEXT;
BEGIN
  v_role := COALESCE(NEW.role, 'user');
  -- 마스터는 상한 카운트 제외
  IF v_role = 'master' THEN
    RETURN NEW;
  END IF;

  SELECT (value)::INTEGER INTO v_cap FROM public.app_config WHERE key = 'user_capacity';
  IF v_cap IS NULL THEN
    v_cap := 30;
  END IF;

  -- 컬럼과 변수명이 겹치지 않도록 테이블 별칭 사용
  SELECT COUNT(*) INTO v_cnt
  FROM public.profiles AS p
  WHERE p.role = 'user' AND p.status = 'active';

  IF v_cnt >= v_cap THEN
    RAISE EXCEPTION 'signup_cap_reached: user capacity of % has been reached', v_cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거는 014에서 이미 CREATE 되어 있으므로 함수만 REPLACE 하면 반영됨.
