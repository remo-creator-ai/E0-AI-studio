# 크레딧 단가 스펙 (단일 소스)

> 작성: 2026-08-04 · 범위: **정합성 정리** (요금제·플랜 구조는 이번 범위 밖)
> 이 문서가 확정되면 `constants/pricing.ts` 가 코드상 유일한 단가 정의가 된다.
> 선행 문서: `PRICING_AND_BUSINESS.md`(요금제·사업), `IMAGE_MODEL_PRICING.md`(원가 조사),
> `design/plans/크레딧_영상제작_현황.html`(현황 브리핑)

---

## 0. 이 문서가 푸는 문제

1. 단가 정의가 **코드 4곳에 흩어져** 서로 모순 중이다.
2. 같은 Kling 5초 영상이 **경로에 따라 30cr / 10cr** 로 3배 차이 난다 (차익거래).
3. 설정 화면 가격표가 **실제 과금과 다른 숫자**를 사용자에게 보여준다.
4. `PRICING_AND_BUSINESS.md` 의 마진 분석 2건이 **잘못된 전제**로 계산돼 있어,
   그대로 두면 근거 없는 인상 결정으로 이어진다.

**결론: 이번 작업에 가격 인상은 없다.** 통합·정합성 정리와 차익거래 해소뿐이다.

---

## 1. 현재 상태 (코드 실측)

| 정의 위치 | 값 | 실제 호출부 | 상태 |
|---|---|---|---|
| `store/creditStore.ts:5-12` `CREDIT_COSTS` | SCRIPT 1 · IMAGE_PRO 5 · IMAGE_STANDARD 2 · VIDEO_STANDARD 30 · VIDEO_HD 100 · VIDEO_ULTRA 250 | `ProductionStep.tsx:194` | VIDEO_STANDARD/HD 만 과금에 사용 |
| `types.ts:66-82` `IMAGE_MODEL_INFO.creditCost` | Nano Banana 2 = 3 · Gemini 3 Pro = 5 · Gemini 2.5 Flash = 2 | `VisualizingStep.tsx:210,313,361,411` | 스토리보드 과금의 **유일한** 실사용처 |
| `types.ts:158-161` `UPSCALE_CREDIT_COST` | 2K 3 · 4K 5 | `AssemblyStep.tsx:184,210` | 사용 |
| `services/videoStudioService.ts:33-36` | 5초 10 · 10초 15 · 끝프레임 +5 | `VideoStudio.tsx:225` | 사용 (신규, 미배포) |

### 죽은 상수

- `CREDIT_COSTS.IMAGE_PRO` / `IMAGE_STANDARD` — 과금에 쓰이지 않는다.
  그런데 `SettingsPage.tsx:100,104` 가 **사용자에게 이 값을 가격표로 표시**한다.
  → 사용자는 "이미지 5cr" 을 보고 실제로는 3cr 이 빠진다. **표시-과금 불일치.**
- `CREDIT_COSTS.VIDEO_ULTRA` (250) — `getVideoCreditCost()` 는 Kling/VEO 두 갈래뿐이라
  어떤 경로에서도 소진되지 않는다. 그런데 `SettingsPage.tsx:116` 에 노출된다.
  → **출시하지 않은 티어를 가격표에 광고**하는 상태.

---

## 2. 기존 마진 분석 정정

### 정정 ① "영상 포함 시 -88% 적자" → 실제 +230% 흑자

`PRICING_AND_BUSINESS.md` 3-3 의 "30초 영상(18CUT, Kling) 97cr / 매출 ₩4,850 / 원가 ₩9,100 → -88%"
에서 **97cr 안에 영상 크레딧이 빠져 있다.** 실제 코드는 컷당 30cr 을 차감한다.

| 항목 | 기존 문서 | 코드 기준 실제 |
|---|---|---|
| 크레딧 소진 | 97cr | 97 + (18컷 × 30cr) = **~601cr** |
| 매출 (Pro, ₩50/cr) | ₩4,850 | **₩30,050** |
| API 원가 | ₩9,100 | ₩9,100 |
| 마진 | **-88%** ❌ | **+230%** ✅ |

원인: 문서 작성 시점에 영상 생성이 Coming Soon 게이팅으로 **실제 차감되지 않는 상태**였고
(`크레딧_영상제작_현황.html`: "정의만 되어 있고 실제로 소진되지 않습니다"),
그 상태의 소진량을 그대로 시뮬레이션에 넣었다.

→ **`PRICING_AND_BUSINESS.md` 4-1 의 "Standard 영상 30 → 50cr 인상" 제안은 채택하지 않는다.**

