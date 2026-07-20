# 개발팀 해결 이슈사항

미해결 과제를 모아두는 문서. 새 이슈는 아래 표에 한 줄 추가하고, 상세는 그 아래 섹션에 붙인다.

**상태 표기**: `미해결` · `진행중` · `해결` · `보류` · `종결(조치 불필요)`

| ID | 이슈 | 심각도 | 상태 | 등록일 |
|---|---|---|---|---|
| DEV-001 | `admin_config` API 키가 전 사용자에게 읽기·쓰기 개방 | 🔴 Critical | 미해결 | 2026-07-20 |
| DEV-002 | 크레딧이 작업 *이후* 차감되고 반환값을 확인하지 않음 | 🟠 High | 미해결 | 2026-07-20 |
| DEV-003 | 관리자 콘솔이 실제 모드에서 반쪽 동작 | 🟡 Medium | 미해결 | 2026-07-20 |
| DEV-004 | 역할 체계(`profiles.role` / `is_master()`)가 배선되지 않음 | 🟡 Medium | 미해결 | 2026-07-20 |
| DEV-005 | 고아 Edge Function 2개가 배포된 채 남아 있을 수 있음 | 🟡 Medium | 미해결 | 2026-07-20 |
| DEV-006 | `vercel.json` 의 Kling 프록시가 인증 없이 개방 | 🟡 Medium | 미해결 | 2026-07-20 |
| DEV-007 | 미사용 컬럼 `login_id` / `status` 잔존 | 🟢 Low | 미해결 | 2026-07-20 |

---

## DEV-001 · `admin_config` API 키 전면 개방 🔴

**증상** — `gemini_api_key`, `kling_access_key_id`, `kling_access_key_secret` 이 담긴
`admin_config` 테이블의 RLS 가 SELECT/INSERT/UPDATE 모두 `TO authenticated USING (true)`
(`docs/DEPLOYMENT.md:235-256`). 로그인한 아무나 키를 **읽고 덮어쓸 수** 있다.

발급계정 시절엔 로그인 자체가 통제돼 감수 가능했으나, 구글 셀프가입(`3d65b7b`) 이후
구글 계정 하나만 만들면 누구나 도달한다.

**왜 RLS 만 잠그면 안 되는가** — AI 호출이 브라우저에서 일어나고 키를 브라우저가 직접 읽는다.
```
services/adminConfigService.ts:20   supabase.from('admin_config').select('value')
services/geminiService.ts           new GoogleGenAI({ apiKey: await getApiKey() })
services/klingService.ts            createJWT(...)   ← 브라우저에서 시크릿 서명
```
마스터 전용으로 잠그면 **일반 사용자의 AI 기능이 전부 죽는다.**

**해결 순서 (반드시 이 순서)**
1. Edge Function 프록시 신설 — 키를 Function Secret 으로 이전, 함수 내에서 호출자 인증 + 크레딧 차감
2. `geminiService` / `klingService` 가 프록시를 호출하도록 전환, 클라이언트의 `getAdminConfig('*_key')` 제거
3. 그 다음 `admin_config` RLS 를 `is_master()` 로 축소 (SQL 은 `docs/SECURITY_OPEN_SIGNUP.md` §1)
4. **기존 Gemini/Kling 키 폐기 후 재발급** — 오픈 가입으로 운영된 적 있다면 유출 가정

> DEV-002 를 함께 해결할 수 있는 경로다 (차감을 프록시 안으로).

상세: `docs/SECURITY_OPEN_SIGNUP.md` §1

---

## DEV-002 · 크레딧 후차감 + 반환값 미확인 🟠

```
components/ProductionStep.tsx:205  if (!hasEnough(cost))       ← 클라이언트 로컬 상태만 검사
components/ProductionStep.tsx:217  await generateSceneVideo()  ← 비싼 API 먼저 호출
components/ProductionStep.tsx:224  await deduct(cost, ...)     ← 그 다음 차감
```

`hasEnough()` 는 zustand 로컬 값만 읽는다. `deduct()` 가 실패해도(`return false`)
**호출부 어디도 반환값을 확인하지 않는다** — 영상은 이미 생성됐고 결과는 그대로 표시된다.
같은 패턴: `PlanningStep.tsx`, `VisualizingStep.tsx`, `AssemblyStep.tsx`.

서버는 "이 사용자가 이 작업에 대해 결제했는가"를 모른다.

**해결** — DEV-001 의 프록시 안으로 차감을 이동. 프록시가 차감 성공을 확인한 뒤에만 AI 를 호출.

**정상인 부분** — DB 의 `deduct_credits` 는 `WHERE balance >= p_amount` 단일 조건부 UPDATE 라
행 잠금이 걸린다. **이중 차감 레이스는 발생하지 않는다.**

---

## DEV-003 · 관리자 콘솔 실제 모드 반쪽 동작 🟡

`services/masterService.ts` 의 실제 모드 분기가 미완성이다.

