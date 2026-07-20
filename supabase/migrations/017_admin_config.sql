-- 017: admin_config 테이블 (누락분 편입)
--
-- 이 테이블은 지금까지 레포에 SQL 이 없었다. 운영 DB 에는 대시보드에서 수동
-- 생성된 것으로 보이며, 그 결과 프레시 DB(로컬 `supabase db reset`, 신규 환경)
-- 에서는 테이블 자체가 없어 services/adminConfigService.ts 의 조회가 실패하고
-- Gemini/Kling 호출이 전부 죽는다.
--
-- 아래 DDL 은 docs/DEPLOYMENT.md:225-256 에 기록된 현재 운영 상태를 그대로 옮긴 것이다.
-- 즉 "지금 운영 DB 가 이렇게 돼 있다" 는 재현이지, 권장 설정이 아니다.

CREATE TABLE IF NOT EXISTS public.admin_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

-- ⚠️⚠️ 보안 경고 — DEV-001 (docs/DEV_ISSUES.md)
--
-- 아래 정책은 로그인한 모든 사용자에게 SELECT/INSERT/UPDATE 를 허용한다.
-- 이 테이블에는 gemini_api_key / kling_access_key_id / kling_access_key_secret 이
-- 들어 있으므로, 구글 셀프가입이 열린 현재 상태에서는
-- **아무나 가입해서 API 키를 읽고 덮어쓸 수 있다.**
--
-- 그럼에도 여기서 좁히지 않는 이유: AI 호출이 브라우저에서 일어나고 브라우저가
-- 직접 키를 읽는 구조라(services/geminiService.ts, klingService.ts),
-- 지금 master 전용으로 잠그면 일반 사용자의 AI 기능이 전부 중단된다.
--
-- 올바른 해결 순서는 docs/SECURITY_OPEN_SIGNUP.md §1 참조:
--   1) Edge Function 프록시 신설 (키를 Function Secret 으로 이전)
--   2) 클라이언트에서 getAdminConfig('*_key') 호출 제거
--   3) 그 다음에 아래 정책을 is_master() 로 교체
--   4) 기존 Gemini/Kling 키 폐기 후 재발급
--
-- 3) 단계용 SQL 은 SECURITY_OPEN_SIGNUP.md 에 준비돼 있다. 이 마이그레이션을
--    수정하지 말고 새 마이그레이션으로 교체할 것.

DROP POLICY IF EXISTS "Authenticated users can read admin_config"   ON public.admin_config;
DROP POLICY IF EXISTS "Authenticated users can upsert admin_config" ON public.admin_config;
DROP POLICY IF EXISTS "Authenticated users can update admin_config" ON public.admin_config;

CREATE POLICY "Authenticated users can read admin_config"
  ON public.admin_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert admin_config"
  ON public.admin_config FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update admin_config"
  ON public.admin_config FOR UPDATE TO authenticated USING (true);

-- 키 값은 커밋하지 않는다. 최초 배포 후 관리자 콘솔의 "API 키" 탭에서 입력하거나
-- SQL Editor 에서 직접 INSERT 할 것 (docs/DEPLOYMENT.md 참조).
