# 구글 셀프가입 전환 — 보안 점검 및 조치 현황

기준 커밋: `3d65b7b feat: 구글 셀프가입 재개 + 관리자 콘솔 계정관리 단순화`

`enforceGoogleMasterOnly()` 가드가 제거되면서 **누구나 구글 계정으로 가입**할 수 있게 됐다.
아래 항목들은 발급계정(폐쇄형) 시절에는 "로그인 자체가 통제되므로" 감수 가능했지만,
오픈 가입 이후에는 **가입 한 번으로 도달 가능한 실제 공격 경로**가 된다.

| # | 항목 | 심각도 | 상태 |
|---|---|---|---|
| 1 | `admin_config` 의 API 키가 전 사용자에게 읽기·쓰기 개방 | 🔴 Critical | **미해결** — 아키텍처 변경 필요 |
| 2 | 관리자 RPC 에 권한 검사 없음 | 🔴 High | ✅ `015_secure_admin_rpc.sql` |
| 3 | `profiles` 전체 조회 허용 | 🔴 High | ✅ `016_restrict_profiles_read.sql` |
| 4 | 프로덕션 목 모드 배포 위험 | 🟠 High | ⚠️ 환경변수 설정 필요 (코드 변경 없음) |
| 5 | 크레딧이 작업 *이후* 차감, 반환값 미확인 | 🟠 High | **미해결** |
| 6 | 관리자 콘솔 "사용 이력" 탭이 실제 모드에서 빈 목록 | 🟡 Medium | **미해결** |

---

## 1. 🔴 admin_config — API 키 전면 개방 (미해결)

`docs/DEPLOYMENT.md:235-256` 에 문서화된 현재 정책:

```sql
CREATE POLICY "Authenticated users can read admin_config"
  ON admin_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can upsert admin_config"
  ON admin_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update admin_config"
  ON admin_config FOR UPDATE TO authenticated USING (true);
```

이 테이블에는 `gemini_api_key`, `kling_access_key_id`, `kling_access_key_secret` 이 들어 있다.
**로그인한 아무나 읽을 수 있고, 심지어 덮어쓸 수도 있다.**

문서는 *"실제 관리자 제한은 앱 레벨에서 VITE_ADMIN_EMAIL 로 제어합니다"* 라고 적었으나,
그 제한은 클라이언트 번들 안의 문자열 비교(`services/adminConfigService.ts:82`)라
DevTools 로 우회된다. DB 는 그런 제한을 알지 못한다.

### 왜 RLS 만 잠그면 안 되는가

AI 호출이 **브라우저에서** 일어나고, 키를 브라우저가 직접 읽는 구조이기 때문이다.

```
services/adminConfigService.ts:20   supabase.from('admin_config').select('value')  ← 브라우저
services/geminiService.ts           new GoogleGenAI({ apiKey: await getApiKey() }) ← 브라우저
services/klingService.ts            createJWT(...)  ← 브라우저에서 Kling 시크릿 서명
```

따라서 `admin_config` 를 마스터 전용으로 잠그면 **일반 사용자의 AI 기능이 전부 죽는다.**
RLS 변경은 반드시 아래 순서로 진행해야 한다.

### 조치 순서 (이 순서를 지킬 것)

1. Edge Function 프록시 신설 — `generate-image`, `generate-video` 등.
   키는 Supabase Function Secret 으로 옮기고, 함수 안에서 호출자 인증 + 크레딧 차감까지 수행.
2. `services/geminiService.ts` / `klingService.ts` 가 프록시를 호출하도록 전환.
   클라이언트에서 `getAdminConfig('*_api_key')` 호출을 전부 제거.
3. 그 다음에 아래 SQL 적용 (**2단계 완료 전에는 적용 금지**):

```sql
DROP POLICY IF EXISTS "Authenticated users can read admin_config"   ON admin_config;
DROP POLICY IF EXISTS "Authenticated users can upsert admin_config" ON admin_config;
DROP POLICY IF EXISTS "Authenticated users can update admin_config" ON admin_config;

CREATE POLICY "Master can read admin_config"
  ON admin_config FOR SELECT TO authenticated USING (public.is_master());
CREATE POLICY "Master can insert admin_config"
  ON admin_config FOR INSERT TO authenticated WITH CHECK (public.is_master());
CREATE POLICY "Master can update admin_config"
  ON admin_config FOR UPDATE TO authenticated USING (public.is_master());
```

4. 위 작업 전에 **기존 Gemini/Kling 키를 폐기하고 재발급**할 것.
   이미 오픈 가입 상태로 운영됐다면 유출됐다고 가정해야 한다.

> `admin_config` 테이블의 생성 SQL 은 레포에 없다 (`git grep admin_config -- "*.sql"` → 0건).
> 대시보드에서 수동 생성된 것으로 보이므로, 실제 정책은 대시보드에서 직접 확인할 것.

---

## 2. ✅ 관리자 RPC 권한 검사 — `015_secure_admin_rpc.sql`

`012_admin_production_requests_policy.sql` 의 두 RPC 는 `SECURITY DEFINER`(RLS 우회) 인데
함수 본문에 호출자 검사가 없고 EXECUTE 가 `authenticated` 전체에 부여돼 있었다.
파일 주석 *"SECURITY DEFINER ensures only admin logic runs"* 는 사실과 반대다 —
`SECURITY DEFINER` 는 권한을 검사하지 않고 RLS 를 **건너뛴다**.

