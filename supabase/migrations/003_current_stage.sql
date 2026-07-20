ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_stage TEXT;

-- 002 는 이 함수를 10컬럼 RETURNS TABLE 로 만들고, 여기서 11컬럼으로 늘린다.
-- RETURNS TABLE 의 출력 컬럼은 반환 타입의 일부라, DROP 없이 CREATE OR REPLACE 하면
--   42P13 cannot change return type of existing function
-- 으로 실패한다. 004/006 은 선행 DROP 이 있는데 003 만 빠져 있었다.
-- 이 한 줄이 없으면 프레시 DB 에서 마이그레이션 체인이 여기서 멈춘다.
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
