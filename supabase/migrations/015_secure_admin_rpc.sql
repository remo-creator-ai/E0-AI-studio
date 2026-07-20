-- 015: 관리자 RPC 에 마스터 권한 검사 추가
--
-- 문제: 012 가 만든 두 RPC 는 SECURITY DEFINER(=RLS 우회) 인데 함수 본문에
--       호출자 권한 검사가 없고, EXECUTE 가 authenticated 전체에 부여돼 있다.
--       012 파일 상단 주석 "SECURITY DEFINER ensures only admin logic runs" 은
--       사실과 반대다. SECURITY DEFINER 는 권한을 검사하지 않고 RLS 를 건너뛴다.
--
--       발급계정 시절에는 로그인 자체가 통제됐지만, 구글 셀프가입(3d65b7b) 이후로는
--       아무나 가입해서 아래를 실행할 수 있다:
--         supabase.rpc('admin_get_all_requests')        -> 전체 제작 의뢰 열람
--         supabase.rpc('admin_update_request_status')   -> 남의 의뢰 상태 변경
--
-- 013_roles.sql:70-72 에 TODO 로 남아 있던 항목을 여기서 처리한다.
--
-- 선행 조건: 013_roles.sql 이 적용돼 있어야 한다 (public.is_master() 필요).
--   확인: SELECT proname FROM pg_proc WHERE proname = 'is_master';

-- 1. 전체 의뢰 조회 - 마스터만
CREATE OR REPLACE FUNCTION public.admin_get_all_requests()
RETURNS SETOF public.production_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'forbidden: master role required';
  END IF;

  RETURN QUERY SELECT * FROM public.production_requests ORDER BY created_at DESC;
END;
$$;

-- 2. 의뢰 상태 변경 - 마스터만
CREATE OR REPLACE FUNCTION public.admin_update_request_status(
  p_request_id UUID,
  p_status TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'forbidden: master role required';
  END IF;

  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  UPDATE public.production_requests
  SET status = p_status, updated_at = now()
  WHERE id = p_request_id;
END;
$$;

-- GRANT 는 012 에서 이미 authenticated 로 부여돼 있다. 그대로 두고 함수 본문에서
-- 걸러낸다. EXECUTE 자체를 회수하면 마스터도 호출하지 못하므로 회수하지 않는다.

-- 검증 (일반 사용자 세션에서):
--   await supabase.rpc('admin_get_all_requests')
--   -> { code: 'P0001', message: 'forbidden: master role required' } 이면 정상
--
-- 주의: 이 검사는 profiles.role = 'master' 를 근거로 한다.
--       마스터 계정에 role 이 설정돼 있지 않으면 관리자 콘솔의 의뢰 관리 탭이
--       동작하지 않는다. 016 의 주석 또는 docs/SECURITY_REVIEW.md 참조.
