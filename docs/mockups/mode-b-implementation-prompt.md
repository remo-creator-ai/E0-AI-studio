# 모드 B 제작 화면 — 목업 코드 반영 지시서

> 이 문서를 그대로 새 세션에 붙여넣으면 됩니다.

---

## 목표

`components/production/ProductionModeB.tsx` 를 목업 `docs/mockups/mode-b-with-upscale.html` 의
구조로 다시 만든다. **목업을 브라우저로 먼저 열어서 동작(액션 선택 → 편집기 전개, END 채우기,
씬 선택, 모달)을 직접 확인한 뒤 착수할 것.**

이번 작업은 **Phase 1 (타입 변경 없음)** 만 한다. Phase 2(테이크 스택)는 이 문서 맨 아래에
따로 적어뒀고, 이번에 건드리지 않는다.

---

## 이미 검증된 사실 (다시 조사하지 말 것)

### 서비스 — 그대로 재사용, 시그니처 바꾸지 말 것

**`services/videoStudioService.ts`**
- `generateStudioVideo({ prompt, aspect, durationSec, resolution?, startImage?, endImage?, signal? })`
- `videoStudioCreditCost({ durationSec, resolution?, hasEndFrame? })`
- `detectAspectFromImage(url) → Promise<ConcreteAspect>`
- `CREDIT_PER_UNIT = 30` (:88) → **5초 기본 30cr**
- `:201` — `endImage` 또는 `resolution==='1080p'` 이면 mode 를 `pro` 로 강제
  (v2.6 std 는 `image_tail` 미지원, 에러 code 1201)
- `:96` — 그래서 **END 프레임을 쓰면 비용이 2배(60cr)**
- `VIDEO_STUDIO_MODEL = 'kling-v2-6'` (:105)
- `KLING_PROMPT_MAX = 2400` (:108), `clampKlingPrompt()`

**`services/imageUpscaleService.ts`** — **아직 어떤 컴포넌트에서도 호출되지 않는다. 이번에 처음 연동한다.**
- `upscaleSceneImage({ imageUrl, aspect }) → Promise<{ ok, dataUrl?, failure?, message? }>`
- `IMAGE_UPSCALE_COST = 3` (:24) → **씬당 3cr**
- `UpscaleAspect = '16:9' | '9:16' | '1:1'`
- `MOCK_MODE` 에서는 1.5초 후 원본을 그대로 돌려준다 (UI 흐름 검증용)
- 배치는 서비스가 아니라 호출부에서 반복 호출

**`services/videoHistoryService.ts`** — `saveVideoHistory(...)`.
Kling 원본 URL 은 24시간 만료라 반드시 재업로드해야 한다. 현재 코드의 처리 방식을 그대로 유지할 것.

### 타입 · 스토어

- `types.ts:84` `Scene { id, order, content_kr, content_en, script_kr, script_en,
  image_prompt_en, video_motion_en, video_motion_kr, image_url?, video_url?, upscale_level? }`
- `useStore` → `project`, `updateScene(id, patch)`
- `useCreditStore` → `balance`, `deduct(cost, label)`, `hasEnough(cost)`
- `useAuthStore` → `user`
- `useModal` → `alert`, `confirm`
- `useSettingsStore` → `defaultLanguage: 'ko' | 'en'` (`store/settingsStore.ts:18`)

### 보관함 연동

`components/AssetLibraryPicker.tsx` 를 그대로 쓴다:
```ts
<AssetLibraryPicker
  open={boolean}
  onClose={() => void}
  onPick={({ asset, dataUrl }) => void}   // 선택 수만큼 반복 호출
  maxRemaining={1}
/>
```

### 하지 말 것

- **씬 추가 / 삭제 / 순서 이동을 제작 화면에 넣지 말 것.** 기획 단계에만 존재해야 한다
  (`components/PlanningStep.tsx:165 moveScene`, `:175 removeScene`, `:184 addScene`).
  제작 화면에는 기획으로 가는 버튼 하나만 둔다.
- 서비스 레이어 시그니처 변경 금지. 이번엔 UI 레이어만 바꾼다.
- `types.ts` / DB 스키마 변경 금지 (Phase 2 영역).

---

## 만들 것

### 1. 씬 카드 (아코디언 → 큰 카드)

기존 `SceneRow` 아코디언을 없애고, 씬 하나당 큰 카드 하나. 카드는 **상태에 따라 세 얼굴**을 가진다.

**(a) 영상 없음 — 액션 선택 상태 (기본)**