### 정정 ② "이미지 매트릭스 -38% 적자" → 전제 오류

문서는 매트릭스 원가를 **9장 개별 생성 = $0.18** 로 잡았다.
실제 코드는 **3×3 그리드를 이미지 한 장으로 1회 생성**한다
(`VisualizingStep.tsx:313` — 호출 1회당 `imageCreditCost` 1회 차감).

→ 원가는 이미지 **1장** 값이므로 3cr(₩150)은 적자가 아니다.
→ **"매트릭스 3 → 10cr 인상" 제안도 채택하지 않는다.**

단서: `IMAGE_MODEL_PRICING.md` 가 "Nano Banana 계열은 Google 공식 리스트 가격 미공개,
원가 재확인 필요" 라고 명시한다. 기본 모델 실원가는 §6 미결 과제로 남긴다.

---

## 3. 확정 단가표

기준: **1cr = ₩50** (Pro 플랜 ₩49,900 / 1,000cr).
원칙: **같은 산출물 = 같은 가격.** 과금은 경로가 아니라 `(모델 × 길이/장수)` 로만 결정한다.

### 3-1. 텍스트

| 항목 | 단가 | 현행 대비 | 비고 |
|---|---|---|---|
| 스크립트 생성 | **1cr** | 유지 | 원가 ~₩40 → 마진 25%. 가장 얇지만 **인상은 이번 범위 밖** (§6) |

### 3-2. 이미지

| 항목 | 단가 | 현행 대비 | 비고 |
|---|---|---|---|
| 스토리보드 시트 — Nano Banana 2 (기본) | **3cr** | 유지 | 3×3 그리드 1장 = 1회 과금 |
| 스토리보드 시트 — Gemini 3 Pro | **5cr** | 유지 | |
| 스토리보드 시트 — Gemini 2.5 Flash | **2cr** | 유지 | |
| 업스케일 2K | **3cr** | 유지 | 컷 1장당 |
| 업스케일 4K | **5cr** | 유지 | 컷 1장당 |

### 3-3. 영상 — **차익거래 해소 (이번 작업의 핵심)**

| 항목 | 단가 | 현행 대비 | 비고 |
|---|---|---|---|
| Kling std 5초 | **30cr** | 프로젝트 유지 / **스튜디오 10 → 30** | 원가 ₩476, 마진 215% |
| Kling std 10초 | **60cr** | **스튜디오 15 → 60** | 초당 6cr 정비례. 마진 5초와 동일 |
| VEO 3.1 (HD) 5초 | **100cr** | 유지 | 원가 ₩680, 마진 635% |
| 끝프레임(`image_tail`) 가산 | **0cr (가산 폐지)** | **+5 → 0** | Kling 추가 과금 여부 미확인. 확인 전까지 가산하지 않는다 (§6) |
| ULTRA 티어 | **미출시 — 가격표에서 제거** | 표기 삭제 | 실매핑 없음. 출시 시 별도 결정 |

> 영상은 **경로 무관 동일 단가**다. `ProductionStep` 과 `VideoStudio` 가 같은 함수를 쓴다.

### 3-4. 음성 (TTS) — 신규

| 항목 | 단가 | 규칙 |
|---|---|---|
| Gemini TTS 나레이션 | **한글 100자당 1cr** | ① 요청당 **최소 1cr** ② 100자 단위 **올림** ③ 동일 `(텍스트, 보이스, 모델)` 재생성은 **캐시 히트 = 무과금** |

근거: 100자 ≈ 15초 나레이션. TTS 원가는 영상 대비 두 자릿수 배 낮아 이 단가로 마진이 충분하다.
캐시 무과금은 운영진 파이프라인이 이미 쓰는 정책과 동일하다
(`tools/video_pipeline/src/video_pipeline/tts_generator.py:204` — 기존 파일 있으면 재사용).

---

## 4. 코드 구조 — `constants/pricing.ts` 단일 소스

