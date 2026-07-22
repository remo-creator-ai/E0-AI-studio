# 이미지 모델 가격표 (내부 참조)

> 최종 조사: 2026-07-22 · 목적: 소담 AI 스튜디오 크레딧 단가 재산정 근거자료
> 이 문서는 원가(API) + 경쟁 서비스 크레딧 체계를 한자리에 모아 우리 크레딧 단가를 결정할 때 참고한다.

---

## 0. 결론 요약 (1024×1024, 실 원가 기준)

| 순위 | 모델 | 원가/장 | 특징 |
|-----|------|---------|------|
| 1 | **Google Imagen 4 Fast** | **$0.02** | 최저가, 가성비 우선 |
| 2 | **OpenAI GPT Image 2 (1K)** | **~$0.03** | 최신, 텍스트 렌더링 강함 |
| 3 | Google Imagen 4 Standard | $0.04 | |
| 4 | DALL·E 3 Standard | $0.04 | 구세대 |
| 5 | Google Imagen 4 Ultra | $0.06 | 고품질 |
| 5 | GPT Image 2 (4K) | $0.06 | 고해상도 |
| 6 | OpenAI GPT Image 1 (High) | $0.167 | 구세대, 고품질 |
| 7 | GPT Image 2 추정 4K High | ~$0.211 | 최상 티어 |

> 참고: Nano Banana 계열(Google Gemini 3.1 Flash Image Preview)은 Google 공식 리스트 가격 미공개. 우리 코드는 이 모델을 3cr/매트릭스로 소진 중이나 원가 재확인 필요.

---

## 1. OpenAI (공식 developer docs, 2026-07)

### 1-1. 토큰 단가
| 모델 | Input $/M | Cached Input $/M | Output $/M | Batch Output $/M |
|------|-----------|------------------|------------|------------------|
| **gpt-image-2** | 8.00 | 2.00 | **30.00** | 15.00 |
| gpt-image-1.5 | 8.00 | 2.00 | 32.00 | 16.00 |
| gpt-image-1-mini | 2.50 | 0.25 | 8.00 | 4.00 |

### 1-2. 해상도별 환산 (per-image, Standard tier)
| 해상도 | GPT Image 2 |
|--------|-------------|
| 1024×1024 (1K) | ~$0.03 |
| 1024×1536 / 1536×1024 (2K) | ~$0.05 |
| 4K | ~$0.06 |

- Batch API 사용 시 50% 할인 (동기 응답 불필요할 때만)
- GPT Image 1 (구세대): Low $0.011 / Medium $0.042 / High $0.167 (per 1024²)
- GPT Image 1 Mini: Low $0.005 / Medium $0.011 / High $0.036

### 1-3. DALL·E 3 (레거시)
| 티어 | 가격 |
|-----|------|
| Standard 1024² | $0.04 |
| HD 1024² | $0.08 |

---

## 2. Google (Vertex AI Imagen, Gemini Image)

### 2-1. Imagen 4 (per 1024×1024)
| 티어 | 가격 | 지원 비율 |
|-----|------|-----------|
| **Imagen 4 Fast** | **$0.02** | 1:1, 3:4, 4:3, 9:16, 16:9 |
| Imagen 4 Standard | $0.04 | 동일 |
| Imagen 4 Ultra | $0.06 | 동일 |

### 2-2. Imagen 3
| 티어 | 가격 |
|-----|------|
| Fast | $0.02 |
| Standard | $0.04 |

### 2-3. Gemini 이미지 시리즈 (Nano Banana 계열)
| 모델 ID | 통칭 | 원가 |
|---------|------|------|
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | **공식 미공개** (Google 프리뷰) |
| `gemini-3.1-flash-image-lite-preview` | Nano Banana 2 Lite | 공식 미공개 |
| `gemini-3-pro-image-preview` | Gemini 3 Pro Image / Nano Banana Pro | 문서상 ~$0.134/장 (2026-02 추정치) |
| `gemini-2.5-flash-image` | Gemini 2.5 Flash Image | 공식 미공개 |

> Google 공식 가격표 재확인 필요. Preview 모델은 정식 GA 전 무료·저가 프로모션이 붙는 경우가 많음.

---

## 3. 경쟁 서비스 크레딧 체계

### 3-1. Higgsfield
> Source: https://higgsfield.ai/pricing, https://www.imagine.art/blogs/higgsfield-ai-pricing

**구독 티어 (2026-07 기준)**
| 플랜 | 월 (연간결제) | 월 (월결제) | 월 크레딧 |
|------|-------------|-------------|-----------|
| Basic | $5 | $5 | 70 |
| Plus | $39 | $49 | 1,000 |
| Ultra | $99 | $129 | 3,000 |
| Business | $62/seat | $71/seat | 1,500/seat |

**모델별 크레딧 소진**
| 모델 | 이미지당 크레딧 |
|------|-----------------|
| GPT Image (2) | 1 |
| Nano Banana Pro | 2 |
| Flux Kontext | 1.5 |
| Soul Inpaint / Product Placement | 0.25 |

**Top-up**: 100 크레딧당 ~$5 (90일 만료)

**환산**: Plus $39/월 · 1,000cr → 1cr ≈ **$0.039** → GPT Image 1cr = $0.039 → 원가 $0.03 대비 마진 약 **30%** (박한 편)

### 3-2. Nano Banana (nanobanana.io, CyberBanana 등)
> Source: https://www.nano-banana.ai/pricing, https://nanobanana.io/pricing

- 신규 가입: 10 크레딧 무료
- Hobbyist: 15,000 크레딧/년 (≈ 750장)
- Pro: 36,000 크레딧/년 (≈ 1,800장)
- **크레딧 소진**:
  - Nano Banana (일반): 2 크레딧/장
  - Nano Banana Pro / 2: 8 크레딧/장 (1K/2K), **16 크레딧/장 (4K)**
