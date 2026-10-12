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

---

# 작업 로그 (소담스퀘어/오픈놀 버전 기획)

기존 REMO AI Studio를 소담스퀘어(운영: 오픈놀) 전용 버전으로 재구성하기 위한 기획 트랙. 기존 v1 저장소와 **분리된 신규 저장소**로 진행.

## 한눈에 보는 결과

```
- 현재 제공 범위 확정: 스토리보드 제작까지만 / 영상제작은 기존 게이팅 그대로 차단 유지
- 인증 전환 방향 확정: Google OAuth 제거 → 아이디/비번 발급 체계
- 3-Tier 계정 구조 설계: 리모(개발사) → 오픈놀(마스터 1개) → 발급계정 최대 20개
- 마스터 크레딧 부여 한도(pool) 도입: 임시 60,000 (REMO 협의하 변경)
- 기획 산출물 HTML 3종 작성
- 신규 Private 저장소 생성·업로드: newtechremo/sodam-ai-studio
- 보안: 하드코딩된 Gemini API 키 제거
```

### 2026-07-09 (세션) — 현황 진단 + 소담 버전 기획 + 신규 저장소

#### 1. 현황 진단
| 확인 | 결과 |
|------|------|
| 스토리보드→영상제작 연결 | 파이프라인 코드 완결·실제 API 연동(Kling/VEO). Mock 아님 |
| 영상제작 사용자 진입 | `ProductionStep.tsx:86` `showComingSoonModal=true`로 완전 차단. 모달 탈출 경로 2개 모두 ASSEMBLY 복귀 → 렌더 UI 도달 불가 |
| 크레딧 소진 기준 | 스토리보드(이미지 매트릭스) 2~5 / 업스케일 2K=3·4K=5 / 스크립트 1 / 영상 30(Kling)·100(VEO). 영상은 차단 중이라 실제 미소진 |

#### 2. 소담스퀘어 버전 설계 확정사항
| 항목 | 확정 |
|------|------|
| 제공 범위 | 스토리보드 제작까지. 영상제작은 기존 차단 유지(코드 변경 없음) |
| 유저 간 의뢰 | 사이트 내 유저 지정 의뢰 행위 제외. 스토리보드 내보내기·이메일 발송만 |
| 인증 | Google 제거 → 아이디/비번. 셀프가입 없음 (아이디→합성이메일 매핑 제안) |
| 마스터 범위 | 오픈놀 1개 고정 (다중 고객사 제외) |
| 아이디 생성 | 마스터가 직접 지정 (예: sodam-gangnam) |
| 초기 크레딧 | 신규 계정 60 자동 (기존값 유지) |
| 마스터 부여 한도 | 임시 60,000 크레딧 · REMO 협의하 변경 (`masters.credit_quota`) |
| 계정 삭제 | 정지(이력 보존)만. 완전 삭제 없음 |
| REMO 슈퍼관리자 | 초기엔 DB 수동 프로비저닝 (별도 UI 없음) |
| 수신 주소 | 고정 1개: `momo.ai.fren@gmail.com` (서버 주입) |
| 비밀번호 재발급 | 임시 비번 자동생성 후 전달 |

#### 3. 데이터 모델 방향 (미구현, 설계만)
- 신규: `masters`(단일 행, `credit_quota`), `accounts/profiles`(20개 상한), 마스터 RPC, authStore 교체
- 재활용: `user_credits`, `credit_transactions`(type=manual 부여 로그), `production_requests`(+`recipient_email` 컬럼), `admin_get_all_requests`

#### 4. 산출물 (프로젝트 루트 HTML)
| 파일 | 내용 |
|------|------|
| `크레딧_영상제작_현황.html` | 영상제작 연결 현황 + 크레딧 소진 기준 + 논의 지점 |
| `와이어프레임_소담스퀘어.html` | 3-Tier 계정 구조 저해상도 와이어프레임 + 확정 결정 |
| `마스터_UI시안_소담스퀘어.html` | 마스터 영역 6화면 하이파이 UI 시안(앱 디자인 토큰 반영) |

#### 5. 신규 저장소 업로드
- **newtechremo/sodam-ai-studio** (Private) 생성, `main` 브랜치 push (89 파일)
- 완전 신규 `git init` — 기존 v1 저장소와 히스토리 분리
- 커밋 신원: 이 저장소 한정 `newtechremo`

#### 6. 보안 조치
- `tools/video_pipeline/src/video_pipeline/config.py:59`의 **하드코딩 Gemini 키 제거** → `os.getenv("GEMINI_API_KEY", "")`
- `.env`·`node_modules`·`.omc/`·`.claude/` 스테이징 제외 검증
- ⚠️ **미완료(사용자 조치 필요):** 노출됐던 키 `AIzaSyD…QetFTA` Google 콘솔에서 폐기(rotate) 필요

