ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_stage TEXT;

-- 002 에서 만든 함수와 리턴타입이 달라서 CREATE OR REPLACE 불가 → DROP 후 재생성
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
  thumbnail TEXT,
  current_stage TEXT
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
    p.thumbnail,
    p.current_stage
  FROM projects p
  WHERE p.user_id = p_user_id
  ORDER BY p.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
