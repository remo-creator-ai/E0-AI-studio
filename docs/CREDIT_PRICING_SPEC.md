# 크레딧 단가 스펙 (단일 소스)

> 작성 2026-08-04 · **개정 2026-08-04 (kling-v2-6 업그레이드 반영)**
> 범위: **정합성 정리** (요금제·플랜 구조는 이번 범위 밖)
> 확정 시 `constants/pricing.ts` 가 코드상 유일한 단가 정의가 된다.
> 관련: `PRICING_AND_BUSINESS.md`(요금제·사업) · `IMAGE_MODEL_PRICING.md`(이미지 원가) ·
> `KLING_API_GUIDE.md`(Kling 운영) · `design/plans/크레딧_영상제작_현황.html`(현황)

---

## 0. 확인이 필요한 것 — Dev Console 숫자 2개

**이 두 숫자만 있으면 영상 단가가 확정됩니다.** 나머지 항목(이미지·업스케일·스크립트·TTS)은
이미 확정 가능하며 이 확인을 기다리지 않는다.

| # | 확인할 것 | 어디서 | 왜 필요한가 |
|---|---|---|---|
| **1** | 리소스팩 **1유닛당 실구매 가격** | Kling Dev Console → 리소스팩 **구매** 메뉴 | 우리 문서 3개가 이 값을 서로 다르게 말한다 (§4) |
| **2** | **kling-v2-6 · std · 5초 영상 1건**의 **유닛 소모량** | 리소스팩 **관리** 메뉴에서 영상 1건 생성 전후 **잔량 차이** | v1 대비 몇 배인지 확정 (v2 계열은 2~2.5x 추정, v2-6는 문서에 없음) |

> 선택 확인: 10초 영상 1건의 유닛 소모량 (5초의 정확히 2배인지 — 60cr 정비례 근거)

### 확인 후 계산법

```
영상 1건 원가(₩) = (1유닛 가격 $) × (소모 유닛) × 1,360        ← 환율 ₩1,360/$
마진(%)          = (크레딧 × ₩50 ÷ 원가 − 1) × 100             ← 1cr = ₩50 (Pro 기준)
```

빈칸 채우기용:

| | 값 |
|---|---|
| 1유닛 가격 | $______ |
| v2-6 5초 소모 유닛 | ______ 유닛 |
| → 5초 원가 | ₩______ |
| → **30cr(₩1,500) 마진** | ______% |

**판정 기준: 마진 100% 미만이면 §3-3 영상 단가를 재조정한다. 100% 이상이면 아래 표 그대로 확정.**

---

## 1. 이 문서가 푸는 문제

1. 단가 정의가 **코드 4곳에 흩어져** 서로 모순 중이다.
2. 같은 영상이 **경로에 따라 30cr / 10cr** 로 3배 차이 난다 (차익거래).
   → **kling-v2-6 업그레이드로 원가가 오른 지금, 10cr 쪽은 적자 위험 구간이다.**
3. 설정 화면 가격표가 **실제 과금과 다른 숫자**를 사용자에게 보여준다.
4. 기존 문서들의 원가·마진 계산에 오류 3건이 있다 (§4).

**이번 작업에 가격 인상은 없다.** 통합·정합성 정리와 차익거래 해소뿐이다.

---

## 2. 현재 상태 (코드 실측)

### 2-1. 단가 정의 위치

| 정의 위치 | 값 | 실제 호출부 | 상태 |
|---|---|---|---|
| `store/creditStore.ts:5-12` `CREDIT_COSTS` | SCRIPT 1 · IMAGE_PRO 5 · IMAGE_STANDARD 2 · VIDEO_STANDARD 30 · VIDEO_HD 100 · VIDEO_ULTRA 250 | `ProductionStep.tsx:195` | VIDEO_STANDARD/HD 만 과금에 사용 |
| `types.ts:66-82` `IMAGE_MODEL_INFO.creditCost` | Nano Banana 2 = 3 · Gemini 3 Pro = 5 · Gemini 2.5 Flash = 2 | `VisualizingStep.tsx:210,313,361,411` | 스토리보드 과금의 **유일한** 실사용처 |
| `types.ts:158-161` `UPSCALE_CREDIT_COST` | 2K 3 · 4K 5 | `AssemblyStep.tsx:184,210` | 사용 |
| `services/videoStudioService.ts:66-72` | 5초 10 · 10초 15 · 끝프레임 +5 | `VideoStudio.tsx` · Mode A · Mode B | 사용 · **적자 위험 (§3-3)** |

