-- 031: 사용자 커스텀 비주얼 스타일 (user_custom_styles)
--
-- 목적:
--   이미지 생성 화면(ImageStudio)과 스토리보드 만들기(VisualizingStep)에서 노출되는
--   VisualStyle 10 프리셋(constants.STYLE_PROMPT_GUIDES) 외에, 사용자 개인이 자신만의
--   스타일 프리셋을 등록해 두고 재사용할 수 있도록 한다.
--
-- 정책:
--   - 완전 개인용: 다른 사용자에게 공유되지 않는다 (팀 공용은 후속 마이그레이션에서 별표 처리).
--   - 사용자당 최대 10개 (서비스 레이어에서 강제, DB 는 무제한 허용).
--
-- 선행: 001(update_updated_at 트리거 함수).

CREATE TABLE IF NOT EXISTS public.user_custom_styles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  icon_emoji    TEXT NOT NULL DEFAULT '🎨',
  prompt_guide  TEXT NOT NULL,          -- Gemini 프롬프트 앞에 프리픽스로 합성될 문구
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 목록 조회는 owner_id + sort_order 로 정렬한다.
CREATE INDEX IF NOT EXISTS idx_user_custom_styles_owner
  ON public.user_custom_styles (owner_id, sort_order);

-- updated_at 자동 갱신 (001 의 공용 트리거 함수 재사용)
DROP TRIGGER IF EXISTS user_custom_styles_updated_at ON public.user_custom_styles;
CREATE TRIGGER user_custom_styles_updated_at
  BEFORE UPDATE ON public.user_custom_styles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.user_custom_styles ENABLE ROW LEVEL SECURITY;

-- 본인 소유 스타일만 조회·생성·수정·삭제. 마스터도 타인 스타일 접근 불가.
DROP POLICY IF EXISTS "Users manage own custom styles" ON public.user_custom_styles;
CREATE POLICY "Users manage own custom styles"
  ON public.user_custom_styles FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_custom_styles TO authenticated;
