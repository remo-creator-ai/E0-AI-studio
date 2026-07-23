// =============================================================
//  단건 이미지 제작 서비스 (PRD §9.4)
//
//  ⚠️ 격리 원칙 — services/geminiService.ts 를 import 하지 않는다.
//  geminiService.generateSingleImage() 은 이름과 달리 영상 스토리보드의
//  씬 재생성 함수다(components/AssemblyStep.tsx:631 에서 호출). 그쪽을
//  건드리면 영상 기획 결과물이 바뀌므로, 단건 제작은 자체 경로로 간다.
//  공유하는 것은 부수효과 없는 유틸(imageUtils)과 API 키 조달뿐이다.
//
//  두 경로가 요구사항까지 수렴하면 그때 공용 추출을 검토한다.
// =============================================================

import { MOCK_MODE } from '../lib/mockAuth';
import { proxyClient, proxyHealth } from '../lib/aiProxy';

// ---------- 화면비 ----------
// 영상 경로의 types.ts AspectRatio(16:9/9:16) 를 건드리지 않기 위한 전용 타입.
// 단건 제작은 1:1 을 기본값으로 쓰므로 열거값이 다르다.
export type StudioAspect = '1:1' | '16:9' | '9:16';
export const STUDIO_ASPECTS: StudioAspect[] = ['1:1', '16:9', '9:16'];
export const DEFAULT_ASPECT: StudioAspect = '1:1';

// ---------- 크레딧 단가 ----------
// 확정: 단건 1장 = 1크레딧 (2026-07-22).
//
// 근거 (docs/IMAGE_MODEL_PRICING.md):
//   - types.ts 의 IMAGE_MODEL_INFO.creditCost 는 "매트릭스(3x3, 최대 9장)" 단위다
//     (VisualizingStep.tsx:266). 그 값을 그대로 쓰면 1장에 3크레딧이 되어 영상
//     경로의 장당 단가(3cr/9장 = 0.33cr)보다 약 9배 비싸진다.
//   - 문서의 영상 경로 권장안은 Imagen 4 Fast 5cr/매트릭스(장당 0.55cr, 마진 0%,
//     대량 사용 유도). 단건 1cr 은 그 대비 약 2배의 단품 프리미엄이면서 마진이
//     양수다(원가 $0.02~0.03 = 약 28~42원, 1cr ≈ 50원 기준).
//
// 주의: 현재 사용 모델(Gemini 3.1 Flash Image Preview)의 공식 원가는 아직
//       미공개라 위 마진은 Imagen 4 Fast / GPT Image 2 원가를 대리 지표로 삼은
//       추정이다. 문서의 액션 아이템(원가 재확인)이 끝나면 재검토할 것.
export const IMAGE_STUDIO_CREDIT_COST = 1;

// ---------- 멀티샷 (Higgsfield 스타일: 6개 프리셋을 병렬 생성) ----------
// 총액 6cr = 1cr/샷. 단일 이미지 단가와 동일해 부분 실패 시 성공 수만큼 차감하는 규칙이 자연스럽다.
// 프리셋은 프롬프트 앞에 프리픽스로 합성된다 (STYLE_PROMPT_GUIDES 와 동일 패턴, 스타일 뒤에 놓인다).
export const IMAGE_STUDIO_MULTISHOT_COST_PER_SHOT = 1;
export const IMAGE_STUDIO_MULTISHOT_SHOTS = 6;
// 1개 시트로 만들기: 6샷을 한 장의 2x3 그리드 이미지로 생성 (API 호출 1번). 개별 6장 대비 저렴.
export const IMAGE_STUDIO_MULTISHOT_SHEET_COST = 1;

export interface MultishotShotPreset {
  id: string;         // 히스토리 style_value 나 로그에 저장할 stable id
  labelKey: string;   // i18n 경로
  promptPrefix: string;
}

export interface MultishotPack {
  id: 'camera' | 'character' | 'product';
  labelKey: string;
  descKey: string;
  shots: MultishotShotPreset[];  // 정확히 IMAGE_STUDIO_MULTISHOT_SHOTS 개
}

