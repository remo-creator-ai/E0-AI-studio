# 작업 로그 (Migration & Integration)

REMO AI Studio v2 fork를 v1으로 통합하고 영상 생성 인프라를 안정화한 작업 기록.

## 한눈에 보는 결과

```
Before:
  - v2 fork 폴더에서 작업 중, Vercel은 v1 코드 배포 중 (혼란 상태)
  - 영상 생성 시도 시 "Bucket not found" 에러
  - Production 단계 진입 시 작동하지 않는 UI
  - Kling/VEO 코드 일부 버그

After:
  - v1을 단일 메인으로 확정, v2 작업분을 v1 main에 통합
  - Supabase Storage 버킷 생성으로 이미지 업로드 정상화
  - Production 게이트 의도적 복원 (Kling 잔고 안정화 전까지 사용자 차단)
  - VEO 3.1 URL→base64 처리 버그 수정
  - Vercel git connection v2 → v1으로 정리
  - 운영용 docs 추가 (KLING_API_GUIDE.md)
```

## 시간순 흐름

### 2026-05-14 (세션 1) — 진단 + 통합

#### 발견과 해결
| # | 발견 | 해결 |
|---|------|------|
| 1 | v2 repo가 GitHub에 없음 | `remo-creator-ai/REMO-AI-Studio-v2` 신규 생성, push |
| 2 | Vercel 라이브가 v1 코드 배포 중인데 사용자는 v2 작업 중이라 혼란 | Vercel 연결 정리 필요성 인지 |
| 3 | 영상 생성 시 "Bucket not found: scene-images" 에러 | Supabase Storage에 `scene-images` 버킷 신규 생성 (typo로 `scene-image` 단수 버킷만 있던 상태) |
| 4 | Production 단계 진입 시 "Coming Soon" 모달이 항상 표시되고 닫으면 ASSEMBLY로 강제 이동 | 임시로 게이트 해제 → 이후 다시 복원 (의도적 차단 유지) |
| 5 | "UNLOCK V-ENGINE" 큰 버튼이 잘못된 컨텍스트에서 표시 | `hasKey` 기본값을 true로 변경 (Google AI Studio iframe 가정 코드의 잔재) |
| 6 | VEO 3.1 호출 시 `Unable to process input image` 400 에러 | `scene.image_url`(URL)을 그대로 base64 필드에 전달하던 버그를 수정. URL이면 fetch 후 base64 변환, mimeType 자동 감지 |
| 7 | Kling 호출 시 `Account balance not enough` 1102 에러 | Kling Developer API의 별도 리소스팩 결제 필요. Consumer 구독(kling.ai의 3000 크레딧)과는 별개 시스템임을 진단/문서화 |
| 8 | v2 fork 후 v1이 30+ 커밋 발전했고 v2는 거의 멈춤 | v1이 사실상 상위 호환. v2의 가치 있는 추가분(storyboard JSON import, AI 엔진/기본값 설정, Python pipeline)만 v1으로 cherry-pick |

#### 정리한 코드 변경 (v1 feature 브랜치)

| 커밋 | 내용 |
|------|------|
| `7bb51df` | feat: storyboard JSON import in planning step |
| `194e18c` | feat: AI engine + project defaults settings (i18n 적용) |
| `7c423ed` | feat: unlock production engine UI (이후 revert됨) |
| `8c1d480` | chore: Python video pipeline at `tools/video_pipeline/` + `.vercelignore` |
| `81873bf` | fix: default hasKey to true |
| `41636b5` | fix: VEO 3.1 URL→base64 conversion |
| `7b5d48d` | revert: restore Coming Soon gate on production step |
| `597ece2` | Merge into main |
| `216e9ec` | docs: add Kling API operations guide |

#### 인프라 작업
- Vercel CLI 설치 + login + link
- Supabase CLI 설치 + login + link
- v1 폴더의 node_modules 재설치 (Windows shim 재생성)
- 미커밋 변경 분류:
  - 폐기: `creditStore.ts` MAX_FREE_PROJECTS=Infinity (개발 중 임시 변경)
  - 보존: LandingPage.tsx "결과 보기" CTA + `public/result-sample.png` (미완성 작업)

### 2026-05-15 ~ 2026-05-16 (세션 2) — 정리 + 검증

- v2 폴더와 v1 폴더를 동시에 로컬 dev 서버에서 띄워 비교
- Landing page 비교 결과: v1이 i18n + 추가 기능으로 상위 호환임 확인
- **v1을 단일 메인으로 확정**
- v1 feature 브랜치를 main에 머지 → push
- Vercel 대시보드에서 git connection v2 → v1으로 변경
- 빈 commit으로 자동 배포 흐름 검증

## 핵심 의사 결정

