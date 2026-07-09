-- ============================================
-- 006: Original Creator Tracking
-- ============================================

-- 1. Add original_creator_id column
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS original_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Backfill: existing projects → creator = current owner
UPDATE public.projects SET original_creator_id = user_id WHERE original_creator_id IS NULL;

-- 3. Auto-fill on INSERT via trigger
CREATE OR REPLACE FUNCTION set_original_creator()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.original_creator_id IS NULL THEN
    NEW.original_creator_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_original_creator ON public.projects;
CREATE TRIGGER trg_set_original_creator
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION set_original_creator();

-- 4. Allow any logged-in user to read profiles (needed for creator display)
-- Drop if exists to be idempotent
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read profiles' AND tablename = 'profiles'
  ) THEN
    DROP POLICY "Authenticated users can read profiles" ON public.profiles;
  END IF;
END $$;

CREATE POLICY "Authenticated users can read profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

-- 5. Update get_project_summaries RPC to include creator info
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
  current_stage TEXT,
  original_creator_id UUID,
  creator_display_name TEXT,
  creator_avatar_url TEXT
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
    p.current_stage,
    p.original_creator_id,
    prof.display_name AS creator_display_name,
    prof.avatar_url AS creator_avatar_url
  FROM projects p
  LEFT JOIN profiles prof ON prof.id = p.original_creator_id
  WHERE p.user_id = p_user_id
  ORDER BY p.updated_at DESC;
END;
$$ LANGUAGE plpgsql;
