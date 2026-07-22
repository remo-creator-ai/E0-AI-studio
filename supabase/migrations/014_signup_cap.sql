-- ============================================
-- 014: 가입 상한(cap) + 앱 전역 설정 테이블 (app_config)
-- 근거: docs/PRD.md §2, §3.1, §7.3-#1
--   - 사용자(role='user') 최대 30명 (변경 가능)
--   - 마스터(role='master')는 카운트 제외
--   - masters 테이블 대신 app_config 단일 로우로 관리
-- ============================================

-- 1. app_config: 키/값 전역 설정 (단일 인스턴스 관제 목적)
CREATE TABLE IF NOT EXISTS public.app_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 조회: 로그인 사용자 누구나 (상한 표시 목적)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone authed can read app_config') THEN
    CREATE POLICY "Anyone authed can read app_config"
      ON public.app_config FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Master can write app_config') THEN
    CREATE POLICY "Master can write app_config"
      ON public.app_config FOR ALL
      USING (public.is_master())
      WITH CHECK (public.is_master());
  END IF;
END $$;

-- 2. 기본값 시드 (없을 때만)
INSERT INTO public.app_config (key, value, description)
VALUES
  ('user_capacity', to_jsonb(30), '동시 활성 사용자(role=user, status=active) 상한'),
  ('master_credit_quota_lifetime', to_jsonb(60000), '마스터가 평생 부여 가능한 크레딧 누계 (부여 누계 방식)')
ON CONFLICT (key) DO NOTHING;

-- 3. 가입 시 상한 게이트 (auth.users insert 트리거로 profiles 생성 직전에는 카운트가
--    아직 반영 안 됐으므로 profiles insert 전 트리거로 직접 검사)
CREATE OR REPLACE FUNCTION public.enforce_user_capacity()
RETURNS TRIGGER AS $$
DECLARE
  cap   INTEGER;
  cnt   INTEGER;
  role  TEXT;
BEGIN
  role := COALESCE(NEW.role, 'user');
  -- 마스터는 상한 카운트 제외
  IF role = 'master' THEN
    RETURN NEW;
  END IF;

  SELECT (value)::INTEGER INTO cap FROM public.app_config WHERE key = 'user_capacity';
  IF cap IS NULL THEN
    cap := 30;
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM public.profiles
  WHERE role = 'user' AND status = 'active';

  IF cnt >= cap THEN
    RAISE EXCEPTION 'signup_cap_reached: user capacity of % has been reached', cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_user_capacity_on_profiles ON public.profiles;
CREATE TRIGGER enforce_user_capacity_on_profiles
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_capacity();
