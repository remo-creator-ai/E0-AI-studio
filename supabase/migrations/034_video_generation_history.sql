-- 034: 동영상 생성 히스토리 (video_generation_history)
--
-- 목적:
--   사이드바 "동영상 생성" 도구(VideoStudio)에서 성공적으로 생성한 영상 로그.
--   이미지 히스토리(032)와 동일한 규칙을 따른다.
--
--   1) 30일 TTL — 별도 cron(035)이 하루 1회 일괄 삭제.
--   2) 사용자당 100편 상한 — 101편째 성공 시 서비스 레이어가 가장 오래된 1편 삭제.
--   3) '자산 보관함에 저장' 을 눌러야만 별도 사본이 user_assets 로 복제된다.
--
-- 저장소:
--   - 원본 mp4 파일은 별도 버킷 `video-history` 에 보관.
--     이미지 히스토리와 TTL/RLS 정책은 동일하되 mime/사이즈 상한만 다르다.
--   - 이 테이블은 파일 경로와 메타데이터만 가진다.
--
-- 선행: 032(image_generation_history 패턴).

CREATE TABLE IF NOT EXISTS public.video_generation_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt         TEXT NOT NULL,           -- Remix 시 사용자에게 되채워 넣는다
  aspect         TEXT NOT NULL,           -- '16:9' | '9:16' | '1:1'
  duration_sec   INTEGER NOT NULL,        -- 3, 5, 10 등
  model          TEXT NOT NULL,           -- 사용한 영상 모델 식별자 (kling-v1, kling-v1-6 등)
  has_start_frame BOOLEAN NOT NULL DEFAULT false,
  has_end_frame  BOOLEAN NOT NULL DEFAULT false,
  storage_path   TEXT NOT NULL,           -- video-history 버킷 내부 경로 (.mp4)
  thumbnail_path TEXT,                    -- 미리보기 이미지 경로 (선택)
  saved_asset_id UUID REFERENCES public.user_assets(id) ON DELETE SET NULL,
                                          -- 보관함에 저장했을 때 사본의 자산 id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 스트립 표시는 owner_id + 최신순. 100편 초과 삭제도 이 인덱스를 쓴다.
CREATE INDEX IF NOT EXISTS idx_video_history_owner_created
  ON public.video_generation_history (owner_id, created_at DESC);

-- 30일 TTL cron 이 이 인덱스로 오래된 row 를 스캔한다.
CREATE INDEX IF NOT EXISTS idx_video_history_created
  ON public.video_generation_history (created_at);

ALTER TABLE public.video_generation_history ENABLE ROW LEVEL SECURITY;

-- 본인 소유 히스토리만 조회·생성·수정·삭제.
DROP POLICY IF EXISTS "Users manage own video history" ON public.video_generation_history;
CREATE POLICY "Users manage own video history"
  ON public.video_generation_history FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_generation_history TO authenticated;

-- ------------------------------------------------------------------
-- Storage 버킷 `video-history`
-- ------------------------------------------------------------------
-- 비공개 버킷. 사용자별 폴더로 경로 분리: {owner_id}/{history_id}.mp4
-- 파일 사이즈 상한 100MB (10초 영상 최대치 대비 여유).
-- mime: video/mp4, video/webm.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-history', 'video-history', false, 104857600, ARRAY['video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 104857600,
      allowed_mime_types = ARRAY['video/mp4', 'video/webm'];

DROP POLICY IF EXISTS "Users manage own video history storage" ON storage.objects;
CREATE POLICY "Users manage own video history storage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'video-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'video-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
