-- Migration: Add thumbnail column and RPC for lightweight project summaries
-- Purpose: Avoid loading full project data (including large base64 images) on Dashboard

-- Add thumbnail column for small preview images (~10-20KB JPEG)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON public.projects (user_id, updated_at DESC);

-- RPC function: returns lightweight project summaries without scenes/grid_images blobs
-- 재실행 안전성: 이 함수는 003/006 에서 반환 컬럼 수가 늘어난다. 이미 상위
-- 버전이 적용된 DB 에 002 를 다시 실행하면 10컬럼으로 되돌리려다
--   42P13 cannot change return type
-- 로 실패한다. 선행 DROP 으로 회피 (프레시 DB 에서는 무해).
DROP FUNCTION IF EXISTS get_project_summaries(UUID);
CREATE OR REPLACE FUNCTION get_project_summaries(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  style TEXT,
  duration INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  scenes_count INTEGER,
  images_done INTEGER,
  videos_done INTEGER,
  thumbnail TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.style,
    p.duration,
    p.created_at,
    p.updated_at,
    COALESCE(jsonb_array_length(p.scenes), 0)::INTEGER AS scenes_count,
    (SELECT count(*)::INTEGER FROM jsonb_array_elements(p.scenes) elem
     WHERE elem->>'image_url' IS NOT NULL AND elem->>'image_url' != '') AS images_done,
    (SELECT count(*)::INTEGER FROM jsonb_array_elements(p.scenes) elem
     WHERE elem->>'video_url' IS NOT NULL AND elem->>'video_url' != '') AS videos_done,
    p.thumbnail
  FROM projects p
  WHERE p.user_id = p_user_id
  ORDER BY p.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
