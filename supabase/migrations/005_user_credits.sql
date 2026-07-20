-- ============================================
-- 005: User Credits Table + RPC Functions
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================

-- 1. user_credits 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER NOT NULL DEFAULT 60,
  max_credits INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS 활성화
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- 3. 본인 크레딧만 조회 가능
DROP POLICY IF EXISTS "Users can read own credits" ON public.user_credits;
CREATE POLICY "Users can read own credits"
  ON public.user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- 4. 크레딧 초기화 (첫 로그인 시 호출, INSERT OR SELECT)
CREATE OR REPLACE FUNCTION public.initialize_user_credits(p_user_id UUID)
RETURNS TABLE(balance INTEGER, max_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, balance, max_credits)
  VALUES (p_user_id, 60, 60)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT uc.balance, uc.max_credits
  FROM public.user_credits uc
  WHERE uc.user_id = p_user_id;
END;
$$;

-- 5. 크레딧 차감 (원자적 연산, 잔액 부족 시 -1 반환)
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE public.user_credits
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = p_user_id AND balance >= p_amount
  RETURNING balance INTO new_balance;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN new_balance;
END;
$$;

-- 6. 기존 유저에게도 크레딧 row 생성 (이미 가입된 유저용)
INSERT INTO public.user_credits (user_id, balance, max_credits)
SELECT id, 60, 60 FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_credits)
ON CONFLICT (user_id) DO NOTHING;
