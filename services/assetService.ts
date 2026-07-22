// =============================================================
//  개인 자산 보관함 서비스 (PRD §9.3)
//  실제 모드  → user_assets/user_asset_files + Storage(user-assets 비공개 버킷)
//  MOCK_MODE  → 인메모리 + objectURL (디자인 확인용, 세션 한정)
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';

export type AssetType = 'character' | 'product' | 'logo' | 'image';
export type FileRole = 'primary' | 'reference';

export interface AssetFile {
  id: string;
  storage_path: string;
  url: string;           // 표시용 signed URL(비공개 버킷) 또는 objectURL(목)
  file_role: FileRole;
  sort_order: number;
}

export interface Asset {
  id: string;
  owner_id: string;
  asset_type: AssetType;
  name: string;
  description: string;
  source_type: 'upload' | 'generated';
  created_at: string;
  updated_at: string;
  files: AssetFile[];
  primary_url: string | null;   // 목록 카드용 대표 이미지
}

export interface AssetFilter {
  type?: AssetType | 'all';
  search?: string;
  sort?: 'recent' | 'name';
}

export interface NewAssetFile {
  file: File;
  role: FileRole;
}

export const ASSET_TYPES: AssetType[] = ['character', 'product', 'logo', 'image'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (ASSET-06)
export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const BUCKET = 'user-assets';
const SIGNED_TTL = 3600;

// 캐릭터·제품: 대표1 + 참고 최대 4. 로고·일반: 원본 1장. (ASSET-04/05)
export function maxReferenceCount(type: AssetType): number {
  return type === 'character' || type === 'product' ? 4 : 0;
}

export function validateFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) return 'PNG·JPEG·WebP 형식만 업로드할 수 있습니다.';
  if (file.size > MAX_FILE_SIZE) return '파일당 최대 10MB까지 업로드할 수 있습니다.';
  return null;
}

function extOf(mime: string): string {
  return mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
}

async function signedUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? '';
}

// ================= MOCK (인메모리) =================
interface MockFile { id: string; role: FileRole; sort: number; url: string; path: string }
interface MockAsset {
  id: string; owner_id: string; asset_type: AssetType; name: string; description: string;
  source_type: 'upload' | 'generated'; created_at: string; updated_at: string; files: MockFile[];
}
let mockAssets: MockAsset[] | null = null;
function mockDb(): MockAsset[] { if (!mockAssets) mockAssets = []; return mockAssets; }
const nowIso = () => new Date().toISOString();
function toAsset(m: MockAsset): Asset {
  const files = m.files.map((f) => ({ id: f.id, storage_path: f.path, url: f.url, file_role: f.role, sort_order: f.sort }));
  return { ...m, files, primary_url: files.find((f) => f.file_role === 'primary')?.url ?? files[0]?.url ?? null };
}

// ================= 목록 =================
export async function listAssets(ownerId: string, filter?: AssetFilter): Promise<Asset[]> {
  if (MOCK_MODE) {
    let rows = mockDb().filter((a) => a.owner_id === ownerId);
    if (filter?.type && filter.type !== 'all') rows = rows.filter((a) => a.asset_type === filter.type);
    if (filter?.search) { const q = filter.search.toLowerCase(); rows = rows.filter((a) => a.name.toLowerCase().includes(q)); }
    rows = [...rows].sort((a, b) => filter?.sort === 'name' ? a.name.localeCompare(b.name) : b.created_at.localeCompare(a.created_at));
    return rows.map(toAsset);
  }

  let query = supabase.from('user_assets').select('*').eq('owner_id', ownerId);
  if (filter?.type && filter.type !== 'all') query = query.eq('asset_type', filter.type);
  if (filter?.search) query = query.ilike('name', `%${filter.search}%`);
  query = filter?.sort === 'name'
    ? query.order('name', { ascending: true })
    : query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];

  // 각 자산의 대표 파일 URL (목록 카드용)
  const ids = data.map((a) => a.id);
  const primaryByAsset = new Map<string, string>();
  if (ids.length) {
    const { data: files } = await supabase
      .from('user_asset_files')
      .select('asset_id, storage_path, file_role, sort_order')
      .in('asset_id', ids);
    // 자산별 대표(primary) 우선, 없으면 sort_order 최소
    const grouped = new Map<string, { path: string; role: FileRole; sort: number }[]>();
    (files ?? []).forEach((f) => {
      const arr = grouped.get(f.asset_id) ?? [];
      arr.push({ path: f.storage_path, role: f.file_role, sort: f.sort_order });
      grouped.set(f.asset_id, arr);
    });
    for (const [aid, arr] of grouped) {
      const pick = arr.find((x) => x.role === 'primary') ?? [...arr].sort((a, b) => a.sort - b.sort)[0];
      if (pick) primaryByAsset.set(aid, pick.path);
    }
  }
  return Promise.all(data.map(async (a) => ({
    ...a,
    files: [],
    primary_url: primaryByAsset.has(a.id) ? await signedUrl(primaryByAsset.get(a.id)!) : null,
  })));
}

// ================= 상세 =================
export async function getAsset(id: string): Promise<Asset | null> {
  if (MOCK_MODE) { const m = mockDb().find((a) => a.id === id); return m ? toAsset(m) : null; }

  const { data, error } = await supabase.from('user_assets').select('*').eq('id', id).single();
  if (error || !data) return null;
  const { data: files } = await supabase
    .from('user_asset_files').select('*').eq('asset_id', id).order('sort_order', { ascending: true });
  const assetFiles: AssetFile[] = await Promise.all((files ?? []).map(async (f) => ({
    id: f.id, storage_path: f.storage_path, url: await signedUrl(f.storage_path),
    file_role: f.file_role, sort_order: f.sort_order,
  })));
  return {
    ...data, files: assetFiles,
    primary_url: assetFiles.find((f) => f.file_role === 'primary')?.url ?? assetFiles[0]?.url ?? null,
  };
}

