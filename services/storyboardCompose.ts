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

/** 씬 개수와 최종 종횡비에 맞춰 가장 정사각에 가까운 격자를 산정한다.
 *  Landscape(16:9): 열이 행보다 많이. Portrait(9:16): 행이 열보다 많이.
 *  Square(1:1): 정사각. */
export function pickGridLayout(sceneCount: number, aspect: '16:9' | '9:16' | '1:1'): GridSize {
  const n = Math.max(1, sceneCount);
  if (n === 1) return { rows: 1, cols: 1 };

  // 이상적인 열 개수를 aspect 로 편향해서 계산
  const targetRatio = aspect === '16:9' ? 16 / 9 : aspect === '9:16' ? 9 / 16 : 1;
  let best: GridSize = { rows: 1, cols: n };
  let bestScore = Infinity;

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    // 셀 하나가 대체로 정사각이라고 가정할 때, 전체 캔버스 비율은 cols/rows.
    // 목표 비율과의 로그 거리 + 빈 셀 페널티.
    const ratio = cols / rows;
    const shape = Math.abs(Math.log(ratio) - Math.log(targetRatio));
    const empty = rows * cols - n;
    const score = shape + empty * 0.15;
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
  aspect?: '16:9' | '9:16' | '1:1'; // layout 자동 산정에 사용
  cellWidth?: number;               // 개별 셀 폭 (default: 512)
  gap?: number;                     // 셀 사이 간격 px (default: 4)
  background?: string;              // 캔버스 배경/gap 색 (default: white)
}

/** 씬 이미지들을 그리드 한 장으로 합쳐 data URL 반환. */
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
  const cellWidth = input.cellWidth ?? 512;
  const gap = input.gap ?? 4;
  const background = input.background ?? '#FFFFFF';

  // 로드 (실패한 이미지는 스킵하지 않고 에러 냄 — 조용한 셀 누락은 사용자에게 혼란)
  const images = await Promise.all(imageUrls.map(loadImage));

  // 셀 높이는 첫 이미지의 실제 비율로 결정 (대부분 씬은 같은 비율이라 안전)
  const first = images[0];
  const firstRatio = first.naturalWidth / first.naturalHeight || 16 / 9;
  const cellHeight = Math.round(cellWidth / firstRatio);

  const width = layout.cols * cellWidth + (layout.cols + 1) * gap;
  const height = layout.rows * cellHeight + (layout.rows + 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  // 배경(구분선 색 = 배경색으로 자연스러운 white gap 구현)
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // 각 셀 그리기
  for (let i = 0; i < images.length; i++) {
    const row = Math.floor(i / layout.cols);
    const col = i % layout.cols;
    const x = gap + col * (cellWidth + gap);
    const y = gap + row * (cellHeight + gap);
    // 셀 배경 (검정)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, cellWidth, cellHeight);
    drawImageContain(ctx, images[i], x, y, cellWidth, cellHeight);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    layout,
    width,
    height,
  };
}
