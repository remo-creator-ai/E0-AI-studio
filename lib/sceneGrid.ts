// =============================================================
//  스토리보드 시트 격자 규칙 (단일 정의)
//
//  시트는 project.aspect_ratio 로 생성되고, VisualizingStep 은 시트를
//  (W/cols) x (H/rows) 로 잘라 컷 이미지를 만든다.
//  따라서  셀 종횡비 = (W/H) x (rows/cols)  이고,
//  rows === cols 일 때만 컷이 프로젝트 비율과 일치한다.
//
//  이 불변식이 깨지면 다듬기 단계의 크롭 박스(프로젝트 비율)와 실제 컷 비율이
//  어긋나고, 재생성·업스케일이 프로젝트 비율을 강제하면서 그림이 잘리거나
//  늘어난다. 예전 "8컷 가로 = 2행x4열" 이 정확히 그 케이스였다 (셀 8:9).
//
//  PlanningStep(프로젝트 생성 시 grid_images 배열 길이 산정)과
//  VisualizingStep(생성·슬라이스)이 각자 계산하던 것을 여기로 합쳤다.
//  두 곳이 어긋나면 유닛 수가 안 맞아 컷이 통째로 비는 사고가 난다.
// =============================================================

export interface SceneGridLayout {
  rows: number;
  cols: number;
  /** 시트 1장(유닛)에 담기는 컷 수 = rows * cols */
  scenesPerUnit: number;
}

/** 씬 수 → 격자. rows === cols 불변식을 지킨다. */
export function getSceneGridLayout(sceneCount: number): SceneGridLayout {
  switch (sceneCount) {
    case 4: return { rows: 2, cols: 2, scenesPerUnit: 4 };   // 1유닛
    case 8: return { rows: 2, cols: 2, scenesPerUnit: 4 };   // 2유닛
    case 18: return { rows: 3, cols: 3, scenesPerUnit: 9 };  // 2유닛
    case 27: return { rows: 3, cols: 3, scenesPerUnit: 9 };  // 3유닛
    case 9:
    default: return { rows: 3, cols: 3, scenesPerUnit: 9 };  // 1유닛
  }
}

/** 씬 수에 필요한 시트(유닛) 개수 */
export function getSceneGridUnits(sceneCount: number): number {
  return Math.ceil(sceneCount / getSceneGridLayout(sceneCount).scenesPerUnit);
}
