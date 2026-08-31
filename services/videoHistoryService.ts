// =============================================================
//  동영상 생성 히스토리 서비스 (migration 034)
//
//  이미지 히스토리(032/imageHistoryService)의 영상 대응판.
//  두 개의 삭제 정책이 독립으로 돌아간다.
//    1) 사용자당 100편 상한 — 저장 시점에 실시간으로 초과분을 오래된 순으로 삭제.
//    2) 30일 TTL — 별도 cron(035)이 하루 1회 일괄 삭제.
//
//  '자산 보관함에 저장' 은 별개 개념 — createAsset 로 사본을 복제한 뒤 그 id 를
//  saved_asset_id 에 기록해 UI 에서 저장 뱃지를 채우는 근거로만 쓴다.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';

export const VIDEO_HISTORY_MAX_PER_USER = 100;
const BUCKET = 'video-history';
const SIGNED_TTL = 3600;

export interface VideoHistoryItem {
  id: string;
  owner_id: string;
  prompt: string;
  aspect: string;              // '16:9' | '9:16' | '1:1'
  duration_sec: number;
  model: string;
  has_start_frame: boolean;
  has_end_frame: boolean;
  storage_path: string;
  thumbnail_path: string | null;
  url: string;                 // 표시용 signed URL 또는 objectURL(MOCK)
  saved_asset_id: string | null;
  /** true 면 자동 정리(30일 TTL · 100편 상한) 대상에서 제외 — 프로젝트 씬 영상 (migration 043) */
  pinned?: boolean;
  created_at: string;
}

export interface SaveVideoHistoryInput {
  ownerId: string;
  prompt: string;
  aspect: string;
  durationSec: number;
  model: string;
  hasStartFrame?: boolean;
  hasEndFrame?: boolean;
  /** Kling 이 반환한 원격 mp4 URL — 서비스가 내려받아 Storage 로 재업로드한다 */
  videoUrl: string;
  /**
   * 프로젝트 산출물(씬 영상)이라 자동 정리에서 빼야 하는 항목인지.
   * 히스토리 상한·TTL 에 걸려 원본이 사라지면 프로젝트가 통째로 깨진다.
   */
  pinned?: boolean;
}

// ================= MOCK (인메모리) =================
interface MockRow extends Omit<VideoHistoryItem, 'url'> {
  videoUrl: string;
}
let mockDb: MockRow[] | null = null;
const mockRows = () => (mockDb ??= []);
const nowIso = () => new Date().toISOString();

function toItemMock(r: MockRow): VideoHistoryItem {
  const { videoUrl, ...rest } = r;
  return { ...rest, url: videoUrl };
}

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? '';
}

/** Kling 원격 URL 을 다운로드해 Storage 업로드. Kling 링크는 24시간 만료라 자체 보관 필요. */
async function fetchToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`video download failed: ${res.status}`);
  return res.blob();
}