| 증상 | 원인 |
|---|---|
| 사용 이력 탭이 빈 목록 | `011_credit_transactions.sql` SELECT 정책이 `auth.uid() = user_id` 뿐 → 마스터에게도 본인 것만. 에러 없이 조용히 0행 |
| 모든 사용자 잔액이 `0` | `user_credits` 조인 미구현, `balance: 0` 하드코딩 |
| 이메일 자리에 UUID | `user_id → email` 매핑 미구현 |
| 크레딧 지급이 항상 실패 | `admin_adjust_credit` RPC 미구현 |

**해결** — `credit_transactions` 에 마스터 예외 정책 추가(또는 전용 RPC), `admin_adjust_credit` 구현,
`user_credits`/`profiles` 조인 완성.

---

## DEV-004 · 역할 체계가 배선되지 않음 🟡

관리자 콘솔 접근을 결정하는 것은 DB 가 아니라 **환경변수 문자열 비교 하나**다.

```ts
// services/adminConfigService.ts:79-85 — 실제로 작동하는 유일한 게이트
export function isAdmin(userEmail) {
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  return userEmail.toLowerCase() === adminEmail.toLowerCase();
}
```
- `isAdmin()` 호출자: `Layout.tsx:154`, `AdminPage.tsx:46` — 이 둘이 전부
- `isMaster()` (`adminConfigService.ts:91`, `rpc('is_master')`) 호출자: **0건**

**문제점**
- 관리자가 **동시에 한 명만** 가능 (단일 문자열 비교)
- `VITE_ADMIN_EMAIL` 은 클라이언트 번들에 평문으로 박힘 — 누구나 관리자 이메일을 알 수 있음
- UI 숨김일 뿐 실질적 보안 경계가 아님

**해결** — `AdminPage` / `Layout` 이 `isAdmin()` 대신 `isMaster()` 를 쓰도록 전환.
그래야 `profiles.role` 이 실제 권한 근거가 되고 관리자 복수 지정도 가능해진다.
`015`/`016` 적용 후에는 DB 쪽이 이미 `is_master()` 기준이므로 프론트만 맞추면 된다.

---

## DEV-005 · 고아 Edge Function 🟡

`supabase/functions/master-create-account/`, `master-reset-password/` 가 레포에 남아 있으나
**애플리케이션 코드에 `supabase.functions.invoke(...)` 호출이 0건**이다 (`3d65b7b` 에서 호출부 제거).

UI 는 사라졌지만 **이미 배포돼 있다면 여전히 HTTP 로 직접 호출 가능**하다.
`master-create-account` 는 `admin.createUser` 로 계정을 만들 수 있는 함수다.

**해결** — Supabase 대시보드에서 배포 여부 확인 후, 미사용이면 배포 해제 + 레포에서 삭제.
레포만으로는 배포 상태를 알 수 없다.

---

## DEV-006 · Kling 프록시 인증 없음 🟡

```json
// vercel.json:5-10
"/api/kling/:path*"  →  "https://api.klingai.com/..."
```
인증 없는 개방형 리라이트다. 제3자가 이 도메인을 Kling 프록시로 무단 사용할 수 있다
(호출자 자신의 Kling 토큰은 필요하므로 직접적 과금 피해는 제한적이나, 트래픽·평판 리스크).

**해결** — DEV-001 의 Edge Function 프록시로 통합하면서 리라이트 제거.

---

## DEV-007 · 미사용 컬럼 잔존 🟢

`013_roles.sql:8-19` 이 추가한 `profiles.login_id`, `profiles.status` 를 앱이 더 이상 쓰지 않는다.

특히 `status` 가 위험하다 — **`status='suspended'` 로 바꿔도 이를 확인하는 코드가 없어
정지가 실제로 동작하지 않는다.** 운영자가 "정지시켰다"고 착각할 수 있다.

**해결** — 정지 기능을 다시 도입할지 결정. 안 쓸 거면 컬럼과 관련 RLS 정책 제거,
쓸 거면 로그인 경로에서 `status` 를 검사하도록 구현.

---

## 종결된 항목

| ID | 이슈 | 결론 |
|---|---|---|
| — | `playwright` devDependency 에 config/spec 파일 없음 | 종결 — 로컬에서 정상 동작 확인됨 (2026-07-20) |

---

## 이미 조치된 항목 (참고)

| 조치 | 커밋 / 파일 |
|---|---|
| 신규 가입 크레딧 60 → 20 (기존 60 유지) | `a9d25f1` · `014_signup_credits_20.sql` |
| 관리자 RPC 에 `is_master()` 검사 추가 | `a7a0d32` · `015_secure_admin_rpc.sql` |
| `profiles` 전체 조회 정책 제거 + `get_public_profile()` RPC | `a7a0d32` · `016_restrict_profiles_read.sql` |

**주의**: 위 마이그레이션은 파일로만 존재한다. 레포에 마이그레이션 러너가 없으므로
Supabase 대시보드 SQL Editor 에서 수동 실행해야 DB 에 반영된다.
적용 순서는 `docs/SECURITY_OPEN_SIGNUP.md` 하단 참조.