좌측: START 프레임 `aspect-video` 크게 + 그 아래 이미지 프롬프트.
우측: `이 씬으로 무엇을 할까요?` 액션 버튼 3개 세로 배치.

| 액션 | 조건별 표시 |
|---|---|
| 업스케일 | 미완료 → 주황 강조 `3cr`, 진행중 → 진행바 + 비활성, 완료 → 초록 `완료` + 비활성 |
| 가벼운 편집 | **항상 비활성**, `무료 · 준비중`. 줌/팬 영상 출력 경로가 아직 없다 (Remotion·ffmpeg 미설치) |
| AI 동영상 생성 | 업스케일 미완료면 비활성 + `업스케일을 먼저 해주세요`, 완료면 파랑 강조 |

**(b) AI 동영상 생성 클릭 → 편집기 전개**

액션 목록을 감추고 편집기를 편다. 좌상단에 `‹ 방식 다시 고르기`.
구성: 업스케일 상태바 → `START ─ 5초 모션 ─ END` → 이미지/영상 프롬프트 2단 →
모델·길이·해상도·비용·`영상 생성`.

**(c) 영상 완료 — 결과물이 주인공**

카드에서 가장 큰 요소가 `<video src={scene.video_url} controls>` 다.
우측에 `전체화면 재생 / 다운로드 / 다시 만들기`.
START/END·프롬프트는 `<details>` 로 접어 `이 영상을 만든 설정 보기`.

### 2. 업스케일 연동 (신규)

- 씬별 업스케일 잡 상태를 로컬 state 로 관리: `idle | running | done | failed`
- `detectAspectFromImage(scene.image_url)` 로 aspect 를 구해 `upscaleSceneImage` 호출
- 성공하면 `updateScene(scene.id, { image_url: result.dataUrl, upscale_level: '2K' })`
- 크레딧은 `IMAGE_UPSCALE_COST`(3cr) 를 `deduct` 로 차감. 호출 전 `hasEnough` 검사
- **업스케일 완료 판정은 `scene.upscale_level` 로 한다** (새 필드 만들지 말 것)
- 진행 표시는 얇은 로딩바. 실제 progress 가 없으므로 모드 A/B 의 추정 진행률 방식을 따른다

### 3. END 프레임 — 3갈래 소스

비어있을 때 점선 박스 안에 세 버튼:
- `다음 씬 이미지` → `scenes[idx+1].image_url`
- `파일` → `<input type="file">` → dataURL
- `보관함` → `AssetLibraryPicker` 열기

채워지면 END 박스에 이미지가 뜨고 캡션이 `연결됨 · 변경` 으로 바뀐다.
**END 를 지정하면 비용 표시가 `videoStudioCreditCost({ durationSec, hasEndFrame: true })` 로
즉시 2배가 되어야 하고, 모델 표기도 pro 로 바뀌어야 한다.** 이건 실제 동작이므로 반드시 반영.

### 4. 씬 선택 (합치기 포함 여부)

- 카드 헤더 좌측에 체크박스. 로컬 state `Record<sceneId, boolean>`, 기본 전체 true
- 해제하면 카드 본문 `opacity: .38` + `pointer-events: none`, 헤더에 `최종 영상에서 제외` 배지
- 상단 진행률·합계 초·생성 비용이 전부 **선택된 씬 기준**으로 계산
- `전체 / 해제 / 완성만` 빠른 선택 버튼

### 5. 상단 씬 레일 (세로 칩)

`씬 N` (상단) → 썸네일 16:9 (가운데) → `● 상태` (하단), 칩 폭 108px, 가로 스크롤.
- 클릭하면 해당 카드로 스무스 스크롤
- 완료된 씬은 **마우스를 올리면 `<video muted loop playsInline>` 재생**, 벗어나면 pause + `currentTime=0`
- 진행중인 씬은 썸네일 하단에 진행바

### 6. 씬 간 이동

네 경로 전부:
1. 레일 썸네일 클릭
2. 카드 헤더의 `∧ 이전 / 다음 ∨`
3. 우하단 플로팅 `∧ / N/M / ∨`
4. 키보드 `↑↓` 또는 `J/K` (단, `INPUT`/`TEXTAREA` 포커스 중엔 무시)

**착지 지점**: sticky 컨트롤 바 바로 아래. 목업은 `scroll-margin-top` + rAF 스무스 스크롤을
쓰는데, React 에서는 `scrollIntoView({ behavior:'smooth', block:'start' })` + CSS
`scroll-margin-top` 으로 충분하다. sticky 바 높이를 측정해 상수로 두지 말고
`scroll-margin-top` 을 CSS 로 잡을 것.

