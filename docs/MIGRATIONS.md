# 마이그레이션 운영 가이드

이 프로젝트는 지금까지 마이그레이션 러너 없이, Supabase 대시보드 SQL Editor 에서
사람이 직접 SQL 을 붙여넣는 방식으로 운영됐다. 그 결과:

- `supabase/schema.sql` 이 `migrations/` 밖에 있어 프레시 DB 를 만들 수 없었다
- 어느 환경에 어디까지 적용됐는지 추적할 방법이 없었다
- `admin_config` 테이블처럼 **레포에 SQL 자체가 없는** 객체가 생겼다
- `005` 의 크레딧 값과 UI 표시값이 오래 어긋나 있었다

Supabase CLI 를 러너로 도입해 이를 정리한다.

---

## 준비

CLI 는 devDependency 로 설치돼 있다 (전역 설치 불필요).

```bash
npm install          # supabase CLI 포함
npx supabase --version
```

npm 스크립트:

| 명령 | 용도 |
|---|---|
| `npm run db:start` | 로컬 Supabase 스택 기동 (Docker 필요) |
| `npm run db:stop` | 로컬 스택 정지 |
| `npm run db:reset` | 로컬 DB 를 날리고 마이그레이션 전체를 처음부터 재적용 |
| `npm run db:new -- <이름>` | 새 마이그레이션 파일 생성 |
| `npm run db:status` | 로컬/원격 적용 현황 비교 |
| `npm run db:diff` | 대시보드에서 수동 변경한 내용을 SQL 로 추출 |
| `npm run db:push:dry` | 원격에 무엇이 적용될지 미리보기 (**실행 안 함**) |
| `npm run db:push` | 원격에 미적용 마이그레이션 적용 |

---

## ⚠️ 최초 1회: 기존 운영 DB 베이스라인

**가장 위험한 단계다. 순서를 지킬 것.**

운영 DB 에는 `001`~`013` 이 이미 수동 적용돼 있지만, CLI 가 쓰는 이력 테이블
(`supabase_migrations.schema_migrations`)에는 아무 기록이 없다. 이 상태로
`db push` 를 하면 **CLI 가 001 부터 전부 다시 실행하려 든다.**

`migration repair` 로 "이미 적용됨" 표시만 남기고 실행은 건너뛰게 만든다.

### 1) 링크

```bash
npx supabase login                      # SUPABASE_ACCESS_TOKEN 발급/입력
npx supabase link --project-ref <프로젝트 ref>
```

`<프로젝트 ref>` 는 Supabase 대시보드 URL 의
`https://supabase.com/dashboard/project/**<여기>**` 부분이다.

### 2) 현황 확인 (아무것도 바꾸지 않음)

```bash
npm run db:status
```

`Remote` 열이 전부 비어 있어야 정상이다. 이미 값이 있다면 누군가 베이스라인을
잡은 것이므로 **여기서 멈추고** 무엇이 적용됐는지 먼저 파악할 것.

### 3) 베이스라인 표시

`001`~`013` 을 "적용됨"으로 표시한다. **실행되지 않는다.**

```bash
npx supabase migration repair --status applied 001 002 003 004 005 006 007 008 009 010 011 012 013
```

> `017_admin_config.sql` 은 운영 DB 에 이미 테이블이 있으므로 여기 포함할지
> 판단이 필요하다. 대시보드에서 `admin_config` 존재를 확인한 뒤,
> 있으면 `017` 도 `--status applied` 로 함께 표시할 것.
> 없으면 표시하지 말고 4단계에서 적용되게 둔다.

### 4) 미적용분 미리보기 → 적용

```bash
npm run db:push:dry     # 014~018 만 나열되는지 확인
npm run db:push
```

`014` 이전 버전이 목록에 보이면 **중단하고 3단계를 다시 확인**할 것.

### 5) 검증

```bash
npm run db:status       # Local / Remote 가 일치해야 함
```

DB 에서 직접:

