-- Migration: Add thumbnail column and RPC for lightweight project summaries
-- Purpose: Avoid loading full project data (including large base64 images) on Dashboard

-- Add thumbnail column for small preview images (~10-20KB JPEG)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON public.projects (user_id, updated_at DESC);

-- RPC function: returns lightweight project summaries without scenes/grid_images blobs
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
