// =============================================================
//  음성 생성 히스토리 서비스 (migration 039)
//
//  이미지(032)·동영상(034) 히스토리의 TTS 대응판.
//  두 개의 삭제 정책이 독립으로 돌아간다:
//    1) 사용자당 100개 상한 — 저장 시점에 실시간으로 초과분 삭제.
//    2) 30일 TTL — cron(040)이 하루 1회 일괄 삭제.
//
//  자산 보관함(user_assets) 저장은 하지 않는다 (사용자 결정, 2026-08-09).
//  → saved_asset_id 컬럼 · createAsset 연동 없음. 필요 시 다운로드만.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';

export const TTS_HISTORY_MAX_PER_USER = 100;
const BUCKET = 'voice-history';
const SIGNED_TTL = 3600;

export interface TtsHistoryItem {
  id: string;
  owner_id: string;
  text: string;
  voice_id: string;
  voice_label: string;
  char_count: number;
  speaking_rate: number;
  pitch: number;
  storage_path: string;
  /** 표시용 signed URL 또는 objectURL(MOCK) */
  url: string;
  created_at: string;
}

export interface SaveTtsHistoryInput {
  ownerId: string;
  text: string;
  voiceId: string;
  voiceLabel: string;
  charCount: number;
  speakingRate: number;
  pitch: number;
  /** ttsService 가 반환한 data:audio/mpeg;base64,... */
  audioDataUrl: string;
}

// ================= MOCK (인메모리) =================
interface MockRow extends Omit<TtsHistoryItem, 'url'> { audioUrl: string; }
let mockDb: MockRow[] | null = null;
const mockRows = () => (mockDb ??= []);
const nowIso = () => new Date().toISOString();

function toItemMock(r: MockRow): TtsHistoryItem {
  const { audioUrl, ...rest } = r;
  return { ...rest, url: audioUrl };
}

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? '';
}

/** data URL 을 Blob 으로 변환 (mp3). */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'audio/mpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ================= 저장 =================
export async function saveTtsHistory(
  input: SaveTtsHistoryInput,
): Promise<{ ok: boolean; item?: TtsHistoryItem; error?: string }> {
  if (MOCK_MODE) {
    const row: MockRow = {
      id: `tts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      owner_id: input.ownerId,
      text: input.text,
      voice_id: input.voiceId,
      voice_label: input.voiceLabel,
      char_count: input.charCount,
      speaking_rate: input.speakingRate,
      pitch: input.pitch,
      storage_path: `mock/${input.ownerId}/${Date.now()}.mp3`,
      created_at: nowIso(),
      audioUrl: input.audioDataUrl,
    };
    mockRows().unshift(row);
    trimMock(input.ownerId);
    return { ok: true, item: toItemMock(row) };
  }

  const historyId = crypto.randomUUID();
  const path = `${input.ownerId}/${historyId}.mp3`;

  const blob = dataUrlToBlob(input.audioDataUrl);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'audio/mpeg',
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data, error } = await supabase
    .from('voice_generation_history')
    .insert({
      id: historyId,
      owner_id: input.ownerId,
      text: input.text,
      voice_id: input.voiceId,
      voice_label: input.voiceLabel,
      char_count: input.charCount,
      speaking_rate: input.speakingRate,
      pitch: input.pitch,
      storage_path: path,
    })
    .select('*')
    .single();
  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error?.message ?? 'insert failed' };
  }

  await trimToLimit(input.ownerId);

  const url = await signedUrl(path);
  return { ok: true, item: { ...(data as unknown as TtsHistoryItem), url } };
}

// ================= 목록 =================
export async function listTtsHistory(
  ownerId: string,
  limit = 20,
  offset = 0,
): Promise<TtsHistoryItem[]> {
  if (MOCK_MODE) {
    return mockRows()
      .filter((r) => r.owner_id === ownerId)
      .slice(offset, offset + limit)
      .map(toItemMock);
  }
  const { data, error } = await supabase
    .from('voice_generation_history')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error || !data || data.length === 0) return [];

  const paths = data.map((r) => (r as unknown as { storage_path: string }).storage_path);
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
  const urlMap = new Map<string, string>();
  (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl); });

  return data.map((r) => ({
    ...(r as unknown as TtsHistoryItem),
    url: urlMap.get((r as unknown as { storage_path: string }).storage_path) ?? '',
  }));
}

export async function countTtsHistory(ownerId: string): Promise<number> {
  if (MOCK_MODE) return mockRows().filter((r) => r.owner_id === ownerId).length;
  const { count } = await supabase
    .from('voice_generation_history')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId);
  return count ?? 0;
}

// ================= 삭제 =================
export async function deleteTtsHistoryItem(id: string, storagePath: string): Promise<boolean> {
  if (MOCK_MODE) {
    const i = mockRows().findIndex((r) => r.id === id);
    if (i >= 0) mockRows().splice(i, 1);
    return true;
  }
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('voice_generation_history').delete().eq('id', id);
  return !error;
}

// ================= signed URL 재발급 =================
export async function refreshTtsSignedUrl(oldUrl: string): Promise<string> {
  if (!oldUrl) return oldUrl;
  const m = oldUrl.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)\?/);
  if (!m) return oldUrl;
  const [, bucketId, path] = m;
  if (bucketId !== BUCKET) return oldUrl;
  if (MOCK_MODE) return oldUrl;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data?.signedUrl) return oldUrl;
  return data.signedUrl;
}

// ================= 상한 트리밍 (100개) =================
async function trimToLimit(ownerId: string): Promise<void> {
  if (MOCK_MODE) { trimMock(ownerId); return; }
  const { data: excess } = await supabase
    .from('voice_generation_history')
    .select('id, storage_path')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(TTS_HISTORY_MAX_PER_USER, TTS_HISTORY_MAX_PER_USER + 50);
  if (!excess || excess.length === 0) return;
  const paths = excess.map((r) => r.storage_path);
  await supabase.storage.from(BUCKET).remove(paths);
  await supabase.from('voice_generation_history').delete().in('id', excess.map((r) => r.id));
}

function trimMock(ownerId: string): void {
  const rows = mockRows();
  const own = rows.filter((r) => r.owner_id === ownerId);
  if (own.length <= TTS_HISTORY_MAX_PER_USER) return;
  const overflow = own.slice(TTS_HISTORY_MAX_PER_USER);
  mockDb = rows.filter((r) => !overflow.includes(r));
}