가입자 누구나 다음이 가능했다:
```js
await supabase.rpc('admin_get_all_requests')       // 전체 제작 의뢰 열람
await supabase.rpc('admin_update_request_status')  // 남의 의뢰 상태 변경
```

`015` 가 두 함수에 `IF NOT public.is_master() THEN RAISE EXCEPTION` 을 추가한다.
`013_roles.sql:70-72` 에 TODO 로 남아 있던 항목이다.

---

## 3. ✅ profiles 전체 조회 — `016_restrict_profiles_read.sql`

`006_original_creator.sql` 의 `USING (true)` 정책 때문에 로그인한 누구나
`supabase.from('profiles').select('*')` 로 **전 사용자 이메일을 덤프**할 수 있었다.
PERMISSIVE 정책은 OR 결합이므로, 이 한 줄이 `013` 의 마스터 전용 정책도 무의미하게 만들었다.

`016` 은 해당 정책을 제거하고, 원래 필요했던 "원 제작자 표시" 용도만
`get_public_profile()` RPC(= `display_name` / `avatar_url` 만 반환, **email 미포함**)로 대체한다.

**코드 변경과 짝으로 적용해야 한다** — `services/projectService.ts` 가 이미
`.from('profiles')` 대신 `rpc('get_public_profile')` 를 호출하도록 수정돼 있다.

적용 후 관리자 콘솔의 계정 목록은 마스터의 `profiles.role = 'master'` 설정에 의존한다:
```sql
-- 대상자가 구글로 최소 1회 로그인한 뒤 1회 실행
UPDATE public.profiles SET role = 'master'
WHERE lower(email) = lower('<마스터 구글 이메일>');
```

---

## 4. ⚠️ 프로덕션 목 모드 배포 위험 (환경변수 조치)

```ts
// lib/mockAuth.ts:17-22
export const MOCK_MODE =
  env.VITE_MOCK_AUTH === 'true'  ? true
  : env.VITE_MOCK_AUTH === 'false' ? false
  : !env.VITE_SUPABASE_URL;   // ← 기본: URL 없으면 자동 ON
```

`.env.example` 의 `VITE_MOCK_AUTH=` 는 빈 문자열이라 자동 판정 경로를 탄다.
**Vercel 에서 `VITE_SUPABASE_URL` 오타 하나만 나도 조용히 목 모드로 배포**되고,
그러면 로그인 화면에 "🛡 마스터(오픈놀) 가계정으로 입장" 버튼이 노출된다 —
클릭 한 번에 관리자 콘솔이다.

→ Vercel Production/Preview 양쪽에 **`VITE_MOCK_AUTH=false` 를 명시적으로** 설정할 것.

---

## 5. 🟠 크레딧이 작업 이후에 차감됨 (미해결)

```
components/ProductionStep.tsx:205  if (!hasEnough(cost))       ← 클라이언트 로컬 상태만 검사
components/ProductionStep.tsx:217  await generateSceneVideo()  ← 비싼 API 먼저 호출
components/ProductionStep.tsx:224  await deduct(cost, ...)     ← 그 다음 차감
```

`hasEnough()` 는 zustand 로컬 값만 읽고, `deduct()` 가 실패해도(`return false`)
호출부 어디도 반환값을 확인하지 않는다. 영상은 이미 생성됐고 결과는 그대로 표시된다.
같은 패턴이 `PlanningStep.tsx`, `VisualizingStep.tsx`, `AssemblyStep.tsx` 에도 있다.

**서버는 "이 사용자가 이 작업에 대해 결제했는가"를 전혀 모른다.**

1번의 Edge Function 프록시를 만들 때 **차감을 프록시 안으로 옮기면** 함께 해결된다.
(DB 의 `deduct_credits` 자체는 `WHERE balance >= p_amount` 단일 UPDATE 라
이중 차감 레이스는 발생하지 않는다 — 이 부분은 정상이다.)

---

## 6. 🟡 관리자 콘솔 "사용 이력" 탭 (미해결)

`011_credit_transactions.sql` 의 SELECT 정책이 `auth.uid() = user_id` 뿐이라
**마스터에게도 본인 거래 내역만 보인다.** 에러 없이 조용히 빈 목록이 된다.
`015`/`016` 으로는 해결되지 않는다 — `credit_transactions` 에 마스터 예외 정책을
추가하거나 전용 RPC 가 필요하다.

추가로 `services/masterService.ts` 는 실제 모드에서:
- 모든 사용자 잔액을 `balance: 0` 으로 하드코딩 표시 (`user_credits` 조인 미구현)
- `account_email` 자리에 **UUID** 출력 (`user_id → email` 매핑 미구현)
- `adjustCredit()` 이 항상 실패 (`admin_adjust_credit` RPC 미구현)

---

## 적용 순서 요약

```
1) 013_roles.sql 적용 여부 확인        -- is_master() 가 없으면 015/016 이 실패
2) 014_signup_credits_20.sql           -- 신규 20 (기존 60 유지)
3) 015_secure_admin_rpc.sql
4) 016_restrict_profiles_read.sql      -- ⚠️ 코드 배포와 동시에
5) UPDATE profiles SET role='master'   -- 마스터 계정 지정
6) Vercel: VITE_MOCK_AUTH=false, VITE_ADMIN_EMAIL 설정 후 재배포
```

`VITE_*` 변수는 **빌드 타임에 번들로 인라인**되므로 환경변수만 바꾸고
재배포하지 않으면 반영되지 않는다.

1번(admin_config)은 위 순서와 별개로, Edge Function 프록시 작업 후에 진행한다.
