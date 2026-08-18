// =============================================================
//  이미지 해상도 사다리 (imageSize)
//
//  Gemini 이미지 모델은 imageConfig.imageSize 를 받지만, 모델마다 지원
//  상한이 다르고 공식 문서에도 preview 모델의 지원 여부가 명시돼 있지 않다.
//  그래서 "요청 → 거부되면 한 단계 낮춰 재시도" 사다리가 필요하다.
//
//  이 규칙이 원래 geminiService 안에만 있어서, 같은 API 를 쓰는
//  imageUpscaleService 는 사다리 없이 단일 해상도로 요청했다. 그 결과
//  4K 업스케일이 flash 모델에서 매번 실패했다. 규칙은 여기 한 곳에만 둔다.
// =============================================================

/** imageConfig.imageSize 로 보낼 수 있는 값. 높은 것 → 낮은 것 순. */
export type ImageSizeStep = '4K' | '2K' | '1K';

export const IMAGE_SIZE_STEPS: ImageSizeStep[] = ['4K', '2K', '1K'];

/**
 * 모델별 시도 해상도 순서 (높은 것 → 낮은 것).
 *
 * 4K 시트는 3×3 기준 컷당 1280x720 으로 Kling std 입력과 정확히 맞는다.
 * 다만 preview 모델의 지원 여부가 공식 문서에 명시돼 있지 않아, 검증된
 * 모델만 4K 로 시작하고 나머지는 2K 부터 시도한 뒤 실패 시 내려간다.
 * (gemini-3-pro-image-preview 는 4K 실동작이 확인됨)
 */
export const IMAGE_SIZE_LADDER: Record<string, ImageSizeStep[]> = {
  'gemini-3-pro-image-preview': ['4K', '2K', '1K'],
  'gemini-3.1-flash-image-preview': ['2K', '1K'],
};

export const DEFAULT_IMAGE_SIZE_LADDER: ImageSizeStep[] = ['2K', '1K'];

export function ladderFor(model: string): ImageSizeStep[] {
  return IMAGE_SIZE_LADDER[model] ?? DEFAULT_IMAGE_SIZE_LADDER;
}

/**
 * 요청 해상도에서 시작해 아래로 내려가는 시도 순서.
 *
 * 요청값이 모델 사다리에 없어도(예: flash 에 4K) 일단 한 번은 시도한다 —
 * 사다리 표가 모델 업데이트를 못 따라갔을 수 있고, 실패해도 아래 단계로
 * 이어지므로 손해가 없다. 대신 실제로 성공한 단계를 호출부에 알려서
 * "4K 요금을 받고 2K 를 주는" 일이 없게 한다.
 */
export function ladderFrom(model: string, requested: ImageSizeStep): ImageSizeStep[] {
  const below = IMAGE_SIZE_STEPS.slice(IMAGE_SIZE_STEPS.indexOf(requested) + 1);
  const allowed = ladderFor(model);
  const rest = below.filter((s) => allowed.includes(s));
  return [requested, ...rest];
}

/** 해상도 파라미터가 거부된 응답인지 판별. 다른 실패와 섞이면 안 된다. */
export function isImageSizeRejection(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const looksLikeBadRequest = msg.includes('400') || msg.includes('invalid') || msg.includes('not supported');
  return looksLikeBadRequest && (msg.includes('imagesize') || msg.includes('image_size') || msg.includes('resolution') || msg.includes('size'));
}
