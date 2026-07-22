# 개발 재개 가이드 (다음 세션용)

마지막 업데이트: 2026-07-22 · 최신 커밋 `8469592`

로컬은 **실제 Supabase(로컬 Docker 스택) 연동 모드**로 개발 중이다(목 모드 아님).
다음 세션에서 아래 절차로 그대로 이어가면 된다.

---

## 1. 로컬 환경 재기동

```bash
# (1) Docker Desktop 실행 (엔진이 떠 있어야 함)

# (2) 로컬 Supabase 스택 시작
npx supabase start          # API http://127.0.0.1:54321, Studio :54323

# (3) 마이그레이션 적용 (001~029). 로컬 DB 를 처음부터 재구성:
npx supabase db reset       # ⚠️ 로컬 데이터 초기화됨. 테스트 유저/자산 사라짐

# (4) 앱 dev 서버
npm run dev                 # http://localhost:3000
```

`.env.local`(gitignore, 커밋 안 됨)이 로컬 Supabase 를 가리키고 `VITE_MOCK_AUTH=false`
라서 자동으로 실제 모드로 뜬다. 파일이 없으면 아래로 재생성:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<npx supabase status 의 ANON_KEY>
VITE_MOCK_AUTH=false
```

## 2. 로그인 (dev 전용)

랜딩 "시작하기" → **DEV · 로컬 Supabase 이메일 로그인** 폼(기본값 채워져 있음):
- 일반 사용자: `user@dev.local` / `devpass123` → 없으면 자동 가입
- 이 폼은 `import.meta.env.DEV && !MOCK_MODE` 조건이라 **프로덕션 빌드에는 안 나온다**.

### 마스터로 테스트하려면
1. 아무 이메일(예: `master@dev.local`)로 dev 로그인해 profiles 를 만든 뒤
2. SQL 로 role 승격:
   ```bash
   docker exec -e PGPASSWORD=postgres supabase_db_sodam-ai-studio \
     psql -U postgres -d postgres -c \
     "UPDATE public.profiles SET role='master' WHERE email='master@dev.local';"
   ```
3. 재로그인 → 사이드바 "관리자 콘솔" 노출.

## 3. 로컬 DB 직접 확인 (검증용)

```bash
docker exec -e PGPASSWORD=postgres supabase_db_sodam-ai-studio \
  psql -U postgres -d postgres -c "SELECT email, role FROM public.profiles;"
```

---

## 진행 현황

### ✅ Phase 1 — 가입·권한·크레딧 (완료)
- 신규 스키마 019~023 (consent/survey/signup_requests/credit_requests/거래타입확장)
- 약관 동의 게이트 §9.1 (`ConsentGate`, `consentStore`)
- 인트로 설문 §9.0 (`IntroSurveyModal`, `surveyStore`) — 설문→투어 순서
- role 기반 마스터 전환 (`authStore.isMaster`, DEV-004 해결)
- 크레딧 신청 §9.7 — 사용자 신청(`CreditRequestModal`) + 마스터 대기함(AdminPage)
  + RPC 024(`master_grant_credit` 등) + 마스터 직접 지급 실배선

### ✅ Phase 2 — 개인 자산 보관함 (진행 중)
- 스키마 026~029 (user_assets/user_asset_files/project_assets + Storage 버킷)
- **자산 보관함 CRUD 완료** (`AssetLibrary`, `assetService`) — 실제 Supabase+Storage 검증
  - 생성/업로드/목록(signed URL)/수정/삭제/소유권 격리 전부 확인

### ⬜ Phase 2 남은 작업 (다음 세션 시작점)
1. **§9.4 단건 이미지 제작** — 독립 이미지 생성 화면, 자산 레퍼런스 최대 3개(대표우선 5장),
   크레딧 차감, 결과→자산 저장(IMAGE-09)
2. **§9.5 영상 기획 자산 연결** — 영상 기획에서 자산 선택 → `project_assets` 저장 →
   스토리보드 이미지 생성에 대표·참고 레퍼런스 전달(최대 5장, 결정론적 우선순위)
3. **§9.8 사용자 상한/가입 신청**, **인트로 설문 마스터 집계 뷰** 등 Phase 1 잔여 선택 항목

권장 다음 착수: **§9.5 (영상 기획 자산 연결)** — 스키마(`project_assets`)가 이미 있고
기존 영상 워크플로우(PlanningStep/VisualizingStep)에 자산 선택을 얹는 흐름.

---

## 미해결/주의 (실서비스 전 필수)
`docs/DEV_ISSUES.md` 참조. 특히:
- **DEV-001** admin_config API 키 전면 개방 (Critical) — Edge Function 프록시 선행
- **DEV-002** 크레딧 후차감 — 프록시로 함께 해결
- 마이그레이션은 파일만 존재. 실 DB 반영은 `docs/MIGRATIONS.md` 베이스라인 절차 필요.

## 마이그레이션 현황 (001~029)
```
001 초기스키마  002~013 기존  014 크레딧20  015 관리RPC  016 프로필RLS
017 admin_config  018 deduct정리  019 consent  020 survey  021 signup_req
022 credit_req  023 거래타입확장  024 지급RPC  025 GRANT  026 user_assets
027 asset_files  028 project_assets  029 storage
```
