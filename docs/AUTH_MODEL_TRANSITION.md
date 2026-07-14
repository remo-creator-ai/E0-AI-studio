# 인증 모델 전환 설계 (Google OAuth → 마스터 발급 ID/PW)

> 작성: 2026-07-14 · 근거 시안: `와이어프레임_소담에이아이스튜디오.html`, `마스터_UI시안_소담에이아이스튜디오.html`

## 1. 현재 상태 (As-Is)

| 항목 | 구현 | 파일 |
|------|------|------|
| 로그인 | **Google OAuth 단일** | `store/authStore.ts` (`signInWithOAuth({provider:'google'})`), `components/LandingPage.tsx` (구글 버튼만) |
| 계정 생성 | 구글 로그인 시 `auth.users` 자동 생성 → 트리거로 `profiles` 자동 삽입 | `supabase/schema.sql` (`handle_new_user` 트리거) |
| 권한 판별 | **클라이언트 이메일 비교** (`VITE_ADMIN_EMAIL`) | `services/adminConfigService.ts` `isAdmin()` |
| 역할(role) | **DB에 없음** — `profiles`에 role 컬럼 부재 | — |
| 크레딧 | 가입 시 60 부여 | `supabase/migrations/005_user_credits.sql` |

## 2. 목표 상태 (To-Be, 시안 기준)

- **마스터(오픈놀) 1개 계정** = 리모가 발급한 21번째 계정, `role = master`.
- **발급계정 20개** = 마스터가 **아이디/비번을 직접 지정**해 생성 (예: `sodam-gangnam`), `role = user`.
- 로그인 방식 **확정 (2026-07-14): 구글 OAuth는 마스터 전용으로만 유지**. 발급계정 20개는 **아이디+비밀번호** 방식.
- **임시 비밀번호 재발급**: 마스터가 재발급 → **마스터 화면에 1회 표시**(복사 전달), 이메일 발송 아님.
- **권한 상승 경로 없음**: 발급계정은 마스터로 승격 불가.
- 관리자 콘솔(`/master`) 진입점은 `role = master`에게만 노출.

## 3. 핵심 간극 (Gap)

1. **로그인 방식**: OAuth → email/password. Supabase는 아이디 개념이 없으므로 `아이디 → 합성 이메일`(예: `sodam-gangnam@sodam.local`) 매핑 필요.
2. **계정 생성 주체**: 셀프가입 → 마스터가 서버측에서 생성. `service_role` 권한 필요 → **Edge Function 필수**(anon 키로 타 계정 생성 불가).
3. **role 저장소**: `profiles.role` 컬럼 신설 + RLS/RPC가 이메일 대신 role 기반으로 동작.
4. **권한 판별 신뢰성**: 클라이언트 `isAdmin`은 UI 게이팅용으로만 남기고, **실제 권한은 DB RLS + SECURITY DEFINER RPC의 role 검사**로 강제.

## 4. 설계안

### 4.1 데이터 모델
```sql
-- profiles 에 role 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'master'));

-- 아이디(로그인 핸들) 저장 — 합성 이메일과 별개로 표시/검색용
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_id TEXT UNIQUE;

-- 계정 상태(정지=이력보존, 완전삭제 없음)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended'));
```
> 마스터 계정은 최초 1회 **DB 수동 프로비저닝**으로 `role='master'` 지정(시안의 "REMO 슈퍼관리자 = DB 수동" 방침과 정합).

### 4.2 아이디 ↔ 이메일 매핑
- 로그인 화면: 사용자는 **아이디만 입력**. 클라이언트가 `${login_id}@sodam.local` 형태 합성 이메일로 `signInWithPassword` 호출.
- 도메인(`sodam.local`)은 상수화. 실제 수신 불가 도메인이므로 이메일 확인(confirm) 비활성 설정 필요.

### 4.3 계정 생성 / 비번 재발급 (Edge Function)
`service_role`이 필요하므로 프론트에서 직접 못 함 → Edge Function 2종:

| 함수 | 역할 | 권한 검사 |
|------|------|-----------|
| `master-create-account` | `admin.createUser`로 발급계정 생성, `profiles.role='user'`, 초기 크레딧 60 부여 | 호출자 JWT의 uid가 `role='master'`인지 서버에서 확인 |
| `master-reset-password` | `admin.updateUserById`로 임시비번 설정 후 **평문을 응답 1회 반환** | 동일 |

- 임시비번은 서버에서 생성(랜덤) → 응답으로만 반환 → 마스터 화면 `.revealbox`에 1회 표시(시안 CSS 이미 추가됨). DB/로그에 평문 저장 금지.

### 4.4 권한 강제 (신뢰 경계)
- `isAdmin()`(클라이언트)은 **UI 노출 게이팅 전용**으로 유지하되, 판별을 이메일 → `profiles.role='master'` 조회로 교체.
- 모든 관리자 RPC(`admin_get_all_requests` 등)와 신규 Edge Function은 **서버에서 role 재검증**. 클라이언트 값 신뢰 금지.

## 5. 영향 파일 (구현 시)