```ts
// constants/pricing.ts — 크레딧 단가의 유일한 정의처.
// 다른 어떤 파일도 단가 숫자를 직접 갖지 않는다.

export const CREDIT_UNIT_KRW = 50; // Pro 기준 1cr 환산가 (표시·분석용)

// ---------- 텍스트 ----------
export const SCRIPT_COST = 1;

// ---------- 이미지 ----------
export const IMAGE_SHEET_COST = {
  'gemini-3.1-flash-image-preview': 3,  // Nano Banana 2 (기본)
  'gemini-3-pro-image-preview': 5,
  'gemini-2.5-flash-image': 2,
} as const;

export const UPSCALE_COST = { '2K': 3, '4K': 5 } as const;

// ---------- 영상 ----------
// 경로(프로젝트/스튜디오) 무관. 모델과 길이만으로 결정한다.
const VIDEO_PER_SEC = { kling: 6, veo31: 20 } as const;

export function videoCost(model: 'kling' | 'veo31', durationSec: number): number {
  return VIDEO_PER_SEC[model] * durationSec;
}
// kling 5s = 30 · kling 10s = 60 · veo31 5s = 100

// ---------- 음성 ----------
export const TTS_CHARS_PER_CREDIT = 100;

export function ttsCost(text: string): number {
  return Math.max(1, Math.ceil([...text.trim()].length / TTS_CHARS_PER_CREDIT));
}
```

### 파생 관계

| 기존 정의 | 변경 후 |
|---|---|
| `creditStore.CREDIT_COSTS` | `pricing.ts` 재export 또는 삭제. `IMAGE_PRO`/`IMAGE_STANDARD`/`VIDEO_ULTRA` **삭제** |
| `types.IMAGE_MODEL_INFO.creditCost` | `IMAGE_SHEET_COST[model]` 참조로 교체 |
| `types.UPSCALE_CREDIT_COST` | `UPSCALE_COST` 로 이동 |
| `videoStudioService.videoStudioCreditCost` | **삭제** → `videoCost()` 호출 |
| `ProductionStep.getVideoCreditCost` | **삭제** → `videoCost()` 호출 |

---

## 5. 적용 체크리스트

- [ ] `constants/pricing.ts` 신규 작성
- [ ] `store/creditStore.ts:5-12` — `IMAGE_PRO`·`IMAGE_STANDARD`·`VIDEO_ULTRA` 삭제, 나머지는 `pricing.ts` 재export
- [ ] `types.ts:66-82` — `IMAGE_MODEL_INFO.creditCost` 를 `IMAGE_SHEET_COST` 파생으로 교체
- [ ] `types.ts:158-161` — `UPSCALE_CREDIT_COST` 를 `pricing.ts` 로 이동 (import 경로만 변경)
- [ ] `services/videoStudioService.ts:33-36` — `videoStudioCreditCost` 삭제, `videoCost()` 로 대체 → **5초 30cr / 10초 60cr / 끝프레임 가산 없음**
- [ ] `components/VideoStudio.tsx:225,397` — 표시·차감 단가 갱신
- [ ] `components/ProductionStep.tsx:194` — `getVideoCreditCost()` → `videoCost(engine, 5)`
- [ ] `components/SettingsPage.tsx:96-116` — 가격표를 실제 과금 소스 기준으로 재작성
      (이미지 3종 실단가 표시 · **ULTRA 행 삭제** · 영상 5초/10초 구분 · TTS 행 추가)
- [ ] `i18n/ko.json:845-847` — `videoUltra` 키 제거, TTS·10초 라벨 추가
- [ ] `docs/PRICING_AND_BUSINESS.md` — 3-3 / 4-1 에 **정정 주석** 추가 (§2 근거)

### 검증

- [ ] 사이드바 동영상 생성과 프로젝트 씬 렌더가 **동일 단가로 차감**되는지 확인
- [ ] 설정 화면 가격표 숫자 = 실제 차감 숫자 (3종 이미지 · 영상 2종 · 업스케일 2종 전수)
- [ ] 실패 시 무차감 정책 유지 확인 (성공 후 `deduct()` 순서 — 현행 동작)

---

## 6. 미결 과제 (이번 범위 밖 / 별도 결정)

| 항목 | 내용 | 필요 조치 |
|---|---|---|
| Nano Banana 2 실원가 | 공식 리스트 가격 미공개 (`IMAGE_MODEL_PRICING.md` §0) | 실월 청구서로 실측 |
| Kling `image_tail` 원가 | 끝프레임 사용 시 추가 과금 여부 불명 | Kling 청구 내역 확인 후 가산 여부 재결정 |
| 스크립트 1cr | 마진 25%로 전 항목 중 가장 얇음 | 요금제 재설계 시 2cr 검토 |
| ULTRA 티어 | VEO 3 실매핑 후 출시할지 | 상품 결정 |
| TTS 레이트 리밋 | ~10 RPM. 다중 사용자 동시 요청 시 429 | 큐잉 설계 (TTS 스펙 문서에서 다룸) |
| 요금제·플랜 구조 | Free/Starter/Pro 배분, 쇼츠 패키지, B2B·BYOK | `PRICING_AND_BUSINESS.md` §7-8 별도 사이클 |