export const MULTISHOT_PACKS: MultishotPack[] = [
  {
    id: 'camera',
    labelKey: 'imageStudio.multishot.packs.camera',
    descKey:  'imageStudio.multishot.packs.cameraDesc',
    shots: [
      { id: 'wide',      labelKey: 'imageStudio.multishot.shots.wide',      promptPrefix: 'wide angle establishing shot, full scene visible, subject centered' },
      { id: 'medium',    labelKey: 'imageStudio.multishot.shots.medium',    promptPrefix: 'medium shot, waist up composition, natural framing' },
      { id: 'closeup',   labelKey: 'imageStudio.multishot.shots.closeup',   promptPrefix: 'close-up shot, tight framing on subject, sharp details visible' },
      { id: 'ots',       labelKey: 'imageStudio.multishot.shots.ots',       promptPrefix: 'over-the-shoulder view, looking past a foreground subject toward the main scene' },
      { id: 'lowAngle',  labelKey: 'imageStudio.multishot.shots.lowAngle',  promptPrefix: 'dramatic low angle, hero shot, camera looking up at the subject' },
      { id: 'birdseye',  labelKey: 'imageStudio.multishot.shots.birdseye',  promptPrefix: "top-down bird's eye view, overhead perspective looking directly down" },
    ],
  },
  {
    id: 'character',
    labelKey: 'imageStudio.multishot.packs.character',
    descKey:  'imageStudio.multishot.packs.characterDesc',
    shots: [
      { id: 'front',        labelKey: 'imageStudio.multishot.shots.front',        promptPrefix: 'front view of the character, facing camera directly, neutral pose, full body visible' },
      { id: 'threeQuarter', labelKey: 'imageStudio.multishot.shots.threeQuarter', promptPrefix: 'three-quarter view of the character, angled 45 degrees from camera, full body visible' },
      { id: 'side',         labelKey: 'imageStudio.multishot.shots.side',         promptPrefix: 'side profile view of the character, facing exactly 90 degrees from camera, full body visible' },
      { id: 'back',         labelKey: 'imageStudio.multishot.shots.back',         promptPrefix: 'back view of the character, facing away from camera, full body visible' },
      { id: 'expression',   labelKey: 'imageStudio.multishot.shots.expression',   promptPrefix: 'close-up portrait of the character showing a natural, expressive facial emotion, shoulders and head visible' },
      { id: 'actionPose',   labelKey: 'imageStudio.multishot.shots.actionPose',   promptPrefix: 'dynamic action pose of the character in motion, full body visible, sense of movement' },
    ],
  },
  {
    id: 'product',
    labelKey: 'imageStudio.multishot.packs.product',
    descKey:  'imageStudio.multishot.packs.productDesc',
    shots: [
      { id: 'hero',        labelKey: 'imageStudio.multishot.shots.hero',        promptPrefix: 'hero product shot, clean seamless background, dramatic studio lighting, product centered' },
      { id: 'detail',      labelKey: 'imageStudio.multishot.shots.detail',      promptPrefix: 'extreme close-up detail shot of the product, macro focus on texture and material' },
      { id: 'lifestyle',   labelKey: 'imageStudio.multishot.shots.lifestyle',   promptPrefix: 'lifestyle context shot, product used naturally in a real environment by a person' },
      { id: 'packaging',   labelKey: 'imageStudio.multishot.shots.packaging',   promptPrefix: 'product with its original packaging visible, retail-ready presentation' },
      { id: 'group',       labelKey: 'imageStudio.multishot.shots.group',       promptPrefix: 'group shot showing multiple angles or color variants of the product together' },
      { id: 'inUse',       labelKey: 'imageStudio.multishot.shots.inUse',       promptPrefix: 'in-use scene, hands interacting with the product, natural angle showing functionality' },
    ],
  },
];

export const DEFAULT_MULTISHOT_PACK: MultishotPack['id'] = 'camera';