| 파일 | 변경 |
|------|------|
| `store/authStore.ts` | `signInWithGoogle` → `signInWithPassword(loginId, pw)` 추가/대체 |
| `components/LandingPage.tsx` | 구글 버튼 → 아이디/비번 폼 |
| `services/adminConfigService.ts` | `isAdmin` → role 기반 조회(`profiles.role`) |
| `components/AdminPage.tsx` | 계정 생성/정지/비번재발급 UI → Edge Function 호출 |
| `supabase/migrations/013_roles.sql` (신규) | role/login_id/status 컬럼 + RLS |
| `supabase/functions/master-create-account/`, `master-reset-password/` (신규) | 계정 관리 |
| `types/database.ts` | profiles 타입에 role/login_id/status 반영 |

## 6. 리스크 / 결정 필요

- ✅ **구글 OAuth 유지 범위 (2026-07-14 확정): 마스터 전용 유지.** 발급계정은 ID/PW. → 랜딩 화면은 **구글 로그인(마스터)** + **아이디/비번 폼(발급계정)** 두 진입점 공존.
- ✅ **합성 이메일 도메인 (2026-07-14 확정): `sodam.local`.** 실제 수신 불가 내부전용. Supabase 이메일 확인(confirm) 비활성화 설정 필요.
- ✅ **기존 사용자 마이그레이션 (2026-07-14 확정): 불필요 — 신규 구축.** role 모델로 깨끗하게 시작.
- ⬜ 임시비번 1회 표시 정책의 **감사 로그**(누가 언제 재발급했는지, 평문 제외) 설계.

### 6.1 확정 결정에 따른 로그인 라우팅
- **마스터**: 구글 OAuth 로그인 → `profiles.role='master'`(DB 수동 프로비저닝된 1계정)만 `/master` 콘솔 노출.
- **발급계정**: 아이디 입력 → `${login_id}@<도메인>` 합성 이메일 + 비번으로 `signInWithPassword`.
- **경계**: 구글로 로그인한 계정이 role='master'가 아니면 일반 사용자로 취급(신규 구글 셀프가입 차단 정책 필요 — 아래 §6.2).

### 6.2 신규 구글 셀프가입 차단
구글 OAuth를 마스터용으로 열어두면 임의 구글 계정이 셀프가입될 수 있음.
→ `handle_new_user` 트리거 또는 로그인 후 가드에서 **허용된 마스터 이메일(`VITE_ADMIN_EMAIL`) 외 구글 신규가입은 즉시 로그아웃/거부** 처리 필요.

## 7. 권장 진행 순서

1. 정책 결정(6번) 확정 → 2. `013_roles.sql` 마이그레이션 → 3. Edge Function 2종 →
4. `authStore`/`LandingPage` ID/PW 전환 → 5. `AdminPage` 계정관리 연동 → 6. `isAdmin` role화 → 7. 통합 테스트.

## 8. 구현 현황 (2026-07-14)

### ✅ 이번에 구현 (기반)
| 산출물 | 파일 | 상태 |
|--------|------|------|
| DB 마이그레이션 (role/login_id/status, `is_master()`, 트리거·RLS) | `supabase/migrations/013_roles.sql` | 작성 완료 (배포 필요) |
| Edge Function — 계정 생성 | `supabase/functions/master-create-account/index.ts` | 작성 완료 (배포 필요) |
| Edge Function — 임시비번 재발급(1회 표시) | `supabase/functions/master-reset-password/index.ts` | 작성 완료 (배포 필요) |
| DB 타입 | `types/database.ts` (profiles + `is_master`) | 완료 |
| 아이디/비번 로그인 | `store/authStore.ts` (`signInWithId`, `loginIdToEmail`) | 완료 |
| 구글 셀프가입 차단 | `store/authStore.ts` (`enforceGoogleMasterOnly`) | 완료 |
| role 기반 권한 판별 | `services/adminConfigService.ts` (`isMaster()`) | 완료 |
| 로그인 UI (아이디/비번 폼 + 구글=마스터전용) | `components/LandingPage.tsx` | 완료 |

프론트엔드 `tsc --noEmit` · `vite build` 통과.

### ⬜ 다음 단계 (별도 작업)
- **AdminPage 계정관리 UI**: 20 슬롯 생성/정지/비번재발급 화면 → 위 Edge Function 2종 호출, 임시비번 `.revealbox` 1회 표시.
- 관리자 RPC(`admin_get_all_requests` 등) 내부 권한검사를 `is_master()` 로 교체.
- 임시비번 재발급 **감사 로그** 테이블(누가/언제/대상, 평문 제외).

### 🚀 배포 체크리스트 (수동)
1. `supabase/migrations/013_roles.sql` 실행 (Dashboard > SQL Editor).
2. 마스터 프로비저닝: 리모가 구글 최초 로그인 → `UPDATE profiles SET role='master' WHERE email='<마스터이메일>';`
3. Edge Function 배포: `supabase functions deploy master-create-account` / `master-reset-password`.
4. Supabase Auth 설정: **이메일 확인(Confirm email) 비활성화**(합성 이메일 `@sodam.local` 수신 불가).
5. 구글 OAuth Provider는 마스터용으로 유지(§6.1 가드가 그 외 차단).

> 이 문서는 설계 + 기반 구현 기록입니다. AdminPage 계정관리 UI 는 Edge Function 배포 후 착수 권장.