### 7. 전체 생성 모달 (신규)

`선택한 씬 생성` 클릭 시 확인 모달. 기존 `confirm()` 텍스트 방식을 대체한다.

- **1단계 · 모델 선택** — `Kling 2.6`(30cr/5초) / `Kling 2.6 pro`(60cr/5초, END 쓰려면 필수) /
  코드 모션(비활성 `준비 중`)
- **2단계 · 씬 확인** — 선택된 씬을 행으로 나열.
  **이미 `video_url` 이 있는 씬은 체크 해제 상태로 시작**하고
  `이미 완료 · 체크하면 다시 생성` 이라고 표시.
  업스케일이 필요한 씬은 비용에 `+3cr` 을 더해 보여준다
- 하단에 합계 크레딧 / 잔액 / `취소` `생성 시작`
- ESC · 배경 클릭으로 닫힘

Phase 1 에서 완료된 씬을 다시 생성하면 `video_url` 이 **덮어써진다**. 모달 문구를
`다시 만들면 기존 영상이 교체됩니다` 로 정확히 쓸 것. (Phase 2 에서 "새 테이크 추가" 로 바뀐다.)

### 8. 프롬프트 언어 — 한 언어만 노출

`useSettingsStore(s => s.defaultLanguage)` 로 분기한다.

- `ko` → 이미지 프롬프트는 `scene.content_kr`, 영상 프롬프트는 `scene.video_motion_kr`
- `en` → `scene.image_prompt_en`, `scene.video_motion_en`
- **영문/한글 병기 금지.** 한 화면에 한 언어만.

**단, Kling 에 보내는 프롬프트는 지금처럼 영문(`video_motion_en`) 을 기본으로 유지한다.**
사용자가 한국어 프롬프트를 직접 편집한 경우에만 편집한 텍스트를 보낸다.
이 분기를 주석으로 명시할 것.

---

## 모델 (확정)

`kling-v2-6` 하나만 쓴다. 사용자가 확인해준 사항이다.

- `Kling 2.6` = `mode: 'std'` = 720p = 30cr / 5초
- `Kling 2.6 pro` = `mode: 'pro'` = 1080p 또는 END 프레임 사용 시 = 60cr / 5초

`mode` 는 직접 넘기는 값이 아니라 `videoStudioService` 가 `resolution` / `endImage` 로
내부 결정한다(`:201`). UI 의 모델 선택은 결국 **`resolution` 을 고르는 것**이며,
END 프레임을 지정하면 pro 로 자동 승격되고 UI 표기도 따라가야 한다.
라벨 문자열은 하드코딩하지 말고 `VIDEO_STUDIO_MODEL` 상수에서 끌어올 것.

---

## 완료 기준

- [ ] `npm run build` (= `tsc --noEmit && vite build`) 통과
- [ ] 씬 0개 / 이미지 없는 씬 / 크레딧 부족 상태에서 각각 깨지지 않음
- [ ] 업스케일 → AI 생성 → 완료 전이가 실제로 동작 (`MOCK_MODE` 로 확인 가능)
- [ ] 배치 생성 중 다른 씬으로 이동해도 잡이 계속됨 (기존 동작 유지)
- [ ] 씬 선택을 바꾸면 진행률·합계 초·생성 비용이 전부 따라 바뀜
- [ ] END 지정/해제 시 비용이 30↔60cr 로 즉시 바뀜
- [ ] 제작 화면에 씬 추가·삭제·순서 이동 UI가 **없음**

---

## Phase 2 — 이번엔 하지 말 것 (테이크 스택)

씬마다 영상을 여러 번 생성하면 결과가 쌓이고 그중 하나를 대표로 고르는 기능.
목업에는 이미 들어가 있다 (`.take-strip`).

타입·스키마 변경이 필요하므로 별도 작업으로 분리한다:
- `types.ts` — `video_url?: string` → `video_takes?: VideoTake[]` + `main_take_id?: string`
  (`VideoTake { id, url, durationSec, model, hasEndFrame, createdAt }`)
- `types/database.ts` + Supabase 마이그레이션
- `store.ts` — 테이크 추가 / 대표 지정 액션
- 합치기 단계 — `video_url` 참조를 전부 "대표 테이크" 로 교체
- 기존 데이터 마이그레이션: `video_url` 이 있으면 테이크 1개로 변환하고 그게 대표