### 2026-07-10 (세션) — 제품명 통일 + 마스터 진입 정의

#### 제품명 통일
- 제품 브랜드를 **소담에이아이스튜디오 (Sodam-ai-studio)**로 통일 (기획 문서 3종 + 파일명 `_소담스퀘어`→`_소담에이아이스튜디오`)
- 개발사 표기 **리모(REMO)**는 유지 (크레딧 한도 설정 주체)
- 실제 앱 코드 리브랜딩(index.html 메타·i18n·로고·README)은 **보류** — 추후 구현 단계에서 일괄

#### 워크플로우 UI 라벨 확정 (소상공인 직관성)
음차(비주얼라이징/어셈블리/프로덕션)가 비직관적 → 한글 라벨로 확정. 추후 앱 i18n 한글화 시 아래로 매핑:

| 코드 스텝 | 기존(음차) | **확정 한글** |
|-----------|-----------|--------------|
| PLANNING | 기획 | **기획** |
| VISUALIZING | 비주얼라이징 | **스토리보드 만들기** |
| ASSEMBLY | 어셈블리 | **편집** |
| PRODUCTION | 프로덕션 | **내보내기** (영상제작 게이팅 반영) |

- 시안·와이어프레임 UI 라벨 반영 완료. `i18n/ko.json` 실제 반영은 앱 리브랜딩 시 함께.

#### 마스터 진입(전환) 정의 — 기존 설계 갭 해소
- 갭: 시안에 `/master` 콘솔·로그인은 있으나 **콘솔 진입 경로 정의 누락**
- 추가 요구: **마스터도 크리에이티브 앱에서 직접 제작**해야 함 → 초안의 '역할 자동 분리(Model A)'는 폐기(마스터를 콘솔에 가둠)
- **최종 확정: 공통 진입 + 사이드바 관리자 메뉴(마스터만)**
  - 모든 계정 로그인 → **크리에이티브 앱 공통 진입**(마스터도 제작)
  - `role=master`(오픈놀 1개) → 사이드바에 **[⚙ 관리자 콘솔]** 노출 → `/master`로 이동
  - `role=user`(발급 20인) → 제작 메뉴만. 관리자 진입점 미노출 + `/master` 직접 접근 차단·리다이렉트
  - **일반 사용자→마스터 승격 경로 없음**(권한 상승 차단). 마스터는 리모 발급 별도 21번째 계정
  - 구현: 기존 `isAdmin(email)` **사이드바 게이팅 패턴 그대로 재사용** → `accounts.role='master'` 기반 전환. `/master` 라우트는 role 가드 + 서버 RLS/RPC 이중 검증
- `accounts` 스키마에 `role(master/user)`·`master_id` 필드 추가 반영

### 2026-08-09 (세션) — scene-images 버킷 재발 + base64 백필

#### 발견과 해결
| # | 발견 | 해결 |
|---|------|------|
| 1 | 모드 B에서 "대표"로 지정된 씬 영상이 상단 레일·카드 메인에서 검은 화면 (하단 테이크 썸네일만 정상) | 대표 테이크 URL과 `scene.video_url` 이 갈라진 것. 렌더 시 대표 테이크를 우선하고 `scene.video_url` 로 역동기화. signed URL 재발급 루프를 씬별 독립 실행으로 교체, `SelfHealingVideo` 로 재생 실패 시 자동 재발급 (`56fbe57`) |
| 2 | `useAutoSave` 의 `setProject(processedProject)` 가 저장 시작 시점 스냅샷을 통째로 덮어써 저장 중 발생한 갱신을 되돌림 | 업로드로 실제 바뀐 것(base64 → Storage URL)만 현재 store 위에 병합 (`56fbe57`) |
| 3 | `Bucket not found: scene-images` **재발** — 2026-05-14에 대시보드에서 손으로 만든 버킷이라 신규 Supabase 프로젝트(`rbeujkljbnderksgldrz`)엔 없었음 | `supabase/migrations/041_storage_scene_images.sql` 로 코드화 후 적용. public · 20MB · 이미지 MIME 화이트리스트, 쓰기는 최상위 폴더가 본인 소유 프로젝트일 때만 |
| 4 | 업로드 실패 시 base64 폴백이라 아무 에러도 안 보이고 이미지가 `projects.scenes` JSONB에 그대로 저장 → **테이블 197MB** | `Bucket not found` 를 세션당 1회 조치법과 함께 `console.error`. 기존 데이터는 백필로 정리 |

