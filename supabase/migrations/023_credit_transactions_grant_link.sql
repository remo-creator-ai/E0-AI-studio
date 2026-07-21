-- 023: credit_transactions 지급 타입 확장 + 신청 연결
--
-- PRD §11.2 요구사항을 반영한다:
--   - 마스터 지급 누계는 type='manual_grant' 양수 거래의 합으로 계산
--   - 가입 보너스는 type='signup_bonus' 로 구분해 누계에서 제외
--   - 신청(§9.7)에서 파생된 지급은 related_request_id 로 원 신청을 참조
--
-- 그러나 011_credit_transactions.sql 의 CHECK 는
--   ('deduct','refund','subscription_refresh','manual','bonus')
-- 로 manual_grant / signup_bonus 를 허용하지 않는다. 여기서 확장한다.
--
-- 선행: 011(credit_transactions), 022(credit_requests).

-- 1) type CHECK 확장 (기존 값 유지 + PRD 타입 추가)
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'deduct', 'refund', 'subscription_refresh', 'manual', 'bonus',  -- 기존(레거시 호환)
    'manual_grant',   -- 마스터 지급(직접+신청 승인). 60,000 pool 누계 집계 대상
    'signup_bonus'    -- 가입 20크레딧. 누계에서 제외
  ));

-- 2) 신청 승인에서 파생된 지급을 원 신청과 연결
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS related_request_id UUID
    REFERENCES public.credit_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_type
  ON public.credit_transactions (type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_related_request
  ON public.credit_transactions (related_request_id)
  WHERE related_request_id IS NOT NULL;

-- 마스터 지급 누계(§10.1) = SUM(amount) WHERE type='manual_grant' AND amount > 0.
-- 이 집계와 60,000 한도 검증을 수행하는 원자적 지급 RPC(master_grant_credit)는
-- §9.7 기능 구현 단계에서 추가한다. 이 마이그레이션은 저장 스키마만 확정한다.
