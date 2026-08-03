-- 035: 동영상 생성 히스토리 30일 TTL 정리 (pg_cron)
--
-- 이미지 히스토리(033) 와 동일한 패턴. 개수(100편) 기반은 서비스 레이어가
-- 실시간으로 정리하므로 여기서는 TTL 만 다룬다.
--
-- 동작:
--   매일 새벽 03:30 UTC (KST 12:30) 에 30일 이상 지난 row 를 Storage 파일과 함께 삭제.
--   033 (이미지 정리) 이 03:15 이므로 15분 뒤로 배치.

CREATE EXTENSION IF NOT EXISTS pg_cron;

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
  -- 만료 대상 파일 경로 수집 (본체 + 썸네일)
  SELECT COALESCE(array_agg(storage_path), ARRAY[]::TEXT[])
    INTO expired_paths
    FROM public.video_generation_history
    WHERE created_at < now() - INTERVAL '30 days';

  IF array_length(expired_paths, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- 썸네일까지 수집
  WITH thumbs AS (
    SELECT COALESCE(array_agg(thumbnail_path) FILTER (WHERE thumbnail_path IS NOT NULL), ARRAY[]::TEXT[]) AS paths
    FROM public.video_generation_history
    WHERE created_at < now() - INTERVAL '30 days'
  )
  SELECT expired_paths || paths INTO expired_paths FROM thumbs;

  -- Storage 파일 삭제
  DELETE FROM storage.objects
    WHERE bucket_id = 'video-history'
      AND name = ANY(expired_paths);
  GET DIAGNOSTICS file_count = ROW_COUNT;

  -- 히스토리 row 삭제
  DELETE FROM public.video_generation_history
    WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS row_count = ROW_COUNT;

  RETURN QUERY SELECT row_count, file_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_video_history() FROM PUBLIC;

SELECT cron.unschedule('cleanup-expired-video-history')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-video-history');

SELECT cron.schedule(
  'cleanup-expired-video-history',
  '30 3 * * *',
  $CRON$ SELECT public.cleanup_expired_video_history(); $CRON$
);
