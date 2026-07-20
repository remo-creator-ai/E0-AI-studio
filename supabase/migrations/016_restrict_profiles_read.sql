-- 016: profiles 전체 조회 정책 축소 + 공개 프로필 전용 RPC
--
-- 문제: 006_original_creator.sql 이 아래 정책을 만들었다.
--         CREATE POLICY "Authenticated users can read profiles"
--           ON public.profiles FOR SELECT TO authenticated USING (true);
--       PERMISSIVE 정책은 OR 로 결합되므로, 이 한 줄이 013 의 마스터 전용
--       SELECT 정책을 무의미하게 만들고 "로그인한 누구나 전체 profiles 조회"를
--       허용한다. 즉 가입자 전원의 email/display_name/avatar_url 덤프가 가능하다:
--         supabase.from('profiles').select('*')
--
--       발급계정 시절엔 감수 가능했으나 구글 셀프가입(3d65b7b) 이후에는
--       개인정보 유출 경로다.
--
-- 원래 이 정책이 필요했던 이유: 프로젝트 "원 제작자" 표시.
--   services/projectService.ts 가 남의 profiles row 에서 display_name/avatar_url 을
--   읽는다. 정책만 지우면 이 기능이 깨지므로, 필요한 두 컬럼만 노출하는
--   SECURITY DEFINER RPC 를 대신 제공한다.
--
-- ⚠️ 이 마이그레이션은 코드 변경과 반드시 함께 적용해야 한다.
--    services/projectService.ts 가 .from('profiles') 대신 get_public_profile() 을
--    호출하도록 바뀌어 있어야 한다. 짝이 맞지 않으면 제작자 이름이 표시되지 않는다.

-- 1. 공개 프로필 RPC (email 은 반환하지 않는다)
CREATE OR REPLACE FUNCTION public.get_public_profile(p_user_id UUID)
RETURNS TABLE(display_name TEXT, avatar_url TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(UUID) TO authenticated;

-- 2. 전체 조회 정책 제거
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;

-- 이후 profiles SELECT 를 허용하는 정책은 다음 둘만 남는다:
--   schema.sql  : "Users can view own profile"   (auth.uid() = id)
--   013_roles   : "Master can view all profiles" (public.is_master())
--
-- 결과적으로 관리자 콘솔의 계정 목록(services/masterService.ts 의 profiles 조회)은
-- 마스터의 profiles.role = 'master' 가 실제로 설정돼 있어야 동작한다.
-- 설정 방법 (대상자가 구글로 최소 1회 로그인한 뒤 SQL Editor 에서 1회 실행):
--   UPDATE public.profiles SET role = 'master'
--   WHERE lower(email) = lower('<마스터 구글 이메일>');

-- 검증:
--   일반 사용자 세션에서
--     await supabase.from('profiles').select('*')        -> 본인 1행만
--     await supabase.rpc('get_public_profile', { p_user_id: '<타인 uuid>' })
--                                                        -> display_name/avatar_url 반환
--   마스터 세션에서
--     await supabase.from('profiles').select('*')        -> 전체 반환
