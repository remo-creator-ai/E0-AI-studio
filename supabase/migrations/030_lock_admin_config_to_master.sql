-- 030: admin_config 를 마스터 전용으로 잠금 (보안 5단계)
--
-- 022 에서 이 테이블을 복구할 때 "로그인한 누구나 읽고 쓰기" 정책을 그대로 뒀다.
-- 브라우저가 직접 키를 읽어 Google 을 호출하는 구조였기 때문에, 그때 좁혔다면
-- 일반 사용자의 AI 기능이 전부 중단됐을 것이다.
--
-- 이제 그 전제가 사라졌다:
--   - Gemini 호출은 ai-proxy Edge Function 을 경유한다. 프록시가 service role 로
--     이 테이블을 읽으므로 RLS 를 우회하며, 키는 서버 안에서만 오간다.
--   - 관리자 콘솔은 값을 조회하지 않고 "설정됨/미설정"만 표시하는 쓰기 전용으로
--     바뀌었다(services/adminConfigService.ts getConfiguredKeys).
-- 따라서 정책을 마스터 전용으로 좁혀도 일반 사용자 기능에 영향이 없다.
--
-- ⚠️ 알려진 영향: services/klingService.ts 는 아직 브라우저에서
--    kling_access_key_id/secret 을 읽는다. 이 잠금 이후 일반 사용자에게는 null 이
--    되어 Kling 영상 생성이 불가능해진다. 현재 Kling 키는 admin_config 에 등록조차
--    돼 있지 않아 이미 동작하지 않으며, 영상 제작을 사용하지 않기로 해서 감수한다.
--    Kling 을 쓰게 되면 Gemini 와 같은 방식으로 프록시에 태워야 한다.

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

-- 022 의 개방 정책 제거
DROP POLICY IF EXISTS "Authenticated users can read admin_config"   ON public.admin_config;
DROP POLICY IF EXISTS "Authenticated users can upsert admin_config" ON public.admin_config;
DROP POLICY IF EXISTS "Authenticated users can update admin_config" ON public.admin_config;

-- 마스터 전용. service role 은 RLS 를 적용받지 않으므로 프록시는 그대로 동작한다.
DROP POLICY IF EXISTS "Master manages admin_config" ON public.admin_config;
CREATE POLICY "Master manages admin_config"
  ON public.admin_config FOR ALL TO authenticated
  USING (public.is_master())
  WITH CHECK (public.is_master());

-- 검증:
--   SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname='public' AND tablename='admin_config';
--   -- 일반 사용자 세션에서 SELECT 시 0건이어야 한다.
