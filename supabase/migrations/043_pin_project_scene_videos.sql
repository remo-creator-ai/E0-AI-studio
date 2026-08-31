-- 043: 프로젝트 씬 영상을 히스토리 자동 정리에서 제외 (pinned)
--
-- 배경 (씬 영상 다운로드가 빈 zip 으로 내려가던 원인):
--   Mode B 의 씬 영상은 video-history 버킷에만 보관되고, project.scenes[].video_url
--   은 그 버킷의 signed URL 을 가리킨다. 그런데 이 버킷에는 자동 정리가 둘 있다.
--     · 30일 TTL           — 035 의 pg_cron
--     · 사용자당 100편 상한 — videoHistoryService.trimToLimit (저장할 때마다 실행)
--   즉 영상을 100편 넘게 만들거나 30일이 지나면, 완성된 프로젝트의 씬 영상 원본이
--   조용히 삭제된다. 그 뒤 프로젝트를 열면 signed URL 재발급이 404 로 실패하고
--   재생·개별 다운로드·배치 zip 이 전부 깨진다.
--
--   씬 영상은 "생성 히스토리" 가 아니라 프로젝트 산출물이므로 정리 대상에서 뺀다.
--   pinned = true 인 row 는 TTL cron 도, 100편 상한 트리밍도 건드리지 않는다.

ALTER TABLE public.video_generation_history
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.video_generation_history.pinned IS
  '프로젝트 씬 영상 등 자동 정리(30일 TTL · 100편 상한)에서 제외할 항목';

-- 트리밍 쿼리(owner_id + pinned=false 를 created_at DESC 로 정렬) 대응 인덱스
CREATE INDEX IF NOT EXISTS idx_video_history_owner_pinned
  ON public.video_generation_history (owner_id, pinned, created_at DESC);

-- ── TTL cron 함수 교체: pinned 는 건너뛴다 ──
CREATE OR REPLACE FUNCTION public.cleanup_expired_video_history()
RETURNS TABLE(deleted_rows integer, deleted_files integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  expired_paths TEXT[];
  file_count INT := 0;
  row_count  INT := 0;
BEGIN
  -- 만료 대상 파일 경로 수집 (본체) — pinned 제외
  SELECT COALESCE(array_agg(storage_path), ARRAY[]::TEXT[])
    INTO expired_paths
    FROM public.video_generation_history
    WHERE created_at < now() - INTERVAL '30 days'
      AND NOT pinned;

  IF array_length(expired_paths, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- 썸네일까지 수집 — pinned 제외
  WITH thumbs AS (
    SELECT COALESCE(array_agg(thumbnail_path) FILTER (WHERE thumbnail_path IS NOT NULL), ARRAY[]::TEXT[]) AS paths
    FROM public.video_generation_history
    WHERE created_at < now() - INTERVAL '30 days'
      AND NOT pinned
  )
  SELECT expired_paths || paths INTO expired_paths FROM thumbs;

  -- Storage 파일 삭제
  DELETE FROM storage.objects
    WHERE bucket_id = 'video-history'
      AND name = ANY(expired_paths);
  GET DIAGNOSTICS file_count = ROW_COUNT;

  -- 히스토리 row 삭제 — pinned 제외
  DELETE FROM public.video_generation_history
    WHERE created_at < now() - INTERVAL '30 days'
      AND NOT pinned;
  GET DIAGNOSTICS row_count = ROW_COUNT;

  RETURN QUERY SELECT row_count, file_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_video_history() FROM PUBLIC;