// ================= 생성 =================
export async function createAsset(
  ownerId: string,
  input: { asset_type: AssetType; name: string; description: string },
  files: NewAssetFile[],
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!input.name.trim()) return { ok: false, error: '이름을 입력해 주세요.' };
  for (const f of files) { const e = validateFile(f.file); if (e) return { ok: false, error: e }; }

  if (MOCK_MODE) {
    const id = `asset-${Date.now()}`;
    let sort = 0;
    const mfiles: MockFile[] = files.map((f) => ({
      id: `f-${Date.now()}-${sort}`, role: f.role, sort: f.role === 'primary' ? -1 : sort++,
      url: URL.createObjectURL(f.file), path: `mock/${id}/${f.file.name}`,
    }));
    mockDb().unshift({ id, owner_id: ownerId, asset_type: input.asset_type, name: input.name.trim(),
      description: input.description.trim(), source_type: 'upload', created_at: nowIso(), updated_at: nowIso(), files: mfiles });
    return { ok: true, id };
  }

  const { data: asset, error } = await supabase.from('user_assets')
    .insert({ owner_id: ownerId, asset_type: input.asset_type, name: input.name.trim(), description: input.description.trim() })
    .select('id').single();
  if (error || !asset) return { ok: false, error: error?.message ?? '자산 생성 실패' };

  const upErr = await uploadFiles(ownerId, asset.id, files);
  if (upErr) {
    // 파일 업로드 실패 시 자산 롤백(고아 방지, ASSET 예외처리)
    await supabase.from('user_assets').delete().eq('id', asset.id);
    return { ok: false, error: upErr };
  }
  return { ok: true, id: asset.id };
}

// 파일 업로드 헬퍼 (Storage + user_asset_files). 실패 시 에러 문자열 반환.
async function uploadFiles(ownerId: string, assetId: string, files: NewAssetFile[]): Promise<string | null> {
  let sort = 0;
  for (const { file, role } of files) {
    const path = `${ownerId}/${assetId}/${crypto.randomUUID()}.${extOf(file.type)}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return upErr.message;
    const { error: rowErr } = await supabase.from('user_asset_files').insert({
      asset_id: assetId, storage_path: path, file_role: role,
      sort_order: role === 'primary' ? -1 : sort++, mime_type: file.type, file_size: file.size,
    });
    if (rowErr) return rowErr.message;
  }
  return null;
}

// ================= 파일 추가/삭제 (상세) =================
export async function addAssetFiles(ownerId: string, assetId: string, files: NewAssetFile[]): Promise<{ ok: boolean; error?: string }> {
  for (const f of files) { const e = validateFile(f.file); if (e) return { ok: false, error: e }; }
  if (MOCK_MODE) {
    const m = mockDb().find((a) => a.id === assetId);
    if (!m) return { ok: false, error: '자산을 찾을 수 없습니다.' };
    let sort = m.files.length;
    files.forEach((f) => m.files.push({ id: `f-${Date.now()}-${sort}`, role: f.role, sort: sort++, url: URL.createObjectURL(f.file), path: `mock/${assetId}/${f.file.name}` }));
    m.updated_at = nowIso();
    return { ok: true };
  }
  const err = await uploadFiles(ownerId, assetId, files);
  return err ? { ok: false, error: err } : { ok: true };
}

export async function deleteAssetFile(fileId: string, storagePath: string): Promise<boolean> {
  if (MOCK_MODE) {
    for (const a of mockDb()) { const i = a.files.findIndex((f) => f.id === fileId); if (i >= 0) { a.files.splice(i, 1); return true; } }
    return false;
  }
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('user_asset_files').delete().eq('id', fileId);
  return !error;
}

// ================= 수정 =================
export async function updateAsset(id: string, patch: { name?: string; description?: string }): Promise<{ ok: boolean; error?: string }> {
  if (MOCK_MODE) {
    const m = mockDb().find((a) => a.id === id);
    if (!m) return { ok: false, error: '자산을 찾을 수 없습니다.' };
    if (patch.name !== undefined) m.name = patch.name.trim();
    if (patch.description !== undefined) m.description = patch.description.trim();
    m.updated_at = nowIso();
    return { ok: true };
  }
  const { error } = await supabase.from('user_assets').update({
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
  }).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ================= 연결 프로젝트 수 (삭제 확인, ASSET-09) =================
export async function countLinkedProjects(assetId: string): Promise<number> {
  if (MOCK_MODE) return 0;
  const { count } = await supabase.from('project_assets').select('*', { count: 'exact', head: true }).eq('asset_id', assetId);
  return count ?? 0;
}

// ================= 삭제 =================
export async function deleteAsset(id: string): Promise<{ ok: boolean; error?: string }> {
  if (MOCK_MODE) {
    const i = mockDb().findIndex((a) => a.id === id);
    if (i >= 0) mockDb().splice(i, 1);
    return { ok: true };
  }
  // Storage 파일 먼저 정리(고아 방지) → user_assets 삭제(CASCADE 로 files row 삭제)
  const { data: files } = await supabase.from('user_asset_files').select('storage_path').eq('asset_id', id);
  const paths = (files ?? []).map((f) => f.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from('user_assets').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
