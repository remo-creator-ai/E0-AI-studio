// =============================================================
//  동영상 → 자산 보관함 복제 서비스
//
//  사용자가 VideoStudio 결과 카드의 "보관함 저장" 버튼을 명시적으로 눌러야만
//  video_generation_history 의 임시 저장본이 user_assets 에 영구 자산으로
//  복제된다. (자동 저장은 X)
//
//  저장 흐름:
//   1) video-history 버킷의 mp4 를 다운로드 (signed URL)
//   2) user-assets 버킷에 재업로드 (경로: {owner_id}/{asset_id}/{file_id}.mp4)
//   3) user_assets (asset_type='video') + user_asset_files 로우 삽입
//   4) video_generation_history.saved_asset_id 갱신 (뱃지용)
//
//  마이그레이션 037 이 user-assets 버킷의 mime/size 를 이미 확장해 두었다.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import { markVideoHistorySaved, type VideoHistoryItem } from './videoHistoryService';

const USER_ASSETS_BUCKET = 'user-assets';

export interface SaveVideoAsAssetInput {
  ownerId: string;
  history: VideoHistoryItem;
  name: string;                  // 사용자 지정 이름 (기본: 프롬프트 앞머리)
  description?: string;          // 자유 텍스트 (기본: 프롬프트 전체)
}

export interface SaveVideoAsAssetResult {
  ok: boolean;
  assetId?: string;
  error?: string;
}

export async function saveVideoAsAsset(input: SaveVideoAsAssetInput): Promise<SaveVideoAsAssetResult> {
  const { ownerId, history, name, description } = input;
  const trimmedName = name.trim() || (history.prompt.slice(0, 40).trim() || '동영상');

  if (MOCK_MODE) {
    // MOCK: 실제 파일 복제는 하지 않고 성공 시뮬레이션
    await new Promise((r) => setTimeout(r, 400));
    const fakeId = `asset-video-${Date.now()}`;
    return { ok: true, assetId: fakeId };
  }

  // 1) 히스토리 signed URL 로 파일 다운로드
  let blob: Blob;
  try {
    const res = await fetch(history.url);
    if (!res.ok) return { ok: false, error: `video download failed: ${res.status}` };
    blob = await res.blob();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'download_error' };
  }

  // 2) user_assets row 먼저 생성 (id 필요)
  const { data: asset, error: assetErr } = await supabase
    .from('user_assets')
    .insert({
      owner_id: ownerId,
      asset_type: 'video',
      name: trimmedName,
      description: (description ?? history.prompt).trim(),
      source_type: 'generated',
    })
    .select('id')
    .single();
  if (assetErr || !asset) return { ok: false, error: assetErr?.message ?? 'asset_create_failed' };

  // 3) user-assets 버킷에 업로드
  const fileId = crypto.randomUUID();
  const path = `${ownerId}/${asset.id}/${fileId}.mp4`;
  const { error: upErr } = await supabase.storage.from(USER_ASSETS_BUCKET).upload(path, blob, {
    contentType: 'video/mp4',
    upsert: false,
  });
  if (upErr) {
    // 롤백: 방금 만든 asset row 제거
    await supabase.from('user_assets').delete().eq('id', asset.id);
    return { ok: false, error: upErr.message };
  }

  // 4) user_asset_files 로우 삽입
  const { error: fileRowErr } = await supabase.from('user_asset_files').insert({
    asset_id: asset.id,
    storage_path: path,
    file_role: 'primary',
    sort_order: -1,
    mime_type: 'video/mp4',
    file_size: blob.size,
    source_prompt: history.prompt,
    source_model: history.model,
  });
  if (fileRowErr) {
    // 롤백
    await supabase.storage.from(USER_ASSETS_BUCKET).remove([path]);
    await supabase.from('user_assets').delete().eq('id', asset.id);
    return { ok: false, error: fileRowErr.message };
  }

  // 5) 히스토리에 saved_asset_id 마크 (뱃지용)
  await markVideoHistorySaved(history.id, asset.id);

  return { ok: true, assetId: asset.id };
}
