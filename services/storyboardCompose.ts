// =============================================================
//  스토리보드 합성 유틸 (모드 A 용)
//
//  스토리보드 다듬기(3단계) 를 거치면 각 씬의 image_url 이 개별적으로 갱신된다.
//  모드 A(통합 영상) 는 이 개별 씬 이미지들을 시작 프레임으로 쓸 그리드 한 장으로
//  합쳐야 한다.
//
//  Python 대신 브라우저 Canvas 를 사용한다 (오프라인·고속·의존성 무).
//  - 종횡비/씬 수에 맞는 격자 자동 산정
//  - 각 셀에 fit-contain 방식으로 그림 (letterbox 방지를 위해 최대한 채움)
//  - 셀 사이 얇은 흰 구분선 (모델이 grid 구조 인지 유지)
//  - 결과: data:image/png;base64,... URL
// =============================================================

export interface GridSize {
  rows: number;
  cols: number;
}

/** 씬 개수와 최종 종횡비에 맞춰 격자를 산정한다.
 *
 *  표준 스토리보드 씬 카운트(4·8·9·18)는 VisualizingStep 과 동일한 배치로 하드코딩.
 *  9씬 = 3x3 (2x5 아님) — 사용자가 스토리보드 만들기 단계에서 봐온 배치와 일치시켜
 *  일관성 확보. Kling 이 요구하는 것은 canvas 총 종횡비뿐이고 그건 composeScenesToGrid
 *  가 target aspect 로 강제하므로 여기서는 씬 배치 관습만 지키면 된다.
 *
 *  비표준 카운트(5/6/7/10 등)는 aspect 기반 자동 산정.
 */
export function pickGridLayout(sceneCount: number, aspect: '16:9' | '9:16' | '1:1'): GridSize {
  const n = Math.max(1, sceneCount);
  const isPortrait = aspect === '9:16';

  // ── 표준 씬 카운트 (VisualizingStep 과 동일) ──
  if (n === 1) return { rows: 1, cols: 1 };
  if (n === 4) return { rows: 2, cols: 2 };
  if (n === 8) return isPortrait ? { rows: 4, cols: 2 } : { rows: 2, cols: 4 };
  if (n === 9) return { rows: 3, cols: 3 };
  if (n === 18) return isPortrait ? { rows: 6, cols: 3 } : { rows: 3, cols: 6 };

  // ── 비표준 카운트: aspect 기반 자동 (정사각에 가까움 + 빈 셀 최소화) ──
  const targetRatio = aspect === '16:9' ? 16 / 9 : aspect === '9:16' ? 9 / 16 : 1;
  let best: GridSize = { rows: 1, cols: n };
  let bestScore = Infinity;

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const ratio = cols / rows;
    const shape = Math.abs(Math.log(ratio) - Math.log(targetRatio));
    const empty = rows * cols - n;
    // 빈 셀 페널티를 크게 (0.35) — 딱 맞는 격자를 강하게 선호.
    // 이전 0.15 일 때는 9씬에서 2x5(1개 빈 셀) 가 3x3(0개 빈 셀) 을 이겼음.
    const score = shape + empty * 0.35;
    if (score < bestScore) {
      bestScore = score;
      best = { rows, cols };
    }
  }
  return best;
}

/** URL 을 이미지로 로드. data URL / http URL 모두 지원. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${src.slice(0, 60)}...`));
    img.src = src;
  });
}

/** 셀 안에 이미지를 contain 방식으로 그린다 (레터박스 방지 위해 셀 배경은 별도 색으로 채움). */
function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number,
): void {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const cellRatio = w / h;
  let dw = w, dh = h;
  if (imgRatio > cellRatio) {
    // 이미지가 더 가로임 → 폭 기준
    dh = w / imgRatio;
  } else {
    dw = h * imgRatio;
  }
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export interface ComposeInput {
  imageUrls: string[];              // 씬 이미지 URL 배열 (오름차순: 씬 1 → N)
  layout?: GridSize;                // 없으면 aspect 기반 자동
  aspect?: '16:9' | '9:16' | '1:1'; // 최종 캔버스 비율 (Kling API 가 검증한다)
  canvasWidth?: number;             // 최종 캔버스 폭 (default: 1280 for 16:9)
  gap?: number;                     // 셀 사이 간격 px (default: 8)
  background?: string;              // 캔버스 배경/gap 색 (default: black)
}

/** 씬 이미지들을 그리드 한 장으로 합쳐 data URL 반환.
 *
 *  ⚠️ 이 캔버스는 Kling I2V 의 start image 로 전달되므로 **캔버스 전체 비율이
 *  요청한 aspect(16:9/9:16/1:1) 와 정확히 일치해야 한다**. 안 그러면 Kling 이
 *  "Image aspect ratio is invalid" 로 거부한다.
 *
 *  따라서 셀 크기를 먼저 정하지 않고, 캔버스 총 크기를 target aspect 로 고정한
 *  뒤 그 안에 그리드를 배치한다. 셀 자체의 종횡비는 씬 이미지의 비율과 다를 수
 *  있고, 이 차이는 contain-fit(letterbox)으로 흡수한다.
 */
export async function composeScenesToGrid(input: ComposeInput): Promise<{
  dataUrl: string;
  layout: GridSize;
  width: number;
  height: number;
}> {
  const { imageUrls } = input;
  if (imageUrls.length === 0) throw new Error('no images to compose');

  const aspect = input.aspect ?? '16:9';
  const layout = input.layout ?? pickGridLayout(imageUrls.length, aspect);
  const gap = input.gap ?? 8;
  const background = input.background ?? '#000000';

  // 로드 (실패한 이미지는 스킵하지 않고 에러 냄 — 조용한 셀 누락은 사용자에게 혼란)
  const images = await Promise.all(imageUrls.map(loadImage));

  // 최종 캔버스 크기 = target aspect 정확히 일치. 폭 기준으로 높이 산정.
  const targetRatio = aspect === '16:9' ? 16 / 9 : aspect === '9:16' ? 9 / 16 : 1;
  const canvasWidth = input.canvasWidth ?? (aspect === '9:16' ? 720 : 1280);
  const canvasHeight = Math.round(canvasWidth / targetRatio);

  // 셀 영역: 캔버스에서 gap 을 빼고 격자 나눔.
  const usableWidth = canvasWidth - (layout.cols + 1) * gap;
  const usableHeight = canvasHeight - (layout.rows + 1) * gap;
  const cellWidth = usableWidth / layout.cols;
  const cellHeight = usableHeight / layout.rows;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  // 캔버스 배경 (letterbox 색)
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 각 셀 그리기 — 셀 안에서 contain 방식으로 원본 비율 유지
  for (let i = 0; i < images.length; i++) {
    const row = Math.floor(i / layout.cols);
    const col = i % layout.cols;
    const x = gap + col * (cellWidth + gap);
    const y = gap + row * (cellHeight + gap);
    drawImageContain(ctx, images[i], x, y, cellWidth, cellHeight);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    layout,
    width: canvasWidth,
    height: canvasHeight,
  };
}
