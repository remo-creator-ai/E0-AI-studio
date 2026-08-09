-- 039: 음성 생성 히스토리 (voice_generation_history)
--
-- 목적:
--   사이드바 "음성 생성" 도구(VoiceStudio)에서 성공적으로 생성한 TTS mp3 로그.
--   이미지 히스토리(032) · 동영상 히스토리(034) 와 동일한 규칙:
--     1) 30일 TTL — 별도 cron(040)이 하루 1회 일괄 삭제.
--     2) 사용자당 100개 상한 — 서비스 레이어가 저장 시 초과분 자동 삭제.
--     3) 자산 보관함(user_assets)에는 저장하지 않는다 (사용자 결정).
--
-- 저장소:
--   - mp3 파일은 별도 버킷 `voice-history` 에 owner_id 폴더로 격리.
--   - 파일 사이즈 상한 5MB (1500자 nareation ~ 300~400KB 기준 여유).
--
-- 선행: 032, 034 패턴.

CREATE TABLE IF NOT EXISTS public.voice_generation_history (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,           -- 원문 스크립트 (재사용/편집용)
  voice_id       TEXT NOT NULL,           -- VOICE_PRESETS.id (예: 'wave-a')
  voice_label    TEXT NOT NULL,           -- 표시용 캐시 라벨 (프리셋 이름이 바뀌어도 히스토리는 원본 유지)
  char_count     INTEGER NOT NULL,        -- 크레딧 정산에 쓴 실 자수
  speaking_rate  REAL NOT NULL DEFAULT 1.0,
  pitch          REAL NOT NULL DEFAULT 0,
  storage_path   TEXT NOT NULL,           -- voice-history 버킷 내부 경로 (.mp3)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 스트립 표시 · 100개 초과 삭제 인덱스
CREATE INDEX IF NOT EXISTS idx_voice_history_owner_created
  ON public.voice_generation_history (owner_id, created_at DESC);

-- 30일 TTL cron 이 이 인덱스로 오래된 row 를 스캔한다.
CREATE INDEX IF NOT EXISTS idx_voice_history_created
  ON public.voice_generation_history (created_at);

ALTER TABLE public.voice_generation_history ENABLE ROW LEVEL SECURITY;

-- 본인 소유 히스토리만 조회·생성·수정·삭제.
DROP POLICY IF EXISTS "Users manage own voice history" ON public.voice_generation_history;
CREATE POLICY "Users manage own voice history"
  ON public.voice_generation_history FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_generation_history TO authenticated;

-- ------------------------------------------------------------------
-- Storage 버킷 `voice-history`
-- ------------------------------------------------------------------
-- 비공개 버킷. 사용자별 폴더로 경로 분리: {owner_id}/{history_id}.mp3
-- 파일 사이즈 상한 5MB (1500자 mp3 최대 ~500KB 대비 여유).
-- mime: audio/mpeg (mp3).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-history', 'voice-history', false, 5242880, ARRAY['audio/mpeg', 'audio/mp3'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['audio/mpeg', 'audio/mp3'];

DROP POLICY IF EXISTS "Users manage own voice history storage" ON storage.objects;
CREATE POLICY "Users manage own voice history storage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'voice-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'voice-history'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