#### base64 백필 (일회성 운영 작업)
- 대상: 15개 프로젝트 중 14개 · 파일 118개 · **106.8MB** (씬 이미지 + 스토리보드 그리드)
- 경로·캐시버스터 규칙은 `services/storageService.ts` 와 동일하게 맞춤 (`{project_id}/scenes/{scene_id}.png`, `{project_id}/grid/{idx}.png`)
- 결과: `scenes+grid_images` **143MB → 88kB**, `projects` 테이블 **197MB → 592kB** (VACUUM FULL)
- `updated_at` 자동 갱신 트리거 때문에 대시보드 정렬이 흐트러지므로, 트리거를 잠시 끄고 원래 시각으로 복원 (mismatched 0 확인)
- 롤백용 백업 테이블 `public.projects_image_backup_20260809` (148MB) 을 먼저 떠두고 진행 → 검증 후 **DROP 완료**.
  검증 내용: 참조 169건 전부 `storage.objects` 에 존재(누락 0) · base64 잔여 0 · 백필 이후 새로 만든 프로젝트 6개도
  `scene-images` 에 정상 업로드(=버킷 수정이 실사용에서 작동). 최종 DB 크기 **14MB**.
- 썸네일(`projects.thumbnail`)은 base64 그대로 두었음 — 15개 합쳐 366kB로 미미하고 앱도 업로드 대상에 넣지 않음.

### 2026-08-15 (세션) — 이미지 업스케일·격자·프롬프트 정리

사용자 신고: "다듬기 단계 편집기에서 업스케일하면 비율이 달라지고, 기존 레퍼런스를 못 따라간다."
원인이 서로 다른 4가지였다.

#### P0 — 잘못 동작하던 것
| # | 발견 | 해결 |
|---|------|------|
| 1 | 편집기의 `"AI 고화질 이미지 재생성(2K 변환 / 3C)"` 버튼이 실제로는 **업스케일이 아니라 전체 재생성**. `handleUpscaleScene`(2K/4K·크레딧·확인창)은 구현돼 있으나 **어디서도 호출 안 되는 dead code**였고, 재생성은 "3C" 라고 써 놓고 **크레딧을 안 뺐다** | 버튼을 `재생성/수정 적용` 과 `2K·4K 업스케일` 로 분리. 라벨에 실제 단가 표시, 재생성도 정직하게 차감 |
| 2 | **8컷 가로 = 2행x4열** 격자라 셀 종횡비가 `(16/9)x(2/4) = 8:9` 세로였다. 그 컷에 16:9 크롭 박스를 씌우고 재생성·업스케일이 16:9 를 강제 → 비율이 바뀜 | `lib/sceneGrid.ts` 단일 정의 신설, **rows === cols 불변식**. 8컷 가로도 2x2 x2유닛. PlanningStep·VisualizingStep·constants 가 같은 정의를 공유 |
| 3 | 업스케일이 `project.aspect_ratio` 를 강제 | 호출부가 `detectAspectFromImage` 로 **원본에서 감지한 비율**을 넘김. 어긋나면 편집기에 경고 배너 |
| 4 | 업스케일 구현이 두 벌 (`geminiService.upscaleImage` 3줄 프롬프트 / `imageUpscaleService` 30줄) | `imageUpscaleService` 로 통일, 2K/4K·모델 파라미터 추가. 단가는 2K 3cr · 4K 5cr (CREDIT_PRICING_SPEC §3-2) |

#### P1 — 품질
- **편집 시맨틱 도입**: 토글 ON + 수정 지시가 있으면 image-edit 모드로 전환. `IMAGE 1 을 그대로 두고 지시한 것만 변경` + 정체성·구도·조명·팔레트 보존 지시. 편집 모드에서는 앞뒤 씬 레퍼런스를 넣지 않는다 (원본에서 멀어짐)
- **하드코딩 스타일 접미사 제거**: `. Cinematic, high-quality, professional photography, 4k` (geminiService) 와 `. High quality, detailed, professional photography.` (openaiImageService) 가 일러스트·3D 프로젝트와 싸웠다 → `project.style` 기반 `STYLE_PROMPT_GUIDES` 로 교체, 레퍼런스가 있으면 접미사 미부착
- **모델 단일화**: `types.DEFAULT_IMAGE_MODEL` 신설(Nano Banana 2 · 3cr). `project.image_model`(migration 042)에 기억시켜 만들기·다듬기·영상제작이 같은 모델을 쓴다. 편집기에도 모델 피커 추가
- **27컷 추가**: 3x3 x3유닛 · 90초 (`SceneCount.CUTS_27`, `AdDuration.S90`)
- **시트 재생성 시 `upscale_level` 초기화**: 새로 자른 컷은 다시 저해상도인데 업스케일 이력이 남아 영상제작이 "완료" 로 오인, Kling 이 `Image pixel is invalid` 로 거부하던 문제

