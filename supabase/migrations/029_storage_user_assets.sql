-- 029: 자산 Storage 버킷 + 정책 — PRD ASSET-06/11/12
--
-- 업로드 파일과 생성 결과를 담는 비공개 버킷. 경로 규칙은 "{user_id}/{asset_id}/{파일}"
-- 로, 최상위 폴더가 소유자 UUID 다. RLS 는 그 첫 폴더를 auth.uid() 와 대조해 본인
-- 파일만 접근하게 한다.

-- 비공개 버킷 + 10MB 제한 + 이미지 MIME 화이트리스트(ASSET-06)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-assets', 'user-assets', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

-- 본인 소유 경로(최상위 폴더 = 사용자 UUID)만 접근.
DROP POLICY IF EXISTS "Users manage own asset storage" ON storage.objects;
CREATE POLICY "Users manage own asset storage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 검증:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id='user-assets';
--   SELECT policyname FROM pg_policies WHERE tablename='objects' AND schemaname='storage'
--     AND policyname='Users manage own asset storage';
