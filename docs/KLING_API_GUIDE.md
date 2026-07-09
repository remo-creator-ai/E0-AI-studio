# Kling API 운영 가이드

REMO AI Studio가 영상 생성에 사용하는 Kling AI API의 운영/트러블슈팅 가이드입니다.

## 1. 두 개의 별개 시스템 — 가장 중요

Kling은 같은 회사 안에서 **두 가지 완전히 분리된 결제 시스템**을 운영합니다.

| 시스템 | URL | 사용처 | 결제 방식 |
|--------|-----|--------|----------|
| **Consumer** | https://kling.ai/app | 웹 UI에서 직접 영상 생성 | Pro/Standard 구독 + 크레딧 |
| **Developer API** | https://klingai.com (dev console) | REMO 같은 API 호출 (api.klingai.com) | **리소스팩 (만료 있음)** |

> ⚠️ **Consumer 구독 (예: Pro 연간 + 3000 크레딧)은 Developer API 호출에 전혀 사용되지 않습니다.** 같은 이메일로 가입했어도 별도 계정/결제. OpenAI ChatGPT Plus가 OpenAI API와 별개인 것과 동일.

## 2. Developer API의 "리소스팩" 모델

Kling Developer API는 일반적인 충전식 잔고(USD prepaid)가 아니라 **리소스팩(资源包)** 방식입니다.

- 패키지 단위로 구매 (예: "100 유닛, 1개월 유효")
- 영상 생성마다 패키지에서 유닛 차감
- 만료기한 도달 시 남은 유닛 무효화
- 새 패키지를 추가 구매해야 계속 사용 가능

### Dev Console 위치
- **리소스팩 관리** 메뉴 — 보유 패키지 + 유닛 잔량 + 만료일 확인
- **리소스팩 구매** 메뉴 — 새 패키지 결제

### 일반적인 패키지 옵션 (실제 가격은 Kling 페이지 확인)

| 패키지 | 유닛 | 가격 (대략) | 만료 | 적합 용도 |
|--------|------|-----------|------|---------|
| Trial | 적음 | $0 | 7~30일 | 신규 가입 시 |
| Small | 100 유닛 | ~$10~$20 | 1개월 | 검증 + 초기 운영 |
| Medium | 500 유닛 | ~$30~$50 | 1~3개월 | 일반 운영 |
| Large | 1500 유닛+ | ~$100+ | 6개월~1년 | 본격 운영 |

5초 Standard 영상 1개 = 약 1 유닛 (mode/duration에 따라 변동).

## 3. 현재 REMO가 호출하는 모델 / 파라미터

`services/klingService.ts:75-83`:
```typescript
{
  model_name: 'kling-v1',     // 기본 모델
  mode: 'std',                // Standard (저비용)
  duration: '5',              // 5초 클립
  aspect_ratio: '16:9' or '9:16',
  cfg_scale: 0.5,
}
```

endpoint: `/v1/videos/image2video` (이미지→영상)

### Kling 모델 라인업
| 모델 | 출시 | 상대 비용 |
|------|------|----------|
| `kling-v1` ⭐ 현재 사용 | 2024 초 | 1x |
| `kling-v1-5` | 2024 중 | 1.2x |
| `kling-v1-6` | 2024 후반 | 1.5x |
| `kling-v2-master` | 2025 | 2x |
| `kling-v2-1-master` | 2025 후반 | 2.5x |

### Mode (std vs pro)
- `std` (Standard): 1 유닛 / 5초 영상
- `pro` (Pro): 2 유닛 / 5초 영상

## 4. API 키 관리

### 발급 위치
Kling Developer Console (https://klingai.com 또는 app.klingai.com) → Access Keys 메뉴
- Access Key ID (32자 영숫자)
- Access Key Secret (32자 영숫자)

### REMO에서 등록 위치
`admin_config` 테이블 (Supabase) — 사이트의 **Admin 페이지**에서 갱신 가능 (admin 이메일로 로그인 시 접근).

```
admin_config.key = 'kling_access_key_id'        | value = AXXXXXX...
admin_config.key = 'kling_access_key_secret'    | value = XXXXXX...
```

브라우저 클라이언트가 `getAdminConfig('kling_access_key_id')`로 읽어와서 JWT 서명 → API 호출.

### 보안 주의
- Access Key는 **클라이언트(브라우저)에 노출됨** — admin_config는 anon key로 접근 가능
- 진정한 보안 강화하려면 Vercel Function이나 Supabase Edge Function으로 서버 측 호출 구조 도입 필요 (별도 작업)

## 5. 에러 트러블슈팅

### `code 1102: Account balance not enough`
HTTP 상태는 429지만 실제 원인은:
- 리소스팩 잔고/유닛 부족
- 또는 모든 리소스팩 만료

**해결**: Dev Console → 리소스팩 구매 → 새 패키지 결제.

### `code 4xx: Invalid Authorization`
- Access Key ID 또는 Secret 잘못
- JWT 시그니처 오류 (시계 동기화 문제일 수도)

**해결**: admin_config의 키가 dev console의 키와 정확히 일치하는지 확인. 키 재발급 후 admin_config 갱신.

### `Bucket not found` (Supabase 측 에러)
- `scene-images` 또는 `production-attachments` 버킷이 Supabase Storage에 없음
- 이미 한 번 해결된 이슈 (2026-05-14에 `scene-images` 버킷 신규 생성)

### Kling 호출 자체가 안 떠짐
- `vercel.json`의 `/api/kling/*` rewrite 확인
- `api.klingai.com` 도메인 reachability 확인

## 6. 모니터링 / 잔고 추적

현재 코드는 잔고 사전 체크를 안 함. 매번 호출 시 시도하고 1102 에러 받으면 그제서야 사용자에게 알림.

### 권장 개선 (향후 작업)
- 정기적으로 Kling Dev API의 quota/balance 엔드포인트 폴링
- 잔고 임계치 (예: 10유닛 미만) 시 Slack/이메일 경고
- 사이트 UI에 현재 dev quota 표시 (관리자 페이지)

## 7. 비용 추정 가이드

### 영상당 비용 (Kling Standard mode, 5초)
- API 비용: ~$0.07 (≈ 1 유닛)
- 우리 시스템에서 사용자에게 차감되는 크레딧: 30 (`CREDIT_COSTS.VIDEO_STANDARD`)

### 프로젝트당 비용
한 프로젝트는 보통 18 씬 (`SceneCount.CUTS_18`):
- 영상 18개 × 1 유닛 = 18 유닛 (kling-v1 std)
- 사용자 크레딧 18 × 30 = 540 크레딧 차감

### 월간 운영 비용 예시 (100 사용자)
- 사용자당 평균 2 프로젝트 = 36 영상
- 100명 × 36 = 3600 유닛
- 약 4 ~ 5개의 1000 유닛 패키지 ($150 ~ $250 / 월)

## 8. 연락처 / 참고

- Kling AI 공식: https://kling.ai
- Developer Docs (중국어): https://docs.qingque.cn/
- Developer Console: https://klingai.com (또는 app.klingai.com)
- 지원: Kling 사이트의 contact/support 페이지

## 9. 본 문서 히스토리

| 날짜 | 변경 |
|------|------|
| 2026-05-14 | 초안 작성 — 두 시스템 분리, 리소스팩 모델, 1102 에러 진단 가이드 |
