# REMO AI Studio 배포 가이드

> **최종 업데이트**: 2026-02-08
> **대상 플랫폼**: Vercel (자동 배포)
> **환경**: Production 단일 환경

---

## 목차

1. [개요](#1-개요)
2. [사전 준비](#2-사전-준비)
3. [Supabase 설정](#3-supabase-설정)
4. [Vercel 배포](#4-vercel-배포)
5. [환경 변수 관리](#5-환경-변수-관리)
6. [배포 후 확인 사항](#6-배포-후-확인-사항)
7. [보안 체크리스트](#7-보안-체크리스트)
8. [트러블슈팅](#8-트러블슈팅)
9. [업데이트 및 롤백](#9-업데이트-및-롤백)
10. [모니터링](#10-모니터링)

---

## 1. 개요

### 프로젝트 요약

REMO AI Studio는 AI 기반 영상 스토리보드 제작 도구입니다. 4단계 워크플로우(Planning > Visualizing > Assembly > Production)를 통해 아이디어부터 최종 영상까지 제작할 수 있습니다.

### 기술 스택

| 구분 | 기술 |
|------|------|
| **프론트엔드** | React 19 + TypeScript (strict) + Vite 6 |
| **스타일링** | Tailwind CSS v4 (`@tailwindcss/vite` 플러그인) |
| **상태관리** | Zustand 5 |
| **인증** | Supabase Auth + Google OAuth |
| **데이터베이스** | Supabase (PostgreSQL) |
| **AI 서비스** | Google Gemini (스크립트/이미지), Kling AI (영상) |
| **아이콘** | Lucide React |
| **배포** | Vercel (자동 배포) |

### 배포 구조

```
GitHub Repository
    |
    v  (git push)
Vercel (자동 빌드/배포)
    |
    |-- Static SPA (dist/)     --> *.vercel.app
    |-- API Rewrites           --> /api/kling/* -> api.klingai.com/*
    |
    v
외부 서비스
    |-- Supabase (인증 + DB + API 키 저장)
    |-- Google Gemini API (스크립트/이미지 생성)
    |-- Kling AI API (영상 생성)
```

### 빌드 결과물

| 청크 | 크기 (gzip) | 설명 |
|------|-------------|------|
| `vendor-react` | 3.69 KB | React, React DOM |
| `vendor-media` | 120 KB | JSZip, html2canvas, react-easy-crop |
| `vendor-ai` | 48.6 KB | @google/genai |
| `vendor-ui` | 25.8 KB | Lucide React, Zustand |
| `index (메인)` | 119 KB | 앱 코어 로직 |
| **총합** | **~5.5 MB** (압축 전) | Lazy-loaded 컴포넌트 포함 |

Lazy-loaded 컴포넌트: `PlanningStep`, `VisualizingStep`, `AssemblyStep`, `ProductionStep`, `SettingsPage`, `AdminPage`

---

## 2. 사전 준비

### 필수 계정

| 서비스 | 용도 | 가입 URL |
|--------|------|----------|
| **GitHub** | 소스 코드 호스팅 | https://github.com |
| **Vercel** | 배포 플랫폼 | https://vercel.com (GitHub 계정으로 가입 권장) |
| **Supabase** | 인증 + 데이터베이스 | https://supabase.com |
| **Google Cloud Console** | OAuth 인증 + Gemini API | https://console.cloud.google.com |
| **Kling AI** | 영상 생성 API | https://klingai.com |

### 필수 도구

```bash
# Node.js 20 이상 필수
node --version  # v20.x.x 이상

# npm (Node.js와 함께 설치됨)
npm --version   # 10.x.x 이상

# Git
git --version   # 2.x.x 이상
```

### 로컬 빌드 테스트

배포 전 로컬에서 빌드가 성공하는지 반드시 확인합니다:

```bash
# 의존성 설치
npm install

# 빌드 테스트 (TypeScript 타입 검사 + Vite 빌드)
npm run build

# 빌드 결과물 미리보기
npm run preview
# http://localhost:3000 에서 확인
```

---

## 3. Supabase 설정

### 3.1 프로젝트 생성

1. [Supabase Dashboard](https://supabase.com/dashboard)에 로그인
2. **New Project** 클릭
3. 프로젝트 정보 입력:
   - **Name**: `remo-ai-studio`
   - **Database Password**: 강력한 비밀번호 생성 (안전한 곳에 보관)
   - **Region**: `Northeast Asia (Seoul)` 또는 가장 가까운 리전 선택
4. **Create new project** 클릭하고 프로비저닝 완료 대기 (약 2분)

### 3.2 데이터베이스 스키마 생성

Supabase Dashboard > **SQL Editor**에서 아래 SQL을 순서대로 실행합니다.

#### profiles 테이블

```sql
-- 사용자 프로필 테이블
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 정책: 본인 프로필만 조회
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 정책: 본인 프로필만 수정
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 정책: 프로필 삽입 (회원가입 시)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

#### projects 테이블

```sql
-- 프로젝트 테이블
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  key_message TEXT,
  duration INTEGER NOT NULL DEFAULT 30,
  style TEXT NOT NULL DEFAULT 'cinematic',
  idea TEXT NOT NULL DEFAULT '',
  scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  grid_images JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout TEXT NOT NULL DEFAULT 'grid-2x2',
  thumbnail TEXT,
  current_stage TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 정책: 본인 프로젝트만 조회
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

-- 정책: 본인 프로젝트만 삽입
CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 정책: 본인 프로젝트만 수정
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

-- 정책: 본인 프로젝트만 삭제
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

#### admin_config 테이블

```sql
-- 관리자 설정 테이블 (API 키 저장)
CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;

-- 정책: 인증된 사용자만 조회 가능 (앱에서 API 키를 읽어야 함)
CREATE POLICY "Authenticated users can read admin_config"
  ON admin_config FOR SELECT
  TO authenticated
  USING (true);

-- 정책: 관리자만 수정 가능 (서비스 역할 키로 수정하거나, 별도 관리자 정책 필요)
-- 주의: 아래 정책은 Admin Page에서 Supabase 클라이언트로 수정할 수 있도록 허용합니다.
-- 실제 관리자 제한은 앱 레벨에서 VITE_ADMIN_EMAIL로 제어합니다.
CREATE POLICY "Authenticated users can upsert admin_config"
  ON admin_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update admin_config"
  ON admin_config FOR UPDATE
  TO authenticated
  USING (true);
```

#### 프로젝트 요약 함수

```sql
-- 대시보드용 프로젝트 요약 함수
CREATE OR REPLACE FUNCTION get_project_summaries(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  style TEXT,
  duration INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  scenes_count INTEGER,
  images_done INTEGER,
  videos_done INTEGER,
  thumbnail TEXT,
  current_stage TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.style,
    p.duration,
    p.created_at,
    p.updated_at,
    COALESCE(jsonb_array_length(p.scenes), 0)::INTEGER AS scenes_count,
    0::INTEGER AS images_done,
    0::INTEGER AS videos_done,
    p.thumbnail,
    p.current_stage
  FROM projects p
  WHERE p.user_id = p_user_id
  ORDER BY p.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 자동 프로필 생성 트리거

```sql
-- 회원가입 시 자동으로 profiles 테이블에 레코드 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

### 3.3 Google OAuth 설정

#### Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com)에 접속
2. 프로젝트 선택 또는 새 프로젝트 생성
3. **APIs & Services** > **OAuth consent screen** 이동
   - User Type: **External** 선택
   - 앱 이름: `REMO AI Studio`
   - 지원 이메일: 관리자 이메일 입력
   - **Save and Continue**
4. **APIs & Services** > **Credentials** 이동
   - **+ CREATE CREDENTIALS** > **OAuth client ID** 클릭
   - Application type: **Web application**
   - Name: `REMO AI Studio`
   - Authorized redirect URIs에 추가:
     ```
     https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
     ```
   - **Create** 클릭
5. **Client ID**와 **Client Secret** 복사 (Supabase에서 사용)

#### Supabase에서 Google Provider 활성화

1. Supabase Dashboard > **Authentication** > **Providers**
2. **Google** 클릭하여 확장
3. **Enable Sign in with Google** 토글 ON
4. Google Cloud Console에서 복사한 값 입력:
   - **Client ID**: `xxxx.apps.googleusercontent.com`
   - **Client Secret**: `GOCSPX-xxxx`
5. **Redirect URL** 확인 (이 URL을 Google Cloud Console의 Authorized redirect URIs에 등록해야 함):
   ```
   https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
   ```
6. **Save** 클릭

### 3.4 Supabase 프로젝트 정보 확인

배포에 필요한 값들을 Supabase Dashboard > **Settings** > **API**에서 확인합니다:

| 항목 | 위치 | 용도 |
|------|------|------|
| **Project URL** | `https://xxxx.supabase.co` | `VITE_SUPABASE_URL` |
| **anon / public key** | `eyJhb...` (긴 JWT 토큰) | `VITE_SUPABASE_ANON_KEY` |

> **참고**: `anon` 키는 클라이언트 번들에 포함되는 공개 키입니다. RLS 정책이 데이터를 보호하므로 노출되어도 안전합니다.

---

## 4. Vercel 배포

### 4.1 GitHub 레포지토리 준비

```bash
# 프로젝트 루트에서
git init
git add .
git commit -m "Initial commit"

# GitHub에 레포지토리 생성 후
git remote add origin https://github.com/<YOUR_USERNAME>/remo-ai-studio.git
git branch -M main
git push -u origin main
```

> **주의**: `.env` 파일이 `.gitignore`에 포함되어 있는지 반드시 확인하세요. `git status`로 `.env`가 추적되지 않는지 검증합니다.

### 4.2 Vercel 프로젝트 연결

1. [Vercel Dashboard](https://vercel.com/dashboard)에 로그인
2. **Add New** > **Project** 클릭
3. **Import Git Repository**에서 GitHub 레포지토리 선택
4. 빌드 설정 확인 (대부분 `vercel.json`에서 자동 감지):

| 설정 | 값 | 비고 |
|------|-----|------|
| **Framework Preset** | Vite | 자동 감지됨 |
| **Build Command** | `npm run build` | `vercel.json`에 정의됨 |
| **Output Directory** | `dist` | `vercel.json`에 정의됨 |
| **Install Command** | `npm install` | `vercel.json`에 정의됨 |
| **Root Directory** | `.` (기본값) | 모노레포가 아니므로 기본값 사용 |

### 4.3 환경 변수 설정

**Deploy** 버튼을 누르기 **전에** 환경 변수를 설정합니다:

1. **Environment Variables** 섹션 확장
2. 아래 변수들을 추가:

| Key | Value | Environment |
|-----|-------|-------------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Production |
| `VITE_SUPABASE_ANON_KEY` | `eyJhb...` (Supabase anon key) | Production |
| `VITE_ADMIN_EMAIL` | `remoimagevideo@gmail.com` | Production |

> **중요**: `VITE_` 접두사가 붙은 변수는 Vite 빌드 시 클라이언트 번들에 포함됩니다. Supabase `anon` 키는 공개 키이므로 안전하지만, **비밀 키(secret key)는 절대 `VITE_` 접두사로 추가하지 마세요**.

### 4.4 배포 실행

1. **Deploy** 버튼 클릭
2. 빌드 로그 모니터링:
   ```
   Installing dependencies...
   npm install

   Building project...
   tsc --noEmit && vite build

   Build output:
   dist/index.html
   dist/assets/...
   ```
3. 빌드 성공 시 배포 URL 확인: `https://remo-ai-studio-xxxx.vercel.app`

### 4.5 Kling API Proxy Rewrites 확인

`vercel.json`에 이미 설정된 rewrites가 정상 동작하는지 확인합니다:

```json
{
  "rewrites": [
    {
      "source": "/api/kling/:path*",
      "destination": "https://api.klingai.com/:path*"
    }
  ]
}
```

이 설정으로 브라우저에서 `https://your-app.vercel.app/api/kling/v1/...` 요청이 `https://api.klingai.com/v1/...`로 프록시됩니다. CORS 문제 없이 Kling API를 호출할 수 있습니다.

### 4.6 SPA 라우팅 참고

REMO AI Studio는 `react-router` 없이 Zustand 상태 기반으로 화면을 전환합니다. 모든 경로가 `index.html`을 반환해야 합니다. Vercel은 SPA 프레임워크(Vite)를 자동 감지하여 fallback을 처리합니다. 만약 404 오류가 발생하면 `vercel.json`에 다음을 추가하세요:

```json
{
  "rewrites": [
    { "source": "/api/kling/:path*", "destination": "https://api.klingai.com/:path*" },
    { "source": "/((?!assets/).*)", "destination": "/index.html" }
  ]
}
```

---

## 5. 환경 변수 관리

### 변수 분류

| 변수명 | 구분 | 저장 위치 | 노출 범위 |
|--------|------|-----------|-----------|
| `VITE_SUPABASE_URL` | 빌드 타임 | Vercel Dashboard | 클라이언트 번들에 포함 (공개) |
| `VITE_SUPABASE_ANON_KEY` | 빌드 타임 | Vercel Dashboard | 클라이언트 번들에 포함 (공개, RLS로 보호) |
| `VITE_ADMIN_EMAIL` | 빌드 타임 | Vercel Dashboard | 클라이언트 번들에 포함 (공개) |
| `gemini_api_key` | 런타임 | Supabase `admin_config` 테이블 | 인증된 사용자만 조회 가능 |
| `kling_access_key_id` | 런타임 | Supabase `admin_config` 테이블 | 인증된 사용자만 조회 가능 |
| `kling_access_key_secret` | 런타임 | Supabase `admin_config` 테이블 | 인증된 사용자만 조회 가능 |

### 빌드 타임 변수 업데이트 (Vercel)

1. Vercel Dashboard > 프로젝트 선택
2. **Settings** > **Environment Variables**
3. 변수 수정 또는 추가
4. **재배포 필요**: 환경 변수 변경 후 반드시 재배포해야 적용됩니다
   - **Deployments** 탭 > 최신 배포 > **...** 메뉴 > **Redeploy**

### 런타임 변수 업데이트 (Admin Page)

1. 배포된 사이트에 관리자 계정(`remoimagevideo@gmail.com`)으로 로그인
2. **Admin** 페이지 이동
3. API 키 입력/수정:
   - **Gemini API Key**: Google AI Studio에서 발급
   - **Kling Access Key ID**: Kling AI 개발자 포털에서 발급
   - **Kling Access Key Secret**: Kling AI 개발자 포털에서 발급
4. 저장 시 Supabase `admin_config` 테이블에 즉시 반영 (재배포 불필요)

### 최초 배포 후 런타임 키 설정

첫 배포 직후에는 `admin_config` 테이블이 비어 있으므로, Admin Page에서 API 키를 등록하거나, Supabase SQL Editor에서 직접 삽입합니다:

```sql
INSERT INTO admin_config (key, value) VALUES
  ('gemini_api_key', 'your-gemini-api-key-here'),
  ('kling_access_key_id', 'your-kling-access-key-id-here'),
  ('kling_access_key_secret', 'your-kling-access-key-secret-here');
```

---

## 6. 배포 후 확인 사항

배포 완료 후 아래 항목을 순서대로 확인합니다.

### 필수 체크리스트

| # | 확인 항목 | 확인 방법 | 예상 결과 |
|---|-----------|-----------|-----------|
| 1 | **사이트 로드** | `https://your-app.vercel.app` 접속 | 페이지가 정상 렌더링 |
| 2 | **Landing Page** | 메인 페이지 확인 | Hero, Workflow, AI Capabilities, Coming Soon, Stats, CTA, Footer 섹션 표시 |
| 3 | **Google OAuth 로그인** | "시작하기" 버튼 클릭 > Google 계정 선택 | 로그인 성공, Dashboard로 이동 |
| 4 | **Dashboard 로드** | 로그인 후 대시보드 확인 | 프로젝트 목록 표시 (빈 상태 또는 기존 프로젝트) |
| 5 | **Planning Step** | 새 프로젝트 생성 > 아이디어 입력 > Gemini 스크립트 생성 | AI가 스크립트와 씬 목록 생성 |
| 6 | **Visualizing Step** | 씬 선택 > 이미지 생성 | Gemini가 스토리보드 이미지 생성 |
| 7 | **Assembly Step** | 이미지 레이아웃 및 편집 | 드래그/리사이즈 정상 동작 |
| 8 | **Production Step** | 영상 생성 요청 | Kling API를 통한 영상 생성 시작 |
| 9 | **Admin Page** | 관리자 계정으로 Admin 페이지 접속 | API 키 조회/수정 가능 |
| 10 | **자동 저장** | 프로젝트 편집 후 페이지 새로고침 | 변경 내용이 유지됨 |

### 확인 실패 시

- **1번 실패**: Vercel 빌드 로그 확인, 환경 변수 누락 여부 점검
- **3번 실패**: Supabase Google OAuth 설정 및 Redirect URL 확인
- **5~6번 실패**: Admin Page에서 Gemini API 키 등록 여부 확인
- **8번 실패**: Admin Page에서 Kling API 키 등록 여부, `vercel.json` rewrites 확인

---

## 7. 보안 체크리스트

### 배포 전 필수 확인

- [ ] **`.env` 파일이 커밋되지 않았는지 확인**
  ```bash
  # .env가 Git 추적 대상에 없는지 확인
  git ls-files --error-unmatch .env 2>&1
  # "error: pathspec '.env' did not match any file(s)" 가 나와야 정상
  ```

- [ ] **Git 히스토리에 키가 노출되지 않았는지 확인**
  ```bash
  # 히스토리에서 .env 파일이 존재한 적 있는지 검색
  git log --all --full-history -- .env
  # 결과가 없어야 정상. 결과가 있으면 키 로테이션 필요
  ```

- [ ] **`.gitignore`에 `.env` 및 `.env.*` 포함 확인**
  ```
  .env
  .env.*
  !.env.example
  ```

### 서비스 보안

- [ ] **Supabase RLS 정책 활성화**: 모든 테이블에 RLS가 활성화되어 있는지 확인
  ```sql
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public';
  -- 모든 테이블의 rowsecurity가 true여야 함
  ```

- [ ] **API 키는 `admin_config` 테이블에만 저장**: 환경 변수나 코드에 직접 하드코딩하지 않음

- [ ] **관리자 접근 제한**: `VITE_ADMIN_EMAIL`에 지정된 이메일만 Admin Page 접근 가능

- [ ] **VITE_ 접두사 변수에 비밀 키 없음**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`만 존재

### 키 로테이션이 필요한 경우

만약 API 키가 Git 히스토리에 노출되었거나 외부에 유출된 경우:

1. **Gemini API Key**: [Google AI Studio](https://aistudio.google.com/apikey)에서 새 키 발급 > Admin Page에서 업데이트
2. **Kling API Key**: Kling AI 개발자 포털에서 새 키 발급 > Admin Page에서 업데이트
3. **Supabase anon key**: Supabase Dashboard > Settings > API에서 키 재생성 > Vercel 환경 변수 업데이트 > 재배포
4. **Google OAuth Secret**: Google Cloud Console에서 새 클라이언트 시크릿 생성 > Supabase Provider 설정 업데이트

---

## 8. 트러블슈팅

### 빌드 실패

**증상**: Vercel 빌드 중 오류 발생

```
error TS2xxx: ...
```

**해결**:
1. 로컬에서 `npm run build` 실행하여 동일한 오류 재현
2. TypeScript 오류 수정
3. 커밋 및 푸시하면 자동으로 재배포

---

### OAuth 리디렉트 오류

**증상**: Google 로그인 후 "redirect_uri_mismatch" 또는 빈 화면

**해결**:
1. Google Cloud Console > Credentials > OAuth 2.0 Client IDs에서 Authorized redirect URIs 확인
2. 아래 URL이 등록되어 있는지 확인:
   ```
   https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
   ```
3. Supabase Dashboard > Authentication > URL Configuration에서 **Site URL** 확인:
   ```
   https://your-app.vercel.app
   ```
4. **Redirect URLs**에 배포 URL이 포함되어 있는지 확인:
   ```
   https://your-app.vercel.app/**
   ```

---

### Kling API CORS 오류

**증상**: 브라우저 콘솔에 CORS 관련 오류

```
Access to fetch at 'https://api.klingai.com/...' has been blocked by CORS policy
```

**해결**:
1. 앱에서 Kling API 호출이 `/api/kling/...` 경로를 사용하는지 확인 (직접 `api.klingai.com`을 호출하면 CORS 발생)
2. `vercel.json`의 rewrites 확인:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/kling/:path*",
         "destination": "https://api.klingai.com/:path*"
       }
     ]
   }
   ```
3. Vercel 배포 후 `https://your-app.vercel.app/api/kling/v1/...`에 직접 접속하여 프록시 동작 확인

---

### Gemini API 429 Rate Limit

**증상**: 스크립트/이미지 생성 시 "Too Many Requests" 오류

**해결**:
1. [Google AI Studio](https://aistudio.google.com/apikey) 대시보드에서 API 사용량 확인
2. Free Tier 제한:
   - 분당 요청 수 제한 (RPM)
   - 일일 요청 수 제한 (RPD)
3. 잠시 대기 후 재시도
4. 필요 시 유료 플랜 업그레이드 또는 Google Cloud에서 Gemini API 활성화

---

### 배포 후 빈 화면 (흰 화면)

**증상**: 배포 URL 접속 시 아무것도 표시되지 않음

**해결**:
1. **브라우저 개발자 도구** (F12) > **Console** 탭에서 오류 확인
2. 일반적인 원인:
   - `VITE_SUPABASE_URL` 또는 `VITE_SUPABASE_ANON_KEY`가 Vercel에 설정되지 않음
   - 환경 변수 설정 후 **재배포하지 않음** (빌드 타임 변수이므로 재배포 필수)
3. Vercel Dashboard > Settings > Environment Variables에서 변수 확인 후 **Redeploy**

---

### Admin Page 접근 불가

**증상**: 관리자 이메일로 로그인했지만 Admin 메뉴가 보이지 않음

**해결**:
1. Vercel 환경 변수에서 `VITE_ADMIN_EMAIL` 값 확인
   - 값: `remoimagevideo@gmail.com`
   - 대소문자 구분 없음 (앱 내부에서 `toLowerCase()` 비교)
2. 변수 설정 후 재배포 여부 확인
3. 로그인한 Google 계정의 이메일이 정확히 일치하는지 확인

---

### 프로젝트 저장/로드 실패

**증상**: 프로젝트가 저장되지 않거나, 새로고침 후 데이터가 사라짐

**해결**:
1. 브라우저 콘솔에서 Supabase 관련 오류 확인
2. Supabase Dashboard > Table Editor에서 `projects` 테이블의 RLS 정책 확인
3. `profiles` 테이블에 현재 사용자의 레코드가 있는지 확인 (회원가입 트리거가 정상 동작했는지)
4. 필요시 수동으로 프로필 생성:
   ```sql
   INSERT INTO profiles (id, email)
   SELECT id, email FROM auth.users
   WHERE id NOT IN (SELECT id FROM profiles);
   ```

---

## 9. 업데이트 및 롤백

### 업데이트 배포

Vercel은 Git 푸시 시 자동으로 빌드하고 배포합니다:

```bash
# 코드 수정 후
git add <변경된 파일들>
git commit -m "feat: 새로운 기능 추가"
git push origin main
```

Vercel Dashboard > **Deployments** 탭에서 빌드 진행 상황을 실시간으로 확인할 수 있습니다.

### 롤백

문제가 발생한 경우 이전 배포로 즉시 롤백할 수 있습니다:

1. Vercel Dashboard > **Deployments** 탭
2. 정상 동작했던 이전 배포 선택
3. **...** 메뉴 > **Promote to Production** 클릭
4. 확인 후 즉시 이전 버전으로 복원됨 (빌드 없이 즉시 전환)

> **롤백 시 주의**: 환경 변수가 변경된 경우, 이전 배포는 변경 전 환경 변수로 빌드된 상태입니다. 환경 변수와 코드 변경이 동시에 필요한 배포는 롤백 시 불일치가 발생할 수 있습니다.

### Preview Deployments (PR 미리보기)

Pull Request를 생성하면 Vercel이 자동으로 Preview 배포를 생성합니다:

1. GitHub에서 PR 생성
2. Vercel이 자동으로 Preview URL 생성 (PR 코멘트에 표시)
   ```
   https://remo-ai-studio-xxxx-pr-123.vercel.app
   ```
3. Preview URL에서 변경 사항 확인
4. 검증 완료 후 PR 머지 > `main` 브랜치에 자동 배포

> **참고**: Preview 배포에도 Production과 동일한 환경 변수가 적용됩니다. Preview 전용 환경 변수가 필요하면 Vercel Dashboard에서 Environment를 **Preview**로 설정하여 별도 관리할 수 있습니다.

---

## 10. 모니터링

### Vercel Analytics (무료)

1. Vercel Dashboard > 프로젝트 > **Analytics** 탭
2. 확인 가능한 지표:
   - **Web Vitals**: LCP, FID, CLS 등 Core Web Vitals
   - **방문자 수**: 페이지뷰, 고유 방문자
   - **성능**: 페이지 로드 시간, 리소스 크기
3. 활성화 방법:
   - Vercel Dashboard > Settings > Analytics > **Enable**
   - 별도의 코드 변경 없이 활성화 가능

### Supabase Dashboard 모니터링

1. [Supabase Dashboard](https://supabase.com/dashboard) > 프로젝트 선택
2. 확인 가능한 지표:
   - **Database**: 테이블 크기, 연결 수, 쿼리 성능
   - **Auth**: 가입자 수, 활성 사용자, 로그인 시도
   - **Storage**: 사용량 (해당되는 경우)
   - **API**: 요청 수, 응답 시간, 오류율
3. **Reports** 탭에서 일간/주간/월간 사용량 확인

### 클라이언트 사이드 오류 확인

현재는 별도의 오류 추적 서비스를 사용하지 않으므로, 브라우저 개발자 도구를 활용합니다:

1. 배포된 사이트 접속
2. **F12** > **Console** 탭에서 오류 확인
3. **Network** 탭에서 실패한 API 요청 확인 (빨간색으로 표시)

### 향후 권장: 오류 추적 서비스

프로덕션 환경에서 사용자가 겪는 오류를 실시간으로 추적하려면 다음 서비스를 고려하세요:

| 서비스 | 무료 범위 | 특징 |
|--------|-----------|------|
| **[Sentry](https://sentry.io)** | 월 5,000건 이벤트 | React 통합 우수, 스택트레이스, 소스맵 지원 |
| **[LogRocket](https://logrocket.com)** | 월 1,000 세션 | 세션 리플레이, 네트워크 로깅 |

Sentry 도입 시 예시:

```bash
npm install @sentry/react
```

```typescript
// index.tsx에 추가
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://xxxx@xxx.ingest.sentry.io/xxxx",
  environment: "production",
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1, // 10% 샘플링
});
```

---

## 부록: 빠른 참조

### 전체 배포 순서 요약

```
1. Supabase 프로젝트 생성
2. SQL 스키마 실행 (profiles, projects, admin_config, 함수, 트리거)
3. Google OAuth 설정 (Google Cloud Console + Supabase Provider)
4. GitHub 레포지토리 생성 및 코드 푸시
5. Vercel 프로젝트 생성 및 GitHub 연결
6. Vercel 환경 변수 설정 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ADMIN_EMAIL)
7. 첫 배포 실행
8. Admin Page에서 런타임 API 키 등록 (Gemini, Kling)
9. 배포 후 체크리스트 실행
10. 보안 체크리스트 확인
```

### 주요 URL

| 항목 | URL |
|------|-----|
| Vercel Dashboard | https://vercel.com/dashboard |
| Supabase Dashboard | https://supabase.com/dashboard |
| Google Cloud Console | https://console.cloud.google.com |
| Google AI Studio | https://aistudio.google.com |
| Kling AI | https://klingai.com |