#### P2 — Korean-only 전환 1단계
- `Scene.image_prompt_kr` 추가. 읽기는 `lib/scenePrompt.ts` 의 `scenePromptForImage()` 로 **kr → en 폴백** 이라 기존 프로젝트는 무변화
- 편집기 입력창을 한국어 1급으로 (영문은 접힘 블록 · Auto-Sync 유지), 시스템 인스트럭션도 `image_prompt_kr` 을 주력으로 생성하도록 변경
- `projects.generation_language` 는 타입·코드에만 있고 **컬럼이 없어 저장이 안 되고 있었다** → migration 042 에서 컬럼 신설

#### 마이그레이션
- `042_projects_image_model_and_language.sql` — `projects.image_model`, `projects.generation_language` (적용 완료)

## 미해결 / 다음 작업 (소담 트랙)
| 우선도 | 작업 | 비고 |
|--------|------|------|
| 🔴 | 노출 Gemini 키 rotate | 사용자 직접. 폐기 후 신규 키를 env로만 |
| 🟢 | 실제 앱 리브랜딩 | REMO AI Studio → 소담에이아이스튜디오 (index.html·i18n·로고·README·package.json). 현재 보류 |
| ✅ | 크레딧 한도 회복 방식 = **(A) 부여 누계** 확정 | 60,000 = 평생 부여 총량. 계정이 소진해도 한도 회복 없음. 누계 도달 시 REMO 협의로 한도 상향(=충전). 환불은 한도와 무관 |
| 🟡 | C단계 구현계획서 논의 (Phase 0) | `구현계획서_소담에이아이스튜디오.html` 작성 → 개발팀·대표 논의. 스키마 마이그레이션=경량(profiles ALTER + 선택적 masters 테이블), 최대 리스크=인증 교체. 결정 6항목(스키마 범위·마스터 제작 크레딧 출처·배포형태·Supabase 프로젝트·임시비번 전달·아이디 도메인) |
| 🟡 | 스키마 마이그레이션 작성 | `masters`·`accounts` + 마스터 RPC + RLS |
| 🟡 | authStore 교체 | signInWithGoogle → signInWithPassword(합성이메일) |
| 🟢 | 마스터 영역 컴포넌트 구현 | UI 시안 기반 React 컴포넌트화 |


## 2026-10-12 · E0 Brand Studio A

- 새 저장소: remo-creator-ai/E0-AI-studio. 기존 커밋 기록 유지.
- 사용자가 A안 선택. E0 랜딩·공통 로고·청록색·대시보드 목적 카드 3종·기본 브리프 적용.
- 현재 제품 워드마크는 E0 임시 디자인. 회사 공식 eone 로고를 변형하지 않음.
- 기존 제작/자산/설정/관리 화면의 브랜드 색·명칭과 출력물 파일명 적용.
- 소담 행사와 후원 표시는 앱에서 해제. 파일 삭제는 개발·배포 검증 후로 보류.
- 로컬 미리보기 CRUD·저장 한도 실패·외부 호출 차단 테스트 통과. 실제 AI 생성은 미리보기에서 불가.
- npm 호환 범위 보안 패치 후 알려진 취약점 0건. TypeScript/Vite 빌드 통과.
- Vercel 새 프로젝트 e0-ai-studio 생성, GitHub 연결, https://e0-ai-studio.vercel.app 에 미리보기 배포.
- 첫 Vercel 배포는 플랫폼에 의해 production alias로 지정됨. 앱은 명시적인 미리보기 모드이고 실제 운영 개시 아님.
- Production/Preview 모두 VITE_MOCK_AUTH=true. 새 Supabase 실연결 후 false로 변경 필요.
- Supabase CLI 인증 없음. 비대화형 환경에서 자동 로그인 불가. 사용자 터미널 로그인 안내 상태.
- 브라우저 연결 목록 비어 있음. 렌더링·사용자 흐름 브라우저 검증은 미완료.
- 남은 작업: 브라우저 검증, 새 Supabase 생성/마이그레이션/Edge Function/Google OAuth/AI 키, 실기능 확인, 최종 운영 배포, 레거시 디자인 자산 삭제.

## E0 범위 축소

독립 이미지·동영상·음성 생성 화면, 메뉴, 온보딩, 전용 이미지/음성 기록 서비스와 상태를 삭제했습니다. 공용 자산 선택기 번역은 assets.picker로 이동했습니다. 자산 보관함, 프로젝트 대시보드 및 4단계 워크플로우를 유지합니다. 영상 제작·내레이션·사용자 스타일의 공용 서비스와 기존 DB 마이그레이션은 보존합니다.

검증: TypeScript/Vite 빌드 및 e0-core 테스트 통과. 브라우저 E2E는 현재 연결된 렌더링 환경이 없어 실행하지 않았습니다.
