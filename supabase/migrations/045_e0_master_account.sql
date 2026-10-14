-- E0: 리모비디오 계정(remoimagevideo@gmail.com)을 마스터로 지정한다.
-- 마스터만 admin_config(API 키)를 쓸 수 있으므로(030), 관리자 화면의
-- API 키 입력이 이 계정에서 동작하게 된다.
-- 클라이언트 메타데이터로는 권한을 줄 수 없다는 044 원칙은 유지한다 —
-- 마스터 여부는 서버 쪽 이메일 고정값으로만 결정한다.

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
    CASE WHEN lower(NEW.email) = 'remoimagevideo@gmail.com' THEN 'master' ELSE 'user' END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 이미 가입돼 있다면 바로 승격한다.
UPDATE public.profiles
SET role = 'master', status = 'active'
WHERE lower(email) = 'remoimagevideo@gmail.com';