```sql
-- 신규 가입 크레딧이 20인지
SELECT prosrc LIKE '%20, 20%' FROM pg_proc WHERE proname = 'initialize_user_credits';

-- 기존 사용자가 60 그대로인지 (014 이전 가입자)
SELECT max_credits, count(*) FROM public.user_credits GROUP BY max_credits;

-- deduct_credits 오버로드가 1개만 남았는지
SELECT p.oid::regprocedure FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'deduct_credits';
```

---

## 적용 순서상 주의

`016_restrict_profiles_read.sql` 은 **코드 배포와 짝**이다.
`services/projectService.ts` 가 `get_public_profile()` 을 호출하도록 바뀐 뒤에
적용해야 원 제작자 표시가 유지된다.

→ **코드 먼저 배포하고 그다음 `db push`** 하는 순서가 안전하다.
(반대로 하면 제작자 이름이 잠시 안 뜬다. 코드가 먼저면 문제없다.)

---

## 이후 작업 방식

```bash
npm run db:new -- add_something     # 파일 생성
# SQL 작성
npm run db:reset                    # 로컬에서 처음부터 재적용해 검증
npm run db:push:dry                 # 원격 미리보기
npm run db:push                     # 적용
```

**대시보드에서 직접 SQL 을 실행하지 말 것.** 불가피하게 했다면 즉시
`npm run db:diff` 로 추출해 마이그레이션 파일로 남긴다. 그러지 않으면
`admin_config` 처럼 "DB 에는 있는데 레포에는 없는" 객체가 다시 생긴다.

---

## 파일 규약

기존 파일은 `001_`~`018_` 3자리 접두사를 쓴다. `supabase migration new` 는
`20260720123456_name.sql` 형식의 14자리 타임스탬프를 만든다.

두 형식은 문자열 정렬상 `018_` < `2026...` 이므로 **섞여도 순서가 깨지지 않는다.**
기존 파일을 굳이 리네이밍하지 말 것 — 이미 베이스라인에 기록된 버전 문자열이라
이름을 바꾸면 이력이 어긋난다.

---

## 이번에 고친 것 (2026-07-20)

CLI 도입 과정에서 발견된 기존 마이그레이션의 실제 결함:

| 파일 | 문제 | 조치 |
|---|---|---|
| `schema.sql` | `migrations/` 밖에 있어 프레시 DB 구축 불가 | `001_initial_schema.sql` 로 편입 |
| `002`, `003` | `get_project_summaries` 를 `CREATE OR REPLACE` 로 반환 컬럼 수를 바꿔 `42P13`. 003 은 프레시에서, 002 는 재실행에서 실패 (로컬 재실행 테스트로 발견) | 각 선행 `DROP FUNCTION` 추가 |
| `001`, `005`, `008`, `011` | `CREATE POLICY` / `CREATE TRIGGER` / `CREATE INDEX` 재실행 시 `42710`·`42P07` | `DROP ... IF EXISTS` / `IF NOT EXISTS` 추가 |
| `admin_config` | 레포에 SQL 없음 → 프레시 DB 에서 API 키 조회 실패 | `017_admin_config.sql` 신규 |
| `deduct_credits` | 2인자/3인자 오버로드 공존 → `PGRST203` 모호성 위험 | `018` 에서 구버전 제거 |

특히 `003` 은 **프레시 DB 에서 마이그레이션 체인이 반드시 멈추던 버그**다.
수동 적용 시절에는 사람이 필요한 것만 골라 실행해서 드러나지 않았다.

### 로컬 검증 결과 (2026-07-21, Postgres 17)

`supabase db reset` 으로 실제 Postgres 에서 확인:

- **프레시 적용**: 001~018 전부 순서대로 성공 (에러 0)
- **재실행 안전성**: 이미 적용된 DB 에 전체 체인 재실행 → 18개 전부 에러 0
- **결과값 확인**: 신규 크레딧 20 / `deduct_credits` 오버로드 1개 / admin RPC 양쪽
  `is_master` 검사 존재 / profiles 전체읽기 정책 제거 / `get_public_profile` 생성 /
  `admin_config` 생성 / `get_project_summaries` INVOKER 유지(004 보안수정 보존)

`002` 의 재실행 실패는 이 로컬 테스트로 발견됐다 — 정적 감사만으로는 놓쳤다.
