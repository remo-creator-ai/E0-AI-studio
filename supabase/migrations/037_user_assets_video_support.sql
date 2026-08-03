-- 037: user_assets 에 video 타입 지원
--
-- 배경:
--   기존 user_assets 는 image 전용 (character/product/logo/image). 사용자가
--   VideoStudio 에서 만든 동영상을 명시적으로 "보관함 저장" 하려면 이 테이블에
--   video 로우가 들어가야 하고, user-assets 버킷도 video/mp4 를 받아야 한다.
--
--   video_generation_history 는 임시 저장(30일 · 100편) 으로 유지하며,
--   사용자가 명시적으로 저장 버튼을 눌러야만 여기 user_assets 로 복제된다.
--
-- 변경:
--   1) user_assets.asset_type CHECK 제약을 확장해 'video' 포함
--   2) user-assets 버킷의 allowed_mime_types 에 video/mp4 · video/webm 추가
--   3) 파일 사이즈 상한을 100MB (기존 10MB · 이미지 기준) 로 확장 — 동영상 대응
--
--   기존 이미지 자산에는 영향 없음.

-- ------------------------------------------------------------------
-- 1) asset_type CHECK 확장
-- ------------------------------------------------------------------
-- 마이그레이션 026 이 CHECK 제약을 걸어뒀다면 그걸 갱신. 없으면 신규 추가.
DO $$
BEGIN
  -- 기존 제약 찾아서 이름 확인 (026 에서 특정 이름으로 만들었을 것)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_assets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%asset_type%'
  ) THEN
    -- 제약명 자동 검색 (통상 user_assets_asset_type_check)
    EXECUTE (
      SELECT format('ALTER TABLE public.user_assets DROP CONSTRAINT %I', conname)
      FROM pg_constraint
      WHERE conrelid = 'public.user_assets'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%asset_type%'
      LIMIT 1
    );
  END IF;
END$$;

ALTER TABLE public.user_assets
  ADD CONSTRAINT user_assets_asset_type_check
  CHECK (asset_type IN ('character', 'product', 'logo', 'image', 'video'));

-- ------------------------------------------------------------------
-- 2) user-assets 버킷 mime/size 확장
-- ------------------------------------------------------------------
-- ⚠️ 기존 image only 정책을 유지하려면 video 는 별도 버킷을 만드는 것이
-- 안전하지만, MVP 는 한 버킷에서 처리해 코드 단순화. 사이즈 상한만 올림.
UPDATE storage.buckets
  SET file_size_limit = 104857600,  -- 100MB
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm']
  WHERE id = 'user-assets';

-- ------------------------------------------------------------------
-- 3) 검증 코멘트
-- ------------------------------------------------------------------
-- 확인:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.user_assets'::regclass AND contype = 'c';
--   SELECT allowed_mime_types, file_size_limit FROM storage.buckets WHERE id = 'user-assets';
