-- 042: projects.image_model · projects.generation_language 컬럼 추가
--
-- image_model:
--   스토리보드 만들기에서 고른 이미지 모델을 프로젝트에 기억시켜, 다듬기 단계의
--   편집기·업스케일이 같은 모델을 이어서 쓰게 한다. 지금까지는 화면마다 모델을
--   따로 하드코딩(VisualizingStep=선택값, AssemblyStep 편집=3.1 flash,
--   업스케일=3-pro)해서 같은 컷인데 단계마다 그림체가 미묘하게 달라졌다.
--   NULL 이면 types.ts 의 DEFAULT_IMAGE_MODEL 을 쓴다.
--
-- generation_language:
--   types.ts Project 와 PlanningStep 은 이미 이 값을 다루는데 정작 컬럼이 없어
--   저장이 되지 않고 매 세션 초기화됐다. Korean-only 전환에서 이 값이 기준이
--   되므로 여기서 실제 컬럼을 만든다. NULL 이면 'ko'.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS image_model TEXT,
  ADD COLUMN IF NOT EXISTS generation_language TEXT;

-- 값 오타 방지용 체크 (NULL 허용 = 기본값 사용)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_generation_language_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_generation_language_check
  CHECK (generation_language IS NULL OR generation_language IN ('ko', 'en'));

-- 검증:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='projects'
--      AND column_name IN ('image_model','generation_language');
