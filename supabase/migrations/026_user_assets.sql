-- 026: 개인 자산 본체 (user_assets) — PRD §9.3 / §11.1
--
-- 사용자별로 완전히 분리되는 크리에이티브 자산(캐릭터·제품·로고·일반 이미지).
-- 파일은 user_asset_files(027), 프로젝트 연결은 project_assets(028) 에서 관리.
--
-- 선행: 001(update_updated_at 트리거 함수).

CREATE TABLE IF NOT EXISTS public.user_assets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type  TEXT NOT NULL CHECK (asset_type IN ('character', 'product', 'logo', 'image')),
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload', 'generated')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_assets_owner       ON public.user_assets (owner_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_owner_type  ON public.user_assets (owner_id, asset_type);

-- updated_at 자동 갱신(001 의 공용 트리거 함수 재사용)
DROP TRIGGER IF EXISTS user_assets_updated_at ON public.user_assets;
CREATE TRIGGER user_assets_updated_at
  BEFORE UPDATE ON public.user_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.user_assets ENABLE ROW LEVEL SECURITY;

-- 본인 소유 자산만 조회·생성·수정·삭제 (ASSET-01/12). 마스터도 타인 자산 접근 불가(§12).
DROP POLICY IF EXISTS "Users manage own assets" ON public.user_assets;
CREATE POLICY "Users manage own assets"
  ON public.user_assets FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_assets TO authenticated;
