-- 041: scene-images Storage 버킷 + 정책 (코드화)
--
-- 배경:
--   services/storageService.ts 는 BUCKET='scene-images' 에 씬 이미지·스토리보드
--   그리드를 업로드하고 getPublicUrl 로 공개 URL 을 만든다. 그런데 이 버킷은
--   지금까지 마이그레이션이 아니라 Supabase 대시보드에서 손으로 만들어져 있었다
--   (docs/WORK_LOG.md 3번 · 2026-05-14). 그래서 프로젝트를 새로 붙이거나 버킷이
--   지워지면 조용히 `Bucket not found` 400 이 나고, uploadImageToStorage 는
--   base64 를 그대로 반환하는 폴백이라 사용자에게는 아무 에러도 안 보인다.
--
-- 실패했을 때 벌어지는 일:
--   · 씬 이미지가 base64 그대로 projects.scenes JSONB 에 저장된다 (행이 수십 MB).
--   · saveProject 의 hasBase64 게이트가 영원히 true → 자동저장마다 업로드 재시도.
--   · 그 저장 경로가 setProject 로 store 를 통째로 덮어써 그 사이의 갱신
--     (예: 재발급한 scene.video_url) 을 되돌린다.
--
-- 경로 규칙: "{project_id}/scenes/{scene_id}.png", "{project_id}/grid/{index}.png"
-- 최상위 폴더가 프로젝트 UUID 라 RLS 는 그 폴더의 소유자를 projects 로 대조한다.

-- 공개 버킷 (getPublicUrl 사용) + 20MB (2K 업스케일 PNG 여유) + 이미지 MIME 화이트리스트
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scene-images', 'scene-images', true, 20971520, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 20971520,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

-- 읽기: 공개 버킷이므로 누구나 (공개 URL 이 스토리보드 공유·미리보기에 쓰인다)
DROP POLICY IF EXISTS "Public read scene images" ON storage.objects;
CREATE POLICY "Public read scene images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'scene-images');

-- 쓰기: 최상위 폴더가 본인 소유 프로젝트인 경우만.
-- id::text 로 비교해 폴더명이 UUID 가 아니어도 캐스팅 에러 없이 그냥 매칭 실패시킨다.
DROP POLICY IF EXISTS "Project owners write scene images" ON storage.objects;
CREATE POLICY "Project owners write scene images"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'scene-images'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'scene-images'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.user_id = auth.uid()
    )
  );

-- 검증:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id='scene-images';
--   SELECT policyname FROM pg_policies WHERE tablename='objects' AND schemaname='storage'
--     AND policyname IN ('Public read scene images', 'Project owners write scene images');
--
-- 적용 후: 기존 프로젝트에 박혀 있는 base64 는 다음 자동저장 때 업로드되어
-- Storage URL 로 치환된다 (프로젝트를 한 번씩 열어주면 정리됨).
