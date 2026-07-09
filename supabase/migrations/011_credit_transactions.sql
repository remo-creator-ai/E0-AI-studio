-- ============================================
-- 011: Credit Transactions Audit Log
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================

-- 1. credit_transactions 테이블 생성
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deduct', 'refund', 'subscription_refresh', 'manual', 'bonus')),
  description TEXT,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Index
CREATE INDEX idx_credit_transactions_user_id ON public.credit_transactions (user_id);
CREATE INDEX idx_credit_transactions_created_at ON public.credit_transactions (created_at DESC);

-- 4. Update deduct_credits to log transaction
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id UUID, p_amount INTEGER, p_description TEXT DEFAULT '')
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

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, -p_amount, 'deduct', p_description, new_balance);

  RETURN new_balance;
END;
$$;

-- 5. Add refund_credits function
CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id UUID, p_amount INTEGER, p_description TEXT DEFAULT '')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  UPDATE public.user_credits
  SET balance = balance + p_amount, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO new_balance;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, p_amount, 'refund', p_description, new_balance);

  RETURN new_balance;
END;
$$;
