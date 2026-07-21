-- 028: 프로젝트-자산 연결 (project_assets) — PRD §9.5 / §11.1
--
-- 영상 프로젝트에 활성 자산을 연결(프로젝트당 최대 3개는 앱에서 검증). 스토리보드
-- 이미지 생성 시 연결 자산의 대표·참고 이미지를 레퍼런스로 전달하는 근거.
--
-- 선행: projects(001), user_assets(026).

CREATE TABLE IF NOT EXISTS public.project_assets (
  project_id UUID NOT NULL REFERENCES public.projects(id)     ON DELETE CASCADE,
  asset_id   UUID NOT NULL REFERENCES public.user_assets(id)  ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project ON public.project_assets (project_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_asset   ON public.project_assets (asset_id);

ALTER TABLE public.project_assets ENABLE ROW LEVEL SECURITY;

-- 자기 프로젝트의 연결만 관리. project_id 를 통해 projects.user_id 로 소유권 검사.
-- (연결되는 asset 도 본인 소유여야 하지만, user_assets RLS 가 asset 조회를 이미
--  본인 것으로 제한하므로 앱에서 자기 자산만 연결하게 된다.)
DROP POLICY IF EXISTS "Users manage own project assets" ON public.project_assets;
CREATE POLICY "Users manage own project assets"
  ON public.project_assets FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_assets.project_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_assets.project_id AND p.user_id = auth.uid()
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_assets TO authenticated;