| 결정 | 이유 |
|------|------|
| v1을 메인으로 | v1이 v2 대비 라인 수 1.7배, 기능 폭 압도적. v2는 fork 직후 거의 멈춤 |
| v2 fork 보존 | v2 GitHub repo는 보존 (혼란 방지 위해 archive 권장, 결정 보류) |
| Production 게이트 복원 | Kling 잔고 0 + VEO 검증 전이라 사용자에게 작동 안 하는 UI 노출 안 함 |
| Python pipeline = v1 통합 | 같은 영상 생성 도메인. tools/video_pipeline/에 배치, `.vercelignore`로 Vercel 빌드에서 제외 |
| `process.env.GEMINI_API_KEY` 코드는 유지 | dead code지만 의미적 영향 없음. 키는 Supabase admin_config에서 가져옴 |
| Vercel manual deploy로 라이브 갱신 | git connection 변경 작업 중 임시 우회 — 안정화 후 자동 배포로 전환 |

## 시스템 구조 (현재)

```
[Frontend]
  React + Vite SPA
  ├─ GitHub: remo-creator-ai/REMO-AI-Studio-v1
  ├─ Vercel project: remo-ai-studio
  └─ Live: https://remo-ai-studio.vercel.app

[Backend / Data]
  Supabase (Mumbai region, ref: lgesfpplapmfkyslgzci)
  ├─ Auth (Google OAuth 등)
  ├─ Postgres DB (profiles, projects, user_credits, admin_config, ...)
  └─ Storage:
      ├─ scene-images/        (씬 이미지 저장)
      ├─ production-attachments/  (의뢰 첨부 ZIP/JSON)
      └─ scene-image/  (옛 typo, 비어있음, 무해)

[External APIs]
  ├─ Gemini API (Google)        — 스크립트, 이미지, VEO 3.1 영상
  ├─ Kling API (api.klingai.com) — 영상 생성 (현재 모델: kling-v1, mode: std)
  └─ Vercel `/api/kling/*` rewrite → api.klingai.com 프록시

[Offline Tools]
  tools/video_pipeline/  (운영진용 CLI, Vercel 빌드 제외)
  ├─ storyboard JSON → Kling API 자동 호출
  ├─ FFmpeg로 합성 + 자막 + TTS + BGM
  └─ Standalone Python, 라이브 서비스와 별개
```

## 미해결 / 다음 작업

| 우선도 | 작업 | 비고 |
|--------|------|------|
| 🔴 | Kling Developer API 리소스팩 충전 | `kling.ai/app`의 3000 Consumer 크레딧과 별개 — Kling dev console에서 별도 결제 필요. 자세한 내용은 `docs/KLING_API_GUIDE.md` |
| 🔴 | VEO 3.1 end-to-end 검증 | URL→base64 코드 fix 후 실제 영상 생성까지 작동하는지 확인 |
| 🟡 | Production 게이트 재오픈 | 위 2개 완료 후 `ProductionStep.tsx:85`의 `useState(true)` → `useState(false)` + line 957의 `setStep(ProjectStep.ASSEMBLY)` 제거 |
| 🟡 | v2 GitHub repo 처리 | archived 처리 권장 (보존 + 혼란 방지). 결정 보류 |
| 🟡 | LandingPage "결과 보기" 모달 마무리 | state는 추가됐지만 모달 JSX 마크업 없음. 완성하거나 폐기 결정 |
| 🟢 | 결제 SDK 도입 | TossPayments / PortOne / Stripe 중 선택. 현재는 가격표 UI만 있고 결제 처리 없음 |
| 🟢 | 백그라운드 job 시스템 | 영상 생성 폴링 중 페이지 이탈 시 발생하는 상태 일관성 문제 해결 |
| 🟢 | Mumbai → Seoul region 마이그레이션 | latency 개선용. 큰 작업이라 별도 Phase |

## 주요 참고 파일

| 파일 | 용도 |
|------|------|
| `docs/KLING_API_GUIDE.md` | Kling 운영 전반 (두 시스템, 리소스팩, 에러 트러블슈팅) |
| `docs/DEPLOYMENT.md` | (기존) 배포 가이드 |
| `docs/PRICING_AND_BUSINESS.md` | (기존) 비즈니스 가격 정책 |
| `docs/WORK_LOG.md` | 이 문서 |
| `services/storyboardImporter.ts` | 스토리보드 JSON 임포트 (v2에서 가져옴) |
| `services/geminiService.ts:428~456` | VEO 3.1 영상 생성 (URL→base64 처리) |
| `services/klingService.ts` | Kling API 호출 (JWT, 폴링) |
| `services/adminConfigService.ts` | Supabase admin_config에서 API 키 조회 (5분 캐시) |
| `components/ProductionStep.tsx:85` | Coming Soon 게이트 (현재 활성) |
| `tools/video_pipeline/README.md` | Python pipeline 사용법 |

## 워킹트리 미커밋 변경 (보존 의도)

- `components/LandingPage.tsx` — Hero 섹션의 "결과 보기" CTA 버튼 추가됨. state와 ESC 핸들러까지 있지만 모달 JSX는 미완성
- `public/result-sample.png` — 위 모달용 1.2MB 샘플 이미지 (4958×3508)

→ 진행하려면 모달 JSX 완성 후 commit, 폐기하려면 `git restore`. 현재는 살아있지만 사용자 가시 버튼 클릭 시 아무 일도 안 일어남.
