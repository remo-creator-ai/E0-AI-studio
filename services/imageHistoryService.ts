// =============================================================
//  이미지 생성 히스토리 서비스 (migration 032)
//
//  이미지 생성 화면에서 성공한 결과를 오른쪽 스트립으로 되돌아볼 수 있게 한다.
//  두 개의 삭제 정책이 독립으로 돌아간다.
//    1) 사용자당 200장 상한 — 저장 시점에 실시간으로 초과분을 오래된 순으로 삭제.
//    2) 30일 TTL — 별도 cron(033)이 하루 1회 일괄 삭제.
//
//  '자산 보관함에 저장' 은 별개 개념 — createAsset 로 사본을 복제한 뒤 그 id 를
//  saved_asset_id 에 기록해 UI 에서 저장 뱃지를 채우는 근거로만 쓴다. 이 서비스는
//  자산 사본 자체를 만들지 않는다.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';

export const HISTORY_MAX_PER_USER = 200;
const BUCKET = 'image-history';
const SIGNED_TTL = 3600;

export interface HistoryItem {
  id: string;
  owner_id: string;
  prompt: string;
  aspect: string;         // '1:1' | '16:9' | '9:16'
  style_kind: string | null;   // 'preset' | 'custom' | null
  style_value: string | null;  // preset: VisualStyle 값 / custom: custom style id
  model: string;
  storage_path: string;
  url: string;            // 표시용 signed URL(실제) 또는 objectURL(MOCK)
  saved_asset_id: string | null;
  created_at: string;
}

export interface SaveHistoryInput {
  ownerId: string;
  prompt: string;
  aspect: string;
  styleKind: 'preset' | 'custom' | null;
  styleValue: string | null;
  model: string;
  /** data:image/png;base64,... — 이미지 생성 결과 그대로 넘긴다 */
  dataUrl: string;
}

// ================= MOCK (인메모리) =================
interface MockRow extends Omit<HistoryItem, 'url'> {
  dataUrl: string;
}
let mockDb: MockRow[] | null = null;
const mockRows = () => (mockDb ??= []);
const nowIso = () => new Date().toISOString();

function toHistoryItemMock(r: MockRow): HistoryItem {
  const { dataUrl, ...rest } = r;
  return { ...rest, url: dataUrl };
}

/** data URL 을 Blob 으로 파싱해 Storage 업로드 형식으로 변환. */
function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? '';
}

// ================= 저장 (성공한 생성마다 호출) =================
export async function saveHistory(input: SaveHistoryInput): Promise<{ ok: boolean; item?: HistoryItem; error?: string }> {
  if (MOCK_MODE) {
    const row: MockRow = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      owner_id: input.ownerId,
      prompt: input.prompt,
      aspect: input.aspect,
      style_kind: input.styleKind,
      style_value: input.styleValue,
      model: input.model,
      storage_path: `mock/${input.ownerId}/${Date.now()}.png`,
      saved_asset_id: null,
      created_at: nowIso(),
      dataUrl: input.dataUrl,
    };
    mockRows().unshift(row);
    trimMock(input.ownerId);
    return { ok: true, item: toHistoryItemMock(row) };
  }

  const historyId = crypto.randomUUID();
  const path = `${input.ownerId}/${historyId}.png`;
  const { blob, mime } = dataUrlToBlob(input.dataUrl);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: mime, upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data, error } = await supabase
    .from('image_generation_history')
    .insert({
      id: historyId,
      owner_id: input.ownerId,
      prompt: input.prompt,
      aspect: input.aspect,
      style_kind: input.styleKind,
      style_value: input.styleValue,
      model: input.model,
      storage_path: path,
    })
    .select('*')
    .single();
  if (error || !data) {
    // 롤백: 방금 올린 파일 정리
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  // 200장 초과 시 오래된 것부터 삭제 (실시간 트리거)
  await trimToLimit(input.ownerId);

  const url = await signedUrl(path);
  return { ok: true, item: { ...(data as unknown as HistoryItem), url } };
}

// ================= 목록 =================
export async function listHistory(ownerId: string, limit = HISTORY_MAX_PER_USER): Promise<HistoryItem[]> {
  if (MOCK_MODE) {
    return mockRows()
      .filter((r) => r.owner_id === ownerId)
      .slice(0, limit)
      .map(toHistoryItemMock);
  }
  const { data, error } = await supabase
    .from('image_generation_history')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return Promise.all(
    data.map(async (r) => ({ ...(r as unknown as HistoryItem), url: await signedUrl(r.storage_path) })),
  );
}

// ================= 개별 삭제 =================
export async function deleteHistoryItem(id: string, storagePath: string): Promise<boolean> {
  if (MOCK_MODE) {
    const i = mockRows().findIndex((r) => r.id === id);
    if (i >= 0) mockRows().splice(i, 1);
    return true;
  }
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('image_generation_history').delete().eq('id', id);
  return !error;
}

// ================= 보관함 저장 반영 (뱃지용) =================
export async function markHistorySaved(historyId: string, savedAssetId: string): Promise<boolean> {
  if (MOCK_MODE) {
    const row = mockRows().find((r) => r.id === historyId);
    if (row) row.saved_asset_id = savedAssetId;
    return true;
  }
  const { error } = await supabase
    .from('image_generation_history')
    .update({ saved_asset_id: savedAssetId })
    .eq('id', historyId);
  return !error;
}

// ================= 상한 트리밍 (200장) =================
async function trimToLimit(ownerId: string): Promise<void> {
  if (MOCK_MODE) { trimMock(ownerId); return; }
  // 최신 200장 외의 row 조회 → 파일 삭제 → row 삭제
  // Supabase 는 subselect DELETE 를 못 쓰므로 두 번 왕복한다.
  const { data: excess } = await supabase
    .from('image_generation_history')
    .select('id, storage_path')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(HISTORY_MAX_PER_USER, HISTORY_MAX_PER_USER + 50); // 여유 폭
  if (!excess || excess.length === 0) return;
  const paths = excess.map((r) => r.storage_path);
  await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('image_generation_history').delete().in('id', excess.map((r) => r.id));
}

function trimMock(ownerId: string): void {
  const rows = mockRows();
  const own = rows.filter((r) => r.owner_id === ownerId);
  if (own.length <= HISTORY_MAX_PER_USER) return;
  const overflow = own.slice(HISTORY_MAX_PER_USER);
  mockDb = rows.filter((r) => !overflow.includes(r));
}
