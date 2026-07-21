-- 027: 자산 파일 (user_asset_files) — PRD §9.3 / §11.1
--
-- 캐릭터·제품은 대표(primary) 1장 + 참고(reference) 최대 4장, 로고·일반은 원본 1장.
-- 개수 제약은 앱에서 검증(DB 는 유연). 실제 바이너리는 Storage(029), 여기엔 경로만.
--
-- 선행: 026(user_assets).

CREATE TABLE IF NOT EXISTS public.user_asset_files (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id      UUID NOT NULL REFERENCES public.user_assets(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,                        -- user-assets 버킷 내 경로
  file_role     TEXT NOT NULL DEFAULT 'reference' CHECK (file_role IN ('primary', 'reference')),
  sort_order    INTEGER NOT NULL DEFAULT 0,           -- 참고 이미지 순서
  mime_type     TEXT,
  file_size     INTEGER,
  source_prompt TEXT,                                 -- AI 생성 파일일 때 선택적 출처
  source_model  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_asset_files_asset ON public.user_asset_files (asset_id);

ALTER TABLE public.user_asset_files ENABLE ROW LEVEL SECURITY;

-- 소유 자산에 속한 파일만 접근. asset_id 를 통해 user_assets.owner_id 로 소유권 검사.
DROP POLICY IF EXISTS "Users manage own asset files" ON public.user_asset_files;
CREATE POLICY "Users manage own asset files"
  ON public.user_asset_files FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_assets a
    WHERE a.id = user_asset_files.asset_id AND a.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_assets a
    WHERE a.id = user_asset_files.asset_id AND a.owner_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_asset_files TO authenticated;
