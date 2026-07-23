-- 033: 이미지 생성 히스토리 30일 TTL 정리 (pg_cron)
--
-- 두 개의 삭제 정책 중 시간 기반(TTL)을 서버 측에서 자동으로 수행한다.
-- 개수(200장) 기반은 서비스 레이어(imageHistoryService.saveHistory)가
-- 저장 시점에 실시간으로 정리하므로 여기서는 다루지 않는다.
--
-- 사전 요구:
--   pg_cron 확장이 활성화되어 있어야 한다. Supabase 프로젝트에서는
--   Dashboard > Database > Extensions 에서 pg_cron 을 켜거나 아래 CREATE EXTENSION 을
--   superuser 로 실행해야 한다. Supabase 는 postgres 롤에 이 권한을 부여해 둔다.
--
-- 동작:
--   매일 새벽 03:15 (UTC) 에 30일 이상 지난 row 를 Storage 파일과 함께 삭제한다.
--   03:15 는 KST 12:15 로, 사용자 활동이 적은 시간대다.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 30일 지난 이미지 히스토리 + Storage 파일을 함께 정리하는 함수.
-- SECURITY DEFINER 로 소유자(postgres) 권한으로 돌아야 storage.objects 를 만질 수 있다.
CREATE OR REPLACE FUNCTION public.cleanup_expired_image_history()
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
  -- 만료 대상 파일 경로 수집
  SELECT COALESCE(array_agg(storage_path), ARRAY[]::TEXT[])
    INTO expired_paths
    FROM public.image_generation_history
    WHERE created_at < now() - INTERVAL '30 days';

  IF array_length(expired_paths, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Storage 파일 삭제 (bucket 격리)
  DELETE FROM storage.objects
    WHERE bucket_id = 'image-history'
      AND name = ANY(expired_paths);
  GET DIAGNOSTICS file_count = ROW_COUNT;

  -- 히스토리 row 삭제
  DELETE FROM public.image_generation_history
    WHERE created_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS row_count = ROW_COUNT;

  RETURN QUERY SELECT row_count, file_count;
END;
$$;

-- 실행 권한은 postgres 만. 일반 사용자는 이 함수를 호출할 필요가 없다.
REVOKE ALL ON FUNCTION public.cleanup_expired_image_history() FROM PUBLIC;

-- 기존 job 이 있으면 재등록 (schedule 변경 대비)
SELECT cron.unschedule('cleanup-expired-image-history')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-image-history');

-- 매일 03:15 UTC 실행
SELECT cron.schedule(
  'cleanup-expired-image-history',
  '15 3 * * *',
  $CRON$ SELECT public.cleanup_expired_image_history(); $CRON$
);

-- 검증:
--   SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-image-history';
--   SELECT * FROM public.cleanup_expired_image_history();  -- 즉시 한 번 실행해 결과 확인
--   SELECT jobname, status, return_message, start_time
--     FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