// TODO(미정): 사용할 이미지 모델 확정 필요.
// 확정 전까지 IMAGE_MODEL_INFO 가 Default 로 표기한 3.1 Flash 를 잠정 사용한다.
export const IMAGE_STUDIO_MODEL = 'gemini-3.1-flash-image-preview';

export type GenerateFailure =
  | 'no_api_key'      // admin_config 에 gemini_api_key 미등록
  | 'blocked'         // 콘텐츠 정책 차단 (기술 오류와 구분, 계획서 §9)
  | 'error';          // 그 외 기술 오류

export interface GenerateResult {
  ok: boolean;
  /** 성공 시 data:image/png;base64,... */
  imageUrl?: string;
  failure?: GenerateFailure;
  message?: string;
}

/** 키 미등록 상태를 UI 가 미리 알 수 있도록 별도 노출 (생성 버튼 안내용).
 *  프록시의 /health 는 설정 여부(boolean)만 알려주고 키 값은 돌려주지 않는다. */
export async function isImageApiReady(): Promise<boolean> {
  if (MOCK_MODE) return true;
  const health = await proxyHealth();
  return Boolean(health?.gemini);
}

export interface GenerateInput {
  prompt: string;
  aspect: StudioAspect;
  /** 참고 이미지 (data URL 또는 http URL). 3단계에서 자산 보관함이 채운다. */
  references?: string[];
}

export async function generateStudioImage(input: GenerateInput): Promise<GenerateResult> {
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, failure: 'error', message: 'empty_prompt' };

  if (MOCK_MODE) {
    // 디자인(가계정) 모드: 실제 호출 없이 흐름만 확인한다.
    await new Promise((r) => setTimeout(r, 1200));
    return { ok: true, imageUrl: mockImage(input.aspect) };
  }

  const ai = await proxyClient();
  if (!ai) return { ok: false, failure: 'no_api_key', message: 'no_session' };

  try {
    const parts: Record<string, unknown>[] = [];

    // 참고 이미지가 있을 때만 스타일 지시를 덧붙인다.
    if (input.references?.length) {
      const { normalizeImageInput } = await import('./imageUtils');
      for (const ref of input.references) {
        const { mimeType, base64 } = await normalizeImageInput(ref);
        parts.push({ inlineData: { mimeType, data: base64 } });
      }
      parts.push({
        text:
          'REFERENCE INSTRUCTION: Use the attached images as visual references for ' +
          'the subject, style, and details described below.\n\n' +
          `PROMPT: ${prompt}`,
      });
    } else {
      // 영상 경로와 달리 "Cinematic, professional photography, 4k" 같은
      // 스타일을 강제하지 않는다. 로고·일러스트·제품컷도 만들 수 있어야 한다.
      parts.push({ text: prompt });
    }

    const response = await ai.models.generateContent({
      model: IMAGE_STUDIO_MODEL,
      contents: { parts },
      config: {
        responseModalities: ['Image'],
        imageConfig: { aspectRatio: input.aspect },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) return { ok: false, failure: 'error', message: 'no_candidates' };
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      return { ok: false, failure: 'blocked', message: candidate.finishReason };
    }
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return { ok: true, imageUrl: `data:image/png;base64,${part.inlineData.data}` };
      }
    }
    return { ok: false, failure: 'error', message: 'no_image_data' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 프록시가 키 미설정으로 503 을 돌려준 경우를 구분해 안내를 달리한다.
    if (msg.includes('GEMINI_API_KEY') || msg.includes('503')) {
      return { ok: false, failure: 'no_api_key', message: msg };
    }
    return { ok: false, failure: 'error', message: msg };
  }
}

/** 목 모드 placeholder — 선택한 형태의 비율을 그대로 가진 SVG */
function mockImage(aspect: StudioAspect): string {
  const [w, h] = aspect === '1:1' ? [800, 800] : aspect === '16:9' ? [1280, 720] : [720, 1280];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#E5EDFA"/>` +
    `<text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w / 18)}" fill="#0050BF">` +
    `${aspect} preview</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}
