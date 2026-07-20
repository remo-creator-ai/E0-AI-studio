-- 018: 구버전 deduct_credits(UUID, INTEGER) 제거
--
-- 005:43 이 2인자 버전을, 011:30 이 3인자 버전을 만든다. 시그니처가 달라
-- CREATE OR REPLACE 로 대체되지 않고 **오버로드로 공존**해 왔다.
--
-- 문제 1 (잠재 장애): 3인자 버전의 p_description 에 DEFAULT '' 가 있어
--   deduct_credits(uuid, integer) 호출이 두 함수 모두에 매칭된다.
--   -> PGRST203 "could not choose the best candidate function"
--   현재 store/creditStore.ts:83-87 이 항상 3개를 넘겨서 드러나지 않을 뿐이다.
--
-- 문제 2 (데이터 정합): 구버전은 credit_transactions 에 기록을 남기지 않는다.
--   실수로 구버전이 호출되면 잔액은 줄지만 사용 이력에 안 남는다.
--
-- 호출부 확인: store/creditStore.ts 의 deduct_credits / refund_credits 호출은
-- 모두 p_description 을 포함한다. 2인자 호출은 코드베이스에 없다.

DROP FUNCTION IF EXISTS public.deduct_credits(UUID, INTEGER);

-- 검증:
--   SELECT p.oid::regprocedure
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'deduct_credits';
--   -> deduct_credits(uuid,integer,text) 1행만 남아야 정상