### 2-2. 영상 모델 현황 — kling-v2-6 (커밋 `236b482`)

| 경로 | 모델 지정 | 상태 |
|---|---|---|
| 사이드바 동영상 생성 · Mode A · Mode B | `videoStudioService.ts:76` `VIDEO_STUDIO_MODEL = 'kling-v2-6'` | ✅ |
| 스토리보드 씬 영상 · 레거시 ProductionStep | `klingService.ts:52` `model_name: 'kling-v2-6'` | ✅ |
| Mode A 히스토리 기록 | `ProductionModeA.tsx:367` `model: 'kling-v1'` | ❌ **하드코딩 잔존** |

> `ProductionModeA:367` 은 API 호출이 아니라 `saveVideoHistory` 메타데이터다.
> 실제로는 v2-6 로 생성되는데 이력에는 v1 으로 남아 **정산·분석 데이터가 오염**된다.
> Mode B(`:176`)는 상수를 참조해 정상. → Mode A 도 상수 참조로 교체.

### 2-3. 죽은 상수 (사용자에게는 보이는 중)

- `CREDIT_COSTS.IMAGE_PRO` / `IMAGE_STANDARD` — 과금에 쓰이지 않는다.
  그런데 `SettingsPage.tsx:100,104` 가 **사용자에게 이 값을 가격표로 표시**한다.
  → 사용자는 "이미지 5cr" 을 보고 실제로는 3cr 이 빠진다. **표시-과금 불일치.**
- `CREDIT_COSTS.VIDEO_ULTRA` (250) — `ProductionStep.tsx:195` 는 Kling/VEO 두 갈래뿐이라
  어떤 경로에서도 소진되지 않는데 `SettingsPage.tsx:116` 에 노출된다.
  → **출시하지 않은 티어를 가격표에 광고**하는 상태.

---

## 3. 확정 단가표

기준: **1cr = ₩50** (Pro ₩49,900 / 1,000cr) · 환율 ₩1,360/$
원칙: **같은 산출물 = 같은 가격.** 과금은 경로가 아니라 `(모델 × 길이/장수)` 로만 결정한다.

### 3-1. 텍스트 — 확정

| 항목 | 단가 | 현행 대비 | 비고 |
|---|---|---|---|
| 스크립트 생성 | **1cr** | 유지 | 원가 ~₩40 → 마진 25%. 전 항목 중 가장 얇지만 **인상은 이번 범위 밖** (§5) |

### 3-2. 이미지 — 확정

| 항목 | 단가 | 현행 대비 | 비고 |
|---|---|---|---|
| 스토리보드 시트 — Nano Banana 2 (기본) | **3cr** | 유지 | 3×3 그리드 1장 = 1회 과금 |
| 스토리보드 시트 — Gemini 3 Pro | **5cr** | 유지 | |
| 스토리보드 시트 — Gemini 2.5 Flash | **2cr** | 유지 | |
| 업스케일 2K | **3cr** | 유지 | 컷 1장당 |
| 업스케일 4K | **5cr** | 유지 | 컷 1장당 |

### 3-3. 영상 — 차익거래 해소 (§0 확인 대상)

| 항목 | 단가 | 현행 대비 | 비고 |
|---|---|---|---|
| Kling **v2-6** std 5초 | **30cr** | 프로젝트 유지 / **스튜디오 10 → 30** | §0 확인 후 마진 확정 |
| Kling **v2-6** std 10초 | **60cr** | **스튜디오 15 → 60** | 초당 6cr 정비례 |
| VEO 3.1 (HD) 5초 | **100cr** | 유지 | 원가 ~₩680, 마진 635% — v2-6 영향 없음 |
| 끝프레임(`image_tail`) 가산 | **0cr (가산 폐지)** | **+5 → 0** | 추가 과금 근거 미확인 |
| ULTRA 티어 | **미출시 — 가격표에서 제거** | 표기 삭제 | 실매핑 없음 |

> 영상은 **경로 무관 동일 단가**다. `ProductionStep` · `VideoStudio` · Mode A/B 가 같은 함수를 쓴다.

#### 왜 10cr 을 즉시 올려야 하는가 (v2-6 업그레이드의 직접 영향)

