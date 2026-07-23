-- 032: 이미지 생성 히스토리 (image_generation_history)
--
-- 목적:
--   이미지 생성 화면(ImageStudio)에서 사용자가 성공적으로 생성한 이미지의 로그를
--   유지한다. 미드저니처럼 오른쪽 스트립으로 최근 결과를 다시 꺼내 보고 Remix
--   할 수 있게 하는 것이 UI 목적이며, 데이터 층은 다음 세 가지 규칙을 지킨다.
--
--   1) 30일 TTL — 30 일이 지나면 하루 1회 cron 이 일괄 삭제한다 (033).
--   2) 사용자당 200장 상한 — 201장째 성공 시 서비스 레이어가 가장 오래된 1장을 삭제.
--   3) '자산 보관함에 저장' 을 명시적으로 눌러야만 별도 사본이 user_assets 로 복제된다.
--      즉 히스토리에서 원본이 사라져도 보관함 사본은 안전하다.
--
-- 저장소:
--   - 원본 이미지 파일은 별도 버킷 `image-history` 에 보관 (029 의 user-assets 와 별개).
--     TTL 정책이 다르기 때문에 버킷을 나눈다.
--   - 이 테이블은 파일 경로와 메타데이터만 가진다.
--
-- 선행: 001(update_updated_at 트리거 함수).

CREATE TABLE IF NOT EXISTS public.image_generation_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt         TEXT NOT NULL,           -- Remix 시 사용자에게 되채워 넣는다
  aspect         TEXT NOT NULL,           -- '1:1' | '16:9' | '9:16'
  style_kind     TEXT,                    -- 'preset' | 'custom' | NULL(선택 없음)
  style_value    TEXT,                    -- preset: VisualStyle enum 값, custom: custom style id
  model          TEXT NOT NULL,           -- 사용한 이미지 모델 식별자
  storage_path   TEXT NOT NULL,           -- image-history 버킷 내부 경로
  saved_asset_id UUID REFERENCES public.user_assets(id) ON DELETE SET NULL,
                                          -- 보관함에 저장했을 때 사본의 자산 id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 스트립 표시는 owner_id + 최신순. 200장 초과 삭제도 이 인덱스를 쓴다.
CREATE INDEX IF NOT EXISTS idx_image_history_owner_created
  ON public.image_generation_history (owner_id, created_at DESC);

-- 30일 TTL cron 이 이 인덱스로 오래된 row 를 스캔한다.
CREATE INDEX IF NOT EXISTS idx_image_history_created
  ON public.image_generation_history (created_at);

ALTER TABLE public.image_generation_history ENABLE ROW LEVEL SECURITY;

-- 본인 소유 히스토리만 조회·생성·수정·삭제.
DROP POLICY IF EXISTS "Users manage own image history" ON public.image_generation_history;
CREATE POLICY "Users manage own image history"
  ON public.image_generation_history FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_generation_history TO authenticated;

-- ------------------------------------------------------------------
-- Storage 버킷 `image-history` (029 의 user-assets 패턴 재현)
-- ------------------------------------------------------------------
-- 비공개 버킷이며 사용자별 폴더로 경로를 분리한다: {owner_id}/{history_id}.png
-- RLS 는 경로 첫 세그먼트를 auth.uid() 와 대조한다.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('image-history', 'image-history', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

DROP POLICY IF EXISTS "Users manage own image history storage" ON storage.objects;
CREATE POLICY "Users manage own image history storage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'image-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'image-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