- 크레딧 만료 없음, 언제든 취소 가능

### 3-3. BBanana AI (bbanana.ai, 빠나나 AI)
> Source: https://www.bbanana.ai/ (JS 렌더링, 자동 스크레이핑 불가)

**제공 모델 라인업 (모델 선택 UI 캡처 기준)**
- GPT Image 2
- Nano Banana Pro
- Nano Banana 2 (Gemini 3.1 Flash)
- Nano Banana 2 Lite (Gemini 3.1 Flash Lite)
- Seedream 5.0 Pro
- Seedream 5.0 Lite
- Grok Imagine Image (xAI)
- Nano Banana (일반)
- Seedream V4.5
- Z-IMAGE Turbo (Alibaba)
- Ideogram V4 · V3

**가격/크레딧**: ⬜ 미공개, 로그인 후 확인 필요 (직접 확인 후 이 문서에 채워 넣기)

---

## 4. 우리 프로덕트 반영 시 참고

### 4-1. 현재 코드 상태 (2026-07-22 실사)
`types.ts:59~81` — IMAGE_MODEL_INFO
| 모델 | 라벨 | 크레딧 |
|------|------|--------|
| gemini-3.1-flash-image-preview | Nano Banana 2 (Default) | 3cr/매트릭스 |
| gemini-3-pro-image-preview | Gemini 3 Pro (Nano Banana Pro) | 5cr/매트릭스 |
| gemini-2.5-flash-image | Gemini 2.5 Flash | 2cr/매트릭스 |

`store/creditStore.ts` — `IMAGE_PRO=5, IMAGE_STANDARD=2` 상수는 데드 코드 (SettingsPage 표시용, 실 소진과 무관)

### 4-2. GPT Image 2 도입 시 크레딧 산정 예시
Pro 플랜 기준 1cr ≈ ₩50 (₩49,900 / 1,000cr) 가정.

| 매트릭스 (9장) | 모델 | 원가 | 3cr | 5cr | 10cr | 15cr |
|---|---|---|---|---|---|---|
| GPT Image 2 1K | 9 × $0.03 = $0.27 (~₩378) | | -60% | -34% | +32% | +99% |
| GPT Image 2 2K | 9 × $0.05 = $0.45 (~₩630) | | -76% | -60% | -21% | +19% |
| GPT Image 2 4K | 9 × $0.06 = $0.54 (~₩756) | | -80% | -67% | -34% | -1% |
| Imagen 4 Fast | 9 × $0.02 = $0.18 (~₩252) | | -40% | 0% | +98% | +197% |
| Imagen 4 Std | 9 × $0.04 = $0.36 (~₩504) | | -70% | -50% | -1% | +49% |

**권장 크레딧 재설계 (마진 25% 이상 목표)**
| 모델 티어 | 크레딧/매트릭스 | 근거 |
|-----------|-----------------|------|
| **Imagen 4 Fast (기본)** | **5cr** | 원가 낮음, 대량 사용 유도 |
| GPT Image 2 1K | 10cr | 텍스트 렌더링 강한 편, 프리미엄 |
| GPT Image 2 2K | 15cr | |
| GPT Image 2 4K | 20cr | 고해상도 프리미엄 |
| Imagen 4 Ultra | 10cr | 고품질 옵션 |

### 4-3. Batch API 활용 여지
- OpenAI Batch API: 50% 할인, 응답 최대 24시간
- 자산 대량 생성(캐릭터 시트 등)에 적합. 실시간 스토리보드에는 부적합
- 도입 시 사용자 옵션 "빠른/저렴" 토글로 노출 가능

---

## 5. 액션 아이템

- [ ] BBanana AI 로그인 후 요금제·크레딧 표 이 문서에 채우기
- [ ] Google 공식 pricing 페이지에서 Gemini 3.1 Flash Image Preview / Nano Banana 2 원가 재확인
- [ ] `types.ts` IMAGE_MODEL_INFO에 GPT Image 2 추가 (모델 ID: `gpt-image-2`)
- [ ] `services/geminiService.ts` → OpenAI API 클라이언트 병행 도입 결정
- [ ] `store/creditStore.ts` 데드 상수 IMAGE_PRO/IMAGE_STANDARD 제거
- [ ] `docs/PRICING_AND_BUSINESS.md` §1-2, §3-2를 이 문서 기준으로 갱신
- [ ] `components/ImageStudio.tsx` (§9.4) UI에 모델·해상도 티어 선택 반영

---

## 6. 갱신 이력
| 날짜 | 갱신 |
|------|------|
| 2026-07-22 | 최초 작성. OpenAI GPT Image 2 공식 가격 + Google Imagen 4 + Higgsfield + Nano Banana 요금제 수집. BBanana는 미공개(추가 조사 필요). |

## 7. 참고 링크
- OpenAI 공식: https://developers.openai.com/api/docs/pricing
- OpenAI 가격 안내: https://openai.com/api/pricing/ (403 차단)
- Google AI Studio: https://ai.google.dev/pricing
- Higgsfield 요금제: https://higgsfield.ai/pricing
- Higgsfield 분석: https://www.imagine.art/blogs/higgsfield-ai-pricing
- Nano Banana 요금제: https://www.nano-banana.ai/pricing, https://nanobanana.io/pricing
- IntuitionLabs 이미지 가격 비교: https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai
- Unifically GPT Image 2 분석: https://unifically.com/blogs/gpt-image-2
- BBanana AI: https://www.bbanana.ai/ (수동 확인 필요)
