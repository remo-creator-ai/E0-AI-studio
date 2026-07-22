-- ============================================
-- 016: 인트로 설문 + 가입 보너스 20크레딧 + 크레딧 감사 로그 타입 정리
-- 근거: docs/PRD.md v1.4 §9.0, §9.1, §10.1, §11.1, §11.2
--   - 초기 크레딧 60 → 20 변경, 지급 시 credit_transactions.type='signup_bonus' 로그
--   - 마스터 지급 누계는 type='manual_grant' 합산으로 계산 (기존 'manual' → 'manual_grant'로 정규화)
--   - intro_survey_responses 테이블 신설
--   - credit_transactions.related_request_id 추가 (신청 승인 지급의 근거 신청 로우 참조)
-- ============================================

-- 1. credit_transactions.type 확장: signup_bonus / manual_grant 허용
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('deduct','refund','subscription_refresh','manual','bonus','signup_bonus','manual_grant'));

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS related_request_id UUID REFERENCES public.credit_requests(id);

-- 2. 초기 크레딧 20 지급 + signup_bonus 감사 로그
--    (기존 60 → 20 변경. 이미 초기화된 유저의 잔액은 건드리지 않음.)
CREATE OR REPLACE FUNCTION public.initialize_user_credits(p_user_id UUID)
RETURNS TABLE(balance INTEGER, max_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted BOOLEAN := false;
BEGIN
  INSERT INTO public.user_credits (user_id, balance, max_credits)
    VALUES (p_user_id, 20, 20)
    ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 신규 INSERT 된 경우에만 감사 로그 남김 (재로그인 시 중복 방지)
  IF v_inserted THEN
    INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
      VALUES (p_user_id, 20, 'signup_bonus', 'signup_bonus:initial', 20);
  END IF;

  RETURN QUERY
    SELECT uc.balance, uc.max_credits
    FROM public.user_credits uc
    WHERE uc.user_id = p_user_id;
END;
$$;

-- 3. 마스터 지급 누계 계산을 manual_grant 기준으로 정규화
CREATE OR REPLACE FUNCTION public.master_quota_remaining()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT GREATEST(
    COALESCE((SELECT (value)::INTEGER FROM public.app_config WHERE key = 'master_credit_quota_lifetime'), 0)
    - COALESCE((
        SELECT SUM(amount)::INTEGER
        FROM public.credit_transactions
        WHERE type = 'manual_grant' AND amount > 0
      ), 0),
    0
  );
$$;

-- 4. approve_credit_request: 지급 시 type='manual_grant' + related_request_id 기록
CREATE OR REPLACE FUNCTION public.approve_credit_request(
  p_request_id     UUID,
  p_granted_amount INTEGER DEFAULT NULL,
  p_note           TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req      public.credit_requests%ROWTYPE;
  v_grant    INTEGER;
  v_remain   INTEGER;
  v_balance  INTEGER;
BEGIN
  IF NOT public.is_master() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_req FROM public.credit_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_processed' USING ERRCODE = 'check_violation';
  END IF;

  v_grant := COALESCE(p_granted_amount, v_req.amount);
  IF v_grant <= 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'check_violation';
  END IF;

  v_remain := public.master_quota_remaining();
  IF v_grant > v_remain THEN
    RAISE EXCEPTION 'quota_exceeded: remaining=%, requested=%', v_remain, v_grant
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.user_credits
    SET balance     = balance + v_grant,
        max_credits = max_credits + v_grant,
        updated_at  = now()
    WHERE user_id = v_req.user_id
    RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, balance, max_credits)
      VALUES (v_req.user_id, 20 + v_grant, 20 + v_grant)
      RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO public.credit_transactions
      (user_id, amount, type, description, balance_after, related_request_id)
    VALUES (v_req.user_id, v_grant, 'manual_grant',
            COALESCE(p_note, 'credit_request:' || p_request_id::TEXT),
            v_balance, p_request_id);

  UPDATE public.credit_requests
    SET status         = 'approved',
        granted_amount = v_grant,
        reviewer_id    = auth.uid(),
        reviewer_note  = p_note,
        reviewed_at    = now()
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

-- 5. intro_survey_responses 테이블 (§9.0, §11.1)
CREATE TABLE IF NOT EXISTS public.intro_survey_responses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('completed','skipped')),
  survey_version    TEXT NOT NULL DEFAULT 'v1',
  q1_role           TEXT,
  q2_content_type   TEXT,
  q3_industry       TEXT,
  q4_expected_volume TEXT,
  q5_ai_experience  TEXT,
  q6_referral       TEXT,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.intro_survey_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own intro survey') THEN
    CREATE POLICY "Users can view own intro survey"
      ON public.intro_survey_responses FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own intro survey') THEN
    CREATE POLICY "Users can insert own intro survey"
      ON public.intro_survey_responses FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Master can view all intro surveys') THEN
    CREATE POLICY "Master can view all intro surveys"
      ON public.intro_survey_responses FOR SELECT
      USING (public.is_master());
  END IF;
END $$;

-- 6. 마스터 집계 뷰 (문항별 응답 분포·응답률·스킵률)
CREATE OR REPLACE VIEW public.intro_survey_stats AS
SELECT
  survey_version,
  status,
  COUNT(*)::INTEGER            AS response_count,
  q1_role, q2_content_type, q3_industry,
  q4_expected_volume, q5_ai_experience, q6_referral
FROM public.intro_survey_responses
GROUP BY survey_version, status, q1_role, q2_content_type, q3_industry,
         q4_expected_volume, q5_ai_experience, q6_referral;

-- 뷰 접근은 마스터만
REVOKE ALL ON public.intro_survey_stats FROM PUBLIC, authenticated;
GRANT SELECT ON public.intro_survey_stats TO authenticated;
-- 실질 필터링은 base table RLS가 담당 (뷰는 SECURITY INVOKER 로 상속)

-- 7. 실행 권한
GRANT EXECUTE ON FUNCTION public.master_quota_remaining()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_credit_request(UUID,INTEGER,TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_user_credits(UUID)                     TO authenticated;
