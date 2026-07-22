-- 024: 제작 의뢰 첨부 Storage 버킷 (누락분)
--
-- 증상: 4. 내보내기에서 제작 의뢰 시
--         "일부 파일 업로드 중 오류가 발생했습니다:
--          스토리보드: Bucket not found / 이미지 에셋: Bucket not found"
--
-- 원인: components/ProductionStep.tsx(:1128, :1157, :1171)가
--       'production-attachments' 버킷에 업로드하는데, 이 버킷을 만드는 SQL 이
--       레포 어디에도 없었다. 운영 DB 에도 user-assets 하나뿐이었다.
--       admin_config 와 같은 유형의 누락이다(대시보드에서 손으로 만들고 커밋을
--       안 했거나, 통합 과정에서 유실).
--
-- 경로 규칙: production-requests/{project_id}/{timestamp}/{storyboard.json|assets.zip|extra_*}
--
-- ⚠️ 공개 버킷인 이유: 호출부가 getPublicUrl() 로 링크를 만들어 제작 담당자에게
--    전달한다. 앱 밖의 사람이 받는 링크라 서명 URL 은 만료돼 버린다.
--    대신 경로에 프로젝트 UUID + 타임스탬프가 들어가 추측은 어렵다.
--    더 조이려면 비공개 버킷 + 장기 서명 URL 로 바꾸고 호출부도 함께 고쳐야 한다
--    (getPublicUrl -> createSignedUrl). 이번 범위에서는 코드 동작에 맞춘다.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('production-attachments', 'production-attachments', true, 104857600) -- 100MB (assets.zip 대비)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 104857600;

-- 업로드는 로그인 사용자만. 읽기는 공개 버킷이라 CDN 으로 열린다.
DROP POLICY IF EXISTS "Authenticated can upload production attachments" ON storage.objects;
CREATE POLICY "Authenticated can upload production attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'production-attachments');

-- 마스터는 의뢰 관리를 위해 목록 조회/삭제가 가능해야 한다.
DROP POLICY IF EXISTS "Master manages production attachments" ON storage.objects;
CREATE POLICY "Master manages production attachments"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'production-attachments' AND public.is_master())
  WITH CHECK (bucket_id = 'production-attachments' AND public.is_master());

-- 검증:
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id='production-attachments';
--   SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
