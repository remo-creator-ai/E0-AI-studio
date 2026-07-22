-- 022: admin_config 테이블 복구 (통합 과정 누락분)
--
-- 배경:
--   코드는 이 테이블을 읽는다 — services/adminConfigService.ts(:21,:40,:58),
--   services/geminiService.ts(:19), services/klingService.ts(:40-41),
--   components/ProductionStep.tsx(:101), components/AdminPage.tsx, types/database.ts(:95).
--   그런데 로컬↔원격 통합(db8f59c) 과정에서 이 테이블을 만드는 SQL 이 유실되어
--   `supabase/` 전체에 admin_config DDL 이 한 줄도 남지 않았고, 운영 DB 에도 없다.
--   그 결과 Gemini/Kling 호출과 관리자 콘솔 "API 키" 탭이 전부 실패한다.
--
--   이 마이그레이션은 그 회귀를 되돌린다. 스키마는 adminConfigService 의
--   upsert({ key, value, updated_at }) 시그니처에 맞춘다.

CREATE TABLE IF NOT EXISTS public.admin_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

-- ⚠️⚠️ 보안 경고 — 아래 정책은 로그인한 모든 사용자에게 SELECT/INSERT/UPDATE 를 허용한다.
--
-- 이 테이블에는 gemini_api_key / kling_access_key_id / kling_access_key_secret 이
-- 들어 있다. 구글 셀프가입이 열려 있으므로(app_config.user_capacity=30 한도 내)
-- **가입한 사용자 누구나 API 키를 읽고 덮어쓸 수 있다.**
--
-- 그럼에도 여기서 좁히지 않는 이유: AI 호출이 브라우저에서 일어나고 브라우저가
-- 직접 키를 읽는 구조라(geminiService.ts, klingService.ts), 지금 is_master() 전용으로
-- 잠그면 일반 사용자의 AI 기능이 전부 중단된다. 즉 이 정책은 "현재 코드 구조의
-- 재현"이지 권장 설정이 아니다.
--
-- 올바른 해결 순서:
--   1) Edge Function 프록시 신설 (키를 Function Secret 으로 이전)
--   2) 클라이언트에서 getAdminConfig('*_key') 호출 제거
--   3) 그 다음 아래 정책을 is_master() 기반으로 교체 (이 파일 수정 말고 새 마이그레이션으로)
--   4) 기존 Gemini/Kling 키 폐기 후 재발급

DROP POLICY IF EXISTS "Authenticated users can read admin_config"   ON public.admin_config;
DROP POLICY IF EXISTS "Authenticated users can upsert admin_config" ON public.admin_config;
DROP POLICY IF EXISTS "Authenticated users can update admin_config" ON public.admin_config;

CREATE POLICY "Authenticated users can read admin_config"
  ON public.admin_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert admin_config"
  ON public.admin_config FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update admin_config"
  ON public.admin_config FOR UPDATE TO authenticated USING (true);

-- 키 값은 커밋하지 않는다. 적용 후 관리자 콘솔의 "API 키" 탭에서 입력하거나
-- SQL Editor 에서 직접 INSERT 할 것.
