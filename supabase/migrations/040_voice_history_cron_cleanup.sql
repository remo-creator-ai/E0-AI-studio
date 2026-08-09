-- 040: 음성 생성 히스토리 30일 TTL 정리 (pg_cron)
--
-- 이미지 히스토리(033) · 동영상 히스토리(035) 와 동일 패턴. 개수(100개) 기반은
-- 서비스 레이어가 실시간 정리하므로 여기서는 TTL 만 다룬다.
--
-- 동작:
--   매일 03:45 UTC (KST 12:45) 30일 이상 지난 row 를 Storage 파일과 함께 삭제.
--   033 (이미지 03:15) · 035 (동영상 03:30) 뒤로 배치.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_expired_voice_history()
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
  SELECT COALESCE(array_agg(storage_path), ARRAY[]::TEXT[])
    INTO expired_paths
    FROM public.voice_generation_history
    WHERE created_at < now() - INTERVAL '30 days';

  IF array_length(expired_paths, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Storage 파일 삭제
  DELETE FROM storage.objects
    WHERE bucket_id = 'voice-history'
      AND name = ANY(expired_paths);
  GET DIAGNOSTICS file_count = ROW_COUNT;

  -- 히스토리 row 삭제
  DELETE FROM public.voice_generation_history
    WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS row_count = ROW_COUNT;

  RETURN QUERY SELECT row_count, file_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_voice_history() FROM PUBLIC;

SELECT cron.unschedule('cleanup-expired-voice-history')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-voice-history');

SELECT cron.schedule(
  'cleanup-expired-voice-history',
  '45 3 * * *',
  $CRON$ SELECT public.cleanup_expired_voice_history(); $CRON$
);
