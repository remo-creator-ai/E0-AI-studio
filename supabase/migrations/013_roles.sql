-- ============================================
-- 013: 역할 기반 계정 모델 (master / 발급계정 user)
-- 근거: docs/AUTH_MODEL_TRANSITION.md
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================

-- 1. profiles 에 role / login_id / status 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'master'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_id TEXT UNIQUE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

-- 2. 현재 로그인 사용자가 마스터인지 판별 (SECURITY DEFINER 로 RLS 우회 → 재귀 방지)
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'master'
  );
$$;

-- 3. 가입 트리거 갱신: user_metadata 의 login_id / role 반영 (없으면 기본 user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url, login_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'login_id'
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'login_id',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 마스터는 모든 프로필 조회/수정 가능 (계정 관리용)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Master can view all profiles' AND tablename = 'profiles') THEN
    CREATE POLICY "Master can view all profiles"
      ON public.profiles FOR SELECT
      USING (public.is_master());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Master can update profiles' AND tablename = 'profiles') THEN
    CREATE POLICY "Master can update profiles"
      ON public.profiles FOR UPDATE
      USING (public.is_master());
  END IF;
END $$;

-- 5. 마스터 계정 프로비저닝 (수동)
-- 리모가 구글로 최초 로그인해 profiles row 가 생성된 뒤, 아래를 1회 실행:
--   UPDATE public.profiles SET role = 'master'
--   WHERE email = '<마스터 구글 이메일>';
-- (VITE_ADMIN_EMAIL 과 동일 이메일 권장)

-- 6. (선택) 관리자 RPC 들이 이메일 대신 role 기반으로 동작하도록
--    admin_get_all_requests / admin_update_request_status 내부 검사도
--    public.is_master() 로 교체 권장 — 별도 마이그레이션에서 처리.
