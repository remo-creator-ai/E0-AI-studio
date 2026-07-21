-- 025: RLS 로 직접 접근하는 신규 테이블에 authenticated CRUD 권한 부여
--
-- RLS 정책은 "행" 수준 제한이고, 테이블 접근 자체에는 별도의 GRANT 가 필요하다.
-- 019~022 의 테이블들은 클라이언트가 RPC 가 아니라 supabase.from('...') 로 직접
-- 접근한다(동의 기록·설문·크레딧 신청). GRANT 가 없으면 RLS 통과 이전에
-- "permission denied for table ..." 로 막힌다.
--
-- 참고: user_credits/credit_transactions 등 기존 테이블은 SECURITY DEFINER RPC 로만
-- 접근해 이 GRANT 가 필요 없었다. 실제 Supabase 환경은 authenticated 에 기본 GRANT 를
-- 주는 경우가 많지만, 이식성을 위해 명시한다(중복 GRANT 는 무해).
--
-- DELETE 는 부여하지 않는다(어느 테이블도 행 삭제를 앱 경로로 허용하지 않음).

GRANT SELECT, INSERT         ON public.consent_history          TO authenticated;
GRANT SELECT, INSERT         ON public.intro_survey_responses   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.signup_requests          TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.credit_requests          TO authenticated;

-- 실제 행 제한은 각 테이블의 RLS 정책이 담당한다(019~022).