// ================= 저장 (성공한 생성마다 호출) =================
export async function saveVideoHistory(
  input: SaveVideoHistoryInput,
): Promise<{ ok: boolean; item?: VideoHistoryItem; error?: string }> {
  if (MOCK_MODE) {
    const row: MockRow = {
      id: `vhist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      owner_id: input.ownerId,
      prompt: input.prompt,
      aspect: input.aspect,
      duration_sec: input.durationSec,
      model: input.model,
      has_start_frame: !!input.hasStartFrame,
      has_end_frame: !!input.hasEndFrame,
      storage_path: `mock/${input.ownerId}/${Date.now()}.mp4`,
      thumbnail_path: null,
      saved_asset_id: null,
      pinned: !!input.pinned,
      created_at: nowIso(),
      videoUrl: input.videoUrl,
    };
    mockRows().unshift(row);
    trimMock(input.ownerId);
    return { ok: true, item: toItemMock(row) };
  }

  const historyId = crypto.randomUUID();
  const path = `${input.ownerId}/${historyId}.mp4`;

  let blob: Blob;
  try {
    blob = await fetchToBlob(input.videoUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'download_failed' };
  }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'video/mp4',
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const row = {
    id: historyId,
    owner_id: input.ownerId,
    prompt: input.prompt,
    aspect: input.aspect,
    duration_sec: input.durationSec,
    model: input.model,
    has_start_frame: !!input.hasStartFrame,
    has_end_frame: !!input.hasEndFrame,
    storage_path: path,
  };
  let { data, error } = await supabase
    .from('video_generation_history')
    .insert(input.pinned ? { ...row, pinned: true } : row)
    .select('*')
    .single();
  // migration 043 이 아직 안 올라간 환경에서는 pinned 컬럼이 없다.
  // 영상 저장 자체가 실패하는 것보다는 정리 대상으로라도 남기는 편이 낫다.
  // (043 배포가 끝나면 이 폴백은 지워도 된다)
  if (error && input.pinned && /pinned/i.test(error.message)) {
    console.warn('[videoHistory] pinned 컬럼 없음 — migration 043 미적용. 폴백 저장.');
    ({ data, error } = await supabase
      .from('video_generation_history')
      .insert(row)
      .select('*')
      .single());
  }
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  // 100편 초과 시 오래된 것부터 삭제
  await trimToLimit(input.ownerId);

  const url = await signedUrl(path);
  return { ok: true, item: { ...(data as unknown as VideoHistoryItem), url } };
}

// ================= 목록 =================
/**
 * 히스토리 페이지네이션 조회.
 *   offset: 건너뛸 개수 (0 = 최신부터)
 *   limit:  가져올 개수 (기본 20)
 * 100편까지 저장되어도 초기엔 20편만 로드 → 초기 렌더 부하 완화.
 *
 * signed URL 은 배치 발급(createSignedUrls) 로 요청 1회에 처리.
 * 개별 발급은 20개면 20회 왕복이라 초기 로딩이 눈에 띄게 느려진다.
 */
export async function listVideoHistory(
  ownerId: string,
  limit = 20,
  offset = 0,
): Promise<VideoHistoryItem[]> {
  if (MOCK_MODE) {
    return mockRows()
      .filter((r) => r.owner_id === ownerId)
      .slice(offset, offset + limit)
      .map(toItemMock);
  }
  const { data, error } = await supabase
    .from('video_generation_history')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data || data.length === 0) return [];

  // signed URL 배치 발급 (1회 요청). 개별 loop 대비 왕복 대폭 감소.
  const paths = data.map((r) => (r as unknown as { storage_path: string }).storage_path);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
  const urlMap = new Map<string, string>();
  (signed ?? []).forEach((s) => {
    if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
  });

  return data.map((r) => ({
    ...(r as unknown as VideoHistoryItem),
    url: urlMap.get((r as unknown as { storage_path: string }).storage_path) ?? '',
  }));
}

/** 전체 개수만 반환 (더 보기 버튼 활성/비활성 판정용, 가벼운 count 쿼리). */
export async function countVideoHistory(ownerId: string): Promise<number> {
  if (MOCK_MODE) {
    return mockRows().filter((r) => r.owner_id === ownerId).length;
  }
  const { count } = await supabase
    .from('video_generation_history')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);
  return count ?? 0;
}

// ================= signed URL 만료 대응 · 재발급 =================
//
// project.scenes[i].video_url 에는 저장 시점의 signed URL 이 박혀 있다.
// SIGNED_TTL(1h) 이 지나면 그 URL 은 400 InvalidJWT("exp" claim timestamp check failed)
// 가 되어 <video> 는 검은 화면, 다운로드는 JSON 오류 페이지가 뜬다.
// 이 함수는 만료된 supabase 서명 URL 을 파싱해 storage_path 를 추출한 뒤 재발급한다.
// supabase 형식이 아닌 URL 은 그대로 반환 (예: Kling 직접 URL).

/** 재발급이 안 되는 이유. 호출부가 사용자에게 정확한 문구를 보여주는 근거. */
export type VideoUrlIssue =
  | 'not-supabase'  // 외부(Kling 등) URL — 재발급 대상 아님
  | 'other-bucket'  // video-history 가 아닌 버킷
  | 'deleted'       // 원본이 Storage 에 없음 (30일 TTL · 100편 상한 정리로 삭제됨)
  | 'sign-failed';  // 그 외 (로그인 세션 만료 · 네트워크 · 권한)

export interface RefreshedVideoUrl {
  /** 실제로 써야 할 URL. 재발급 실패 시엔 원본을 그대로 돌려준다. */
  url: string;
  /** 새 URL 을 발급했는지 여부 */
  refreshed: boolean;
  issue?: VideoUrlIssue;
  message?: string;
}

/**
 * 재발급 결과를 이유까지 담아 돌려준다.
 *
 * 기존 refreshVideoSignedUrl 은 실패해도 원본 URL 을 그대로 반환해서, 호출부가
 * "재발급 불가" 와 "원래 안 만료됨" 을 구분하지 못했다. 그 탓에 배치 다운로드가
 * 전부 실패해도 빈 zip 이 조용히 내려갔다.
 *
 * @param opts.download 넘기면 Supabase 가 Content-Disposition: attachment 를 붙여준다.
 *                      cross-origin 링크에는 <a download> 속성이 먹지 않으므로,
 *                      단일 파일 다운로드는 반드시 이 옵션을 써야 한다.
 */
export async function refreshVideoSignedUrlDetailed(
  oldUrl: string,
  opts?: { download?: string },
): Promise<RefreshedVideoUrl> {
  if (!oldUrl) return { url: oldUrl, refreshed: false, issue: 'not-supabase' };
  // Supabase signed URL 패턴: <base>/storage/v1/object/sign/<bucket>/<path>?token=...
  // 쿼리스트링이 없는 변형도 있으므로 '?' 를 필수로 두지 않는다.
  const m = oldUrl.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (!m) return { url: oldUrl, refreshed: false, issue: 'not-supabase' };
  const [, bucketId, rawPath] = m;
  if (bucketId !== BUCKET) return { url: oldUrl, refreshed: false, issue: 'other-bucket' };
  if (MOCK_MODE) return { url: oldUrl, refreshed: false };

  let path = rawPath;
  try { path = decodeURIComponent(rawPath); } catch { /* 인코딩 아님 → 원문 사용 */ }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL, opts?.download ? { download: opts.download } : undefined);
  if (error || !data?.signedUrl) {
    const message = error?.message ?? 'sign failed';
    // Storage 는 없는 객체에 대해 404 "Object not found" 를 준다.
    const gone = /not\s*found|does not exist|404/i.test(message);
    return { url: oldUrl, refreshed: false, issue: gone ? 'deleted' : 'sign-failed', message };
  }
  return { url: data.signedUrl, refreshed: true };
}

export async function refreshVideoSignedUrl(oldUrl: string): Promise<string> {
  return (await refreshVideoSignedUrlDetailed(oldUrl)).url;
}

export interface SceneVideoFetch {
  ok: boolean;
  blob?: Blob;
  /** 실제로 성공한 URL — 호출부가 프로젝트에 되박아 두면 다음 시도가 빨라진다. */
  url?: string;
  issue?: VideoUrlIssue | 'http';
  message?: string;
}

/**
 * 씬 mp4 를 내려받는다.
 *
 * 저장된 signed URL 은 1시간이면 만료라 "일단 받아보고 실패하면 재발급" 은 거의 항상
 * 헛돈다. 재발급을 먼저 하고, 그게 막히면 그때 원본으로 한 번 더 시도한다.
 */
export async function fetchSceneVideo(oldUrl: string): Promise<SceneVideoFetch> {
  if (!oldUrl) return { ok: false, issue: 'not-supabase', message: 'empty url' };
  const refreshed = await refreshVideoSignedUrlDetailed(oldUrl);
  // 원본이 삭제된 건 재시도로 해결되지 않는다 — 곧바로 이유를 돌려준다.
  if (refreshed.issue === 'deleted') return { ok: false, issue: 'deleted', message: refreshed.message };

  const candidates = refreshed.refreshed && refreshed.url !== oldUrl ? [refreshed.url, oldUrl] : [oldUrl];
  let message = refreshed.message ?? '';
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) return { ok: true, blob: await res.blob(), url };
      message = `HTTP ${res.status}`;
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, issue: refreshed.issue ?? 'http', message };
}

// ================= 개별 삭제 =================
export async function deleteVideoHistoryItem(id: string, storagePath: string): Promise<boolean> {
  if (MOCK_MODE) {
    const i = mockRows().findIndex((r) => r.id === id);
    if (i >= 0) mockRows().splice(i, 1);
    return true;
  }
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('video_generation_history').delete().eq('id', id);
  return !error;
}

// ================= 보관함 저장 반영 (뱃지용) =================
export async function markVideoHistorySaved(historyId: string, savedAssetId: string): Promise<boolean> {
  if (MOCK_MODE) {
    const row = mockRows().find((r) => r.id === historyId);
    if (row) row.saved_asset_id = savedAssetId;
    return true;
  }
  const { error } = await supabase
    .from('video_generation_history')
    .update({ saved_asset_id: savedAssetId })
    .eq('id', historyId);
  return !error;
}

// ================= 상한 트리밍 (100편) =================
async function trimToLimit(ownerId: string): Promise<void> {
  if (MOCK_MODE) { trimMock(ownerId); return; }
  // 프로젝트 씬 영상(pinned)은 상한 계산에서도, 삭제 대상에서도 제외한다.
  // 컬럼이 아직 없는 환경(043 미적용)에서는 필터를 뺀 쿼리로 폴백.
  let { data: excess, error } = await supabase
    .from('video_generation_history')
    .select('id, storage_path')
    .eq('owner_id', ownerId)
    .eq('pinned', false)
    .order('created_at', { ascending: false })
    .range(VIDEO_HISTORY_MAX_PER_USER, VIDEO_HISTORY_MAX_PER_USER + 50);
  if (error && /pinned/i.test(error.message)) {
    ({ data: excess } = await supabase
      .from('video_generation_history')
      .select('id, storage_path')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .range(VIDEO_HISTORY_MAX_PER_USER, VIDEO_HISTORY_MAX_PER_USER + 50));
  }
  if (!excess || excess.length === 0) return;
  const paths = excess.map((r) => r.storage_path);
  await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('video_generation_history').delete().in('id', excess.map((r) => r.id));
}

function trimMock(ownerId: string): void {
  const rows = mockRows();
  const own = rows.filter((r) => r.owner_id === ownerId && !r.pinned);
  if (own.length <= VIDEO_HISTORY_MAX_PER_USER) return;
  const overflow = own.slice(VIDEO_HISTORY_MAX_PER_USER);
  mockDb = rows.filter((r) => !overflow.includes(r));
}
