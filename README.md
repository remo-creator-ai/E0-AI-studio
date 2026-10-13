# E0 AI Studio

이원오엠에스 맞춤 브랜드 콘텐츠 제작 공간. `remo-creator-ai/E0-AI-studio`에서 독립 개발합니다.

## 시작

```powershell
npm ci
npm run dev
```

로컬 주소: http://127.0.0.1:3456 . Supabase 설정이 없는 로컬 개발에서는 미리보기로 동작합니다. 로컬 개발에서만 로그인 안내 팝업의 **사용자 화면 미리보기**로 입장할 수 있습니다. 공개 사이트에서는 가계정 진입·복원을 차단합니다.

- A안: 화이트·청록색, 브랜드 목적별 시작 템플릿 3종.
- 독립 이미지·동영상·음성 생성 도구는 제거했습니다. 자산 보관함과 프로젝트 워크플로우를 중심으로 제공합니다.
- 기존 기획 → 이미지 → 스토리보드 → 영상 제작 흐름을 유지합니다.
- 미리보기 프로젝트는 브라우저 로컬 저장소에 보관됩니다. AI 생성·서버 작업은 실행하지 않습니다.
- 업로드 자산의 미리보기는 세션 한정입니다. 실제 사용자 인증·클라우드 저장은 새 Supabase 연결 후 검증합니다.
- 프로덕션에서는 환경변수 누락만으로 가계정을 활성화하지 않습니다.

## 검증

```powershell
npm run build
node tests/e0-core.test.mjs
```

설계 문서: [분석·후보](design/e0/index.html), [A 기능 PRD](design/e0/A-product-prd.html), [A 디자인 PRD](design/e0/A-design-prd.html).

## 새 프로젝트 배포

기존 소담 프로젝트의 URL·키·배포 훅을 사용하지 않습니다. `.env.example`의 공개 설정값을 **E0 전용 프로젝트**의 값으로 채웁니다.

1. Vercel: 프로젝트 `e0-ai-studio`, Vite, 빌드 `npm run build`, 출력 `dist`, 설치 `npm ci`.
2. 배포 빌드에서는 `VITE_MOCK_AUTH=true`여도 가계정을 활성화하지 않습니다. 새 Supabase 공개 URL/anon key 연결 전에는 로그인·회원가입 준비 안내를 표시합니다.
3. Supabase: 새 빈 프로젝트에 `supabase/migrations`를 번호순 적용합니다. 기존 마이그레이션은 보존하며 `pg_cron` 등 필요 확장과 실제 적용 결과를 확인해야 합니다. 아직 새 서버에 적용하지 않았습니다.
4. `supabase/functions`의 필요한 Edge Functions를 새 프로젝트에 배포합니다. AI 공급자 비밀키는 서버 측에만 저장합니다.
5. Google OAuth에 새 Supabase 콜백과 E0 사이트/리다이렉트 URL을 등록합니다. 최초 관리자 로그인 후 서버의 profiles.role을 별도로 부여합니다. 프런트 관리자 이메일은 UI 노출 용도일 뿐 서버 권한이 아닙니다.
6. 서로 다른 사용자로 프로젝트 접근 격리·저장·재열기·생성 실패/차감·다운로드를 검증합니다. 신규 크레딧·사용 정책은 운영 전 확인합니다.
7. 실제 도메인 확정 후 canonical/OG URL 및 검색 노출을 설정합니다. 현재 robots.txt는 검토 버전의 검색 수집을 차단합니다.

## 자산 정리 순서

소담 로고·캐릭터·과거 디자인 문서는 현재 앱에서 참조하지 않습니다. 사용자의 지시에 따라 **개발·배포 검증 이후** 남은 레거시 파일을 정리합니다. 원본 커밋 이력은 유지합니다.

## 기술

React · TypeScript · Vite · Tailwind CSS · Zustand · Supabase. API 공급자 키는 ai-proxy Edge Function에서 처리합니다.