`videoStudioService.ts:66-72` 의 10cr/15cr 은 **kling-v1 시절 산정치**다. v2-6 로 원가가
최소 2배 오른 지금 그대로 두면 해석에 따라 적자다.

| 유닛 단가 해석 | v2-6 5초 원가(2.5x 가정) | 30cr 마진 | **10cr 마진** |
|---|---|---|---|
| $0.07/유닛 (`KLING_API_GUIDE.md:124`) | ₩238 | +530% | +110% |
| $0.10~0.20/유닛 (`KLING_API_GUIDE.md:35` 패키지표) | ₩340~680 | +121~341% | **-26~+47%** |
| $0.07~0.14/**초** (`PRICING_AND_BUSINESS.md` 1-3) | ₩1,190~2,380 | **-37~+26%** | **-79~-58%** |

- **30cr**: 위 두 해석에서는 안전, 세 번째 해석에서는 위험 → §0 확인으로 판정.
- **10cr**: 세 해석 중 둘에서 적자 → **확인을 기다리지 않고 30cr 로 통일한다.**

### 3-4. 음성 (TTS) — 확정 (신규)

| 항목 | 단가 | 규칙 |
|---|---|---|
| Gemini TTS 나레이션 | **한글 100자당 1cr** | ① 요청당 **최소 1cr** ② 100자 단위 **올림** ③ 동일 `(텍스트, 보이스, 모델)` 재생성은 **캐시 히트 = 무과금** |

근거: 100자 ≈ 15초 나레이션. TTS 원가는 영상 대비 두 자릿수 배 낮아 이 단가로 마진이 충분하다.
캐시 무과금은 운영진 파이프라인의 기존 정책과 동일
(`tools/video_pipeline/src/video_pipeline/tts_generator.py:204`).

---

## 4. 기존 문서 정정 (오류 3건)

### 정정 ① "영상 포함 시 -88% 적자" → 계산 오류

`PRICING_AND_BUSINESS.md` 3-3 의 "30초 영상(18CUT, Kling) 97cr / 매출 ₩4,850 → **-88%**"
에서 **97cr 안에 영상 크레딧이 빠져 있다.** 실제 코드는 컷당 30cr 을 차감한다.

| 항목 | 기존 문서 | 코드 기준 |
|---|---|---|
| 크레딧 소진 | 97cr | 97 + (18컷 × 30cr) = **~601cr** |
| 매출 (Pro, ₩50/cr) | ₩4,850 | **₩30,050** |

원인: 작성 시점에 영상이 Coming Soon 게이팅으로 **실제 차감되지 않는 상태**였고
(`크레딧_영상제작_현황.html`: "정의만 되어 있고 실제로 소진되지 않습니다"),
그 소진량을 그대로 시뮬레이션에 넣었다.
→ **4-1 의 "Standard 영상 30 → 50cr 인상" 제안은 채택하지 않는다.**

### 정정 ② "이미지 매트릭스 -38% 적자" → 전제 오류

문서는 매트릭스 원가를 **9장 개별 생성 = $0.18** 로 잡았다.
실제 코드는 **3×3 그리드를 이미지 한 장으로 1회 생성**한다
(`VisualizingStep.tsx:313` — 호출 1회당 1회 차감).
→ 원가는 이미지 **1장** 값이므로 3cr(₩150)은 적자가 아니다.
→ **"매트릭스 3 → 10cr 인상" 제안도 채택하지 않는다.**

### 정정 ③ Kling 원가 — 문서 3개가 서로 다르다 (§0 확인 사유)

| 출처 | Kling std 5초 원가 |
|---|---|
| `KLING_API_GUIDE.md:124` | ~$0.07 (= 1 유닛) |
| `KLING_API_GUIDE.md:35` 패키지표 | 100유닛 $10~20 → $0.10~0.20/유닛 |
| `PRICING_AND_BUSINESS.md` 1-3 | $0.07~0.14 **per 초** → 5초 $0.35~0.70 |

`PRICING_AND_BUSINESS.md` 가 **유닛당 단가를 초당 단가로 오독**했을 가능성이 높다(약 5배 과대).
`KLING_API_GUIDE.md` §2 의 리소스팩 모델("5초 std 1개 ≈ 1 유닛")과 정합하지 않는다.

> ⚠️ 본 문서의 초판(2026-08-04 오전)이 인용한 "원가 ₩476 · 마진 215%" 는
> 이 과대 추정치를 그대로 가져온 값이므로 **폐기**한다. 마진은 §0 확인 후 확정한다.

---

## 5. 코드 구조 — `constants/pricing.ts` 단일 소스

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
// kling = kling-v2-6 std 기준. 모델 교체 시 이 값만 바꾼다.
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

| 기존 정의 | 변경 후 |
|---|---|
| `creditStore.CREDIT_COSTS` | `pricing.ts` 재export. `IMAGE_PRO`·`IMAGE_STANDARD`·`VIDEO_ULTRA` **삭제** |
| `types.IMAGE_MODEL_INFO.creditCost` | `IMAGE_SHEET_COST[model]` 참조로 교체 |
| `types.UPSCALE_CREDIT_COST` | `UPSCALE_COST` 로 이동 |
| `videoStudioService.videoStudioCreditCost` | **삭제** → `videoCost()` |
| `ProductionStep.getVideoCreditCost` | **삭제** → `videoCost()` |

---

## 6. 적용 체크리스트

### 즉시 (§0 확인과 무관 — 확정 스펙)

- [ ] `constants/pricing.ts` 신규 작성
- [ ] `components/production/ProductionModeA.tsx:367` — `model: 'kling-v1'` → `VIDEO_STUDIO_MODEL`
- [ ] `services/videoStudioService.ts:66-72` — `videoStudioCreditCost` 삭제 → `videoCost()`
      (**5초 30cr / 10초 60cr / 끝프레임 가산 없음** — 적자 방지)
- [ ] `store/creditStore.ts:5-12` — `IMAGE_PRO`·`IMAGE_STANDARD`·`VIDEO_ULTRA` 삭제, 나머지 재export
- [ ] `types.ts:66-82` · `types.ts:158-161` — `pricing.ts` 파생으로 교체
- [ ] `components/VideoStudio.tsx` · `ProductionModeA` · `ProductionModeB` — 표시·차감 단가 갱신
- [ ] `components/ProductionStep.tsx:195` — `getVideoCreditCost()` → `videoCost(engine, 5)`
- [ ] `components/SettingsPage.tsx:96-116` — 가격표를 실제 과금 소스 기준으로 재작성
      (이미지 3종 실단가 · **ULTRA 행 삭제** · 영상 5초/10초 구분 · TTS 행 추가)
- [ ] `i18n/ko.json:845-847` — `videoUltra` 제거, TTS·10초 라벨 추가

### 문서

- [ ] `docs/KLING_API_GUIDE.md` — §3 현재 모델 v2-6 로 갱신 · 라인업 표에 v2-6 추가 · §7 비용추정 갱신
- [ ] `docs/PRICING_AND_BUSINESS.md` — 1-3(원가 단위) · 3-3 · 4-1 에 정정 주석 (§4 근거)

### §0 확인 후

- [ ] §3-3 영상 마진 확정 기입, 마진 100% 미만이면 단가 재조정
- [ ] `VIDEO_PER_SEC.kling` 최종값 반영

### 검증

- [ ] 사이드바 · Mode A · Mode B · ProductionStep 이 **동일 단가로 차감**되는지 확인
- [ ] 설정 화면 가격표 숫자 = 실제 차감 숫자 (이미지 3종 · 영상 2종 · 업스케일 2종 전수)
- [ ] 실패 시 무차감 정책 유지 (성공 후 `deduct()` 순서 — 현행 동작)
- [ ] 신규 영상 히스토리의 `model` 필드가 `kling-v2-6` 으로 기록되는지 확인

---

## 7. 미결 과제 (이번 범위 밖)

| 항목 | 내용 | 조치 |
|---|---|---|
| Nano Banana 2 실원가 | 공식 리스트 가격 미공개 (`IMAGE_MODEL_PRICING.md` §0) | 실월 청구서 실측 |
| Kling `image_tail` 원가 | 끝프레임 추가 과금 여부 불명 | 청구 내역 확인 후 가산 재결정 |
| 스크립트 1cr | 마진 25%로 가장 얇음 | 요금제 재설계 시 2cr 검토 |
| ULTRA 티어 | VEO 3 실매핑 후 출시할지 | 상품 결정 |
| TTS 레이트 리밋 | ~10 RPM. 동시 요청 시 429 | 큐잉 설계 (TTS 스펙에서) |
| 요금제·플랜 구조 | Free/Starter/Pro 배분, 쇼츠 패키지, B2B·BYOK | `PRICING_AND_BUSINESS.md` §7-8 별도 사이클 |
