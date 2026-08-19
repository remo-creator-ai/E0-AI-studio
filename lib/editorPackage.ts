// =============================================================
//  편집 패키지 텍스트 산출물 (CapCut 임포트용)
//
//  씬 영상 mp4 들과 통짜 나레이션 mp3 만으로는 편집자가 "어디서 자를지",
//  "어느 자막이 어느 구간인지" 를 알 수 없다. 그 정보를 텍스트 파일로 같이 넣는다.
//
//  두 개의 시간축이 있고, 섞으면 안 된다:
//    · 영상 타임라인 — 씬 영상들을 순서대로 이어붙였을 때의 시각. 자막(SRT)의 기준.
//    · 나레이션 내부 시각 — 통짜 mp3 안에서 각 씬 대사가 시작되는 시각. 자르는 기준.
//  둘은 일치하지 않는다 (5초 영상에 3초 대사가 들어가기도 하므로).
// =============================================================

import type { NarrationCue } from '../services/narrationService';

export interface PackageScene {
  /** 씬 번호 (1부터) */
  order: number;
  /** 이 씬 영상의 실제 길이(초) */
  durationSeconds: number;
  /** 대사 · 자막 */
  script: string;
  /** ZIP 안의 파일명 (예: scene-01.mp4) */
  filename: string;
}

/** SRT 시각 표기: 00:00:05,000 */
function srtTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(s)},${String(ms).padStart(3, '0')}`;
}

/** 사람이 읽는 시각 표기: 1:05.3 */
function readableTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/**
 * 자막 파일. 씬 영상을 순서대로 붙인 **영상 타임라인** 기준이다.
 * 대사가 없는 씬은 자막 항목을 만들지 않는다 (빈 자막이 뜨면 지저분하다).
 */
export function buildSrt(scenes: PackageScene[]): string {
  const blocks: string[] = [];
  let cursor = 0;
  let index = 0;

  for (const scene of scenes) {
    const start = cursor;
    const end = cursor + scene.durationSeconds;
    cursor = end;

    const text = scene.script.trim();
    if (!text) continue;

    index += 1;
    blocks.push(`${index}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`);
  }

  return blocks.join('\n');
}

/**
 * 나레이션 자르는 지점 목록.
 *
 * cues 는 합성 결과에서 받은 실제 시각이라 그대로 자르면 맞는다.
 * cue 가 없으면(타임포인트 미지원 응답 등) 그 사실을 숨기지 않고 적어둔다 —
 * 추정치를 사실처럼 적어두면 편집자가 그걸 믿고 잘랐다가 어긋난다.
 */
export function buildCutList(scenes: PackageScene[], cues: NarrationCue[]): string {
  const byOrder = new Map(cues.map((c) => [c.order, c.startSeconds]));
  const lines: string[] = [
    '나레이션 자르는 지점 (narration.mp3 안에서의 시각)',
    '',
    'CapCut 에서 narration.mp3 를 올린 뒤, 아래 시각에서 잘라 각 씬 영상 밑에 맞추세요.',
    '이 시각은 음성 합성 결과에서 직접 받은 값이라 추정치가 아닙니다.',
    '',
  ];

  if (cues.length === 0) {
    lines.push('⚠️ 이번 합성에서는 씬별 시각을 받지 못했습니다. 귀로 들으며 잘라야 합니다.');
    lines.push('');
  }

  for (const scene of scenes) {
    const text = scene.script.trim();
    if (!text) {
      lines.push(`씬 ${String(scene.order).padStart(2, '0')}  (대사 없음)`);
      continue;
    }
    const at = byOrder.get(scene.order);
    const stamp = at === undefined ? '   —   ' : readableTime(at).padStart(7, ' ');
    lines.push(`씬 ${String(scene.order).padStart(2, '0')}  ${stamp}  ${text}`);
  }

  return lines.join('\n') + '\n';
}

/** 전체 대사 원문. 다른 도구로 음성을 다시 만들 때 그대로 붙여 쓴다. */
export function buildScriptText(scenes: PackageScene[]): string {
  const lines: string[] = [];
  for (const scene of scenes) {
    const text = scene.script.trim();
    if (!text) continue;
    lines.push(`[씬 ${String(scene.order).padStart(2, '0')}] ${text}`);
  }
  return lines.join('\n') + '\n';
}

/** 영상 타임라인 — 각 씬이 몇 초부터 시작하는지 */
export function buildTimeline(scenes: PackageScene[]): string {
  const lines = ['영상 타임라인 (씬 영상을 번호순으로 이어붙였을 때)', ''];
  let cursor = 0;
  for (const scene of scenes) {
    lines.push(
      `${readableTime(cursor).padStart(7, ' ')}  ${scene.filename}  (${scene.durationSeconds.toFixed(1)}초)`
    );
    cursor += scene.durationSeconds;
  }
  lines.push('', `총 길이 ${readableTime(cursor)}`);
  return lines.join('\n') + '\n';
}

export interface ReadmeInput {
  projectTitle: string;
  sceneCount: number;
  totalSeconds: number;
  hasNarration: boolean;
}

/** 압축을 푼 사람이 제일 먼저 여는 파일. 순서대로 따라만 하면 되게 쓴다. */
export function buildReadme(input: ReadmeInput): string {
  const { projectTitle, sceneCount, totalSeconds, hasNarration } = input;
  return [
    `${projectTitle} — CapCut 편집 패키지`,
    '',
    `씬 ${sceneCount}개 · 영상 총 길이 약 ${readableTime(totalSeconds)}`,
    '',
    '── 들어있는 것 ──',
    'scene-01.mp4 …   씬 영상. 파일명 순서가 곧 편집 순서입니다.',
    ...(hasNarration ? ['narration.mp3    전체 대사를 한 번에 읽은 나레이션.'] : []),
    ...(hasNarration ? ['cut-list.txt     narration.mp3 를 씬별로 자르는 지점.'] : []),
    'subtitles.srt    자막. 씬 영상을 순서대로 붙인 기준입니다.',
    'timeline.txt     각 씬이 몇 초부터 시작하는지.',
    'script.txt       전체 대사 원문.',
    '',
    '── CapCut 에서 하는 순서 ──',
    '1. CapCut 새 프로젝트를 만듭니다.',
    '2. scene-01.mp4 부터 마지막까지 전부 선택해 타임라인으로 끌어다 놓습니다.',
    '   → 파일명 순서대로 배치됩니다. 순서가 섞이면 이름순 정렬을 확인하세요.',
    ...(hasNarration ? [
      '3. narration.mp3 를 오디오 트랙에 올립니다.',
      '4. cut-list.txt 의 시각에서 나레이션을 잘라 각 씬 영상 밑으로 옮깁니다.',
      '5. subtitles.srt 를 자막으로 가져옵니다. (자막 → 로컬 자막 가져오기)',
    ] : [
      '3. subtitles.srt 를 자막으로 가져옵니다. (자막 → 로컬 자막 가져오기)',
    ]),
    '',
    '── 알아두실 것 ──',
    '· 나레이션은 통짜로 만듭니다. 씬별로 따로 만들면 같은 목소리라도 톤이 갈립니다.',
    '· 자막 시각은 씬 영상 길이를 그대로 이은 값입니다. 편집에서 길이를 바꾸면 어긋납니다.',
    '',
  ].join('\n');
}
