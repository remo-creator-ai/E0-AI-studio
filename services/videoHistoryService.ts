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

  const { data, error } = await supabase
    .from('video_generation_history')
    .insert({
      id: historyId,
      owner_id: input.ownerId,
      prompt: input.prompt,
      aspect: input.aspect,
      duration_sec: input.durationSec,
      model: input.model,
      has_start_frame: !!input.hasStartFrame,
      has_end_frame: !!input.hasEndFrame,
      storage_path: path,
    })
    .select('*')
    .single();
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
  const { data: excess } = await supabase
    .from('video_generation_history')
    .select('id, storage_path')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(VIDEO_HISTORY_MAX_PER_USER, VIDEO_HISTORY_MAX_PER_USER + 50);
  if (!excess || excess.length === 0) return;
  const paths = excess.map((r) => r.storage_path);
  await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('video_generation_history').delete().in('id', excess.map((r) => r.id));
}

function trimMock(ownerId: string): void {
  const rows = mockRows();
  const own = rows.filter((r) => r.owner_id === ownerId);
  if (own.length <= VIDEO_HISTORY_MAX_PER_USER) return;
  const overflow = own.slice(VIDEO_HISTORY_MAX_PER_USER);
  mockDb = rows.filter((r) => !overflow.includes(r));
}
