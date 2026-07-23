// =============================================================
//  사용자 커스텀 비주얼 스타일 서비스 (migration 031)
//
//  이미지 생성 화면의 스타일 팝업에 사용자가 직접 등록한 스타일을 병합해 보여준다.
//  구조는 assetService 와 동일 패턴: 실제 모드(Supabase) + MOCK_MODE(인메모리).
//
//  상한 10 은 UI/서비스 레이어에서 강제한다 (DB 는 무제한).
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';

export interface CustomStyle {
  id: string;
  owner_id: string;
  name: string;
  icon_emoji: string;
  prompt_guide: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const MAX_CUSTOM_STYLES = 10;

export interface CustomStyleInput {
  name: string;
  icon_emoji?: string;    // 미지정 시 🎨
  prompt_guide: string;
}

// ================= MOCK (인메모리) =================
let mockDb: CustomStyle[] | null = null;
const mockRows = () => (mockDb ??= []);
const nowIso = () => new Date().toISOString();

// ================= 목록 =================
export async function listCustomStyles(ownerId: string): Promise<CustomStyle[]> {
  if (MOCK_MODE) {
    return mockRows()
      .filter((r) => r.owner_id === ownerId)
      .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  }
  const { data, error } = await supabase
    .from('user_custom_styles')
    .select('*')
    .eq('owner_id', ownerId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as CustomStyle[];
}

// ================= 생성 =================
export async function createCustomStyle(
  ownerId: string,
  input: CustomStyleInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const name = input.name.trim();
  const promptGuide = input.prompt_guide.trim();
  if (!name) return { ok: false, error: '이름을 입력해 주세요.' };
  if (!promptGuide) return { ok: false, error: '프롬프트 가이드를 입력해 주세요.' };

  // 상한(10) 검사: 초과 시 UI 가 먼저 막지만 서버 신뢰선에서도 방어한다.
  const existing = await listCustomStyles(ownerId);
  if (existing.length >= MAX_CUSTOM_STYLES) {
    return { ok: false, error: `커스텀 스타일은 최대 ${MAX_CUSTOM_STYLES}개까지 등록할 수 있습니다.` };
  }

  const iconEmoji = (input.icon_emoji ?? '').trim() || '🎨';
  // 새 항목은 목록 끝(현재 최대 sort_order + 1). 목록이 비어있으면 0.
  const nextSort = existing.length > 0 ? Math.max(...existing.map((s) => s.sort_order)) + 1 : 0;

  if (MOCK_MODE) {
    const row: CustomStyle = {
      id: `cs-${Date.now()}`,
      owner_id: ownerId,
      name, icon_emoji: iconEmoji, prompt_guide: promptGuide,
      sort_order: nextSort,
      created_at: nowIso(), updated_at: nowIso(),
    };
    mockRows().push(row);
    return { ok: true, id: row.id };
  }

  const { data, error } = await supabase
    .from('user_custom_styles')
    .insert({ owner_id: ownerId, name, icon_emoji: iconEmoji, prompt_guide: promptGuide, sort_order: nextSort })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? '스타일 생성 실패' };
  return { ok: true, id: data.id };
}

// ================= 수정 =================
export async function updateCustomStyle(
  id: string,
  patch: Partial<CustomStyleInput>,
): Promise<{ ok: boolean; error?: string }> {
  const update: Record<string, string> = {};
  if (patch.name !== undefined) {
    const v = patch.name.trim();
    if (!v) return { ok: false, error: '이름은 비워둘 수 없습니다.' };
    update.name = v;
  }
  if (patch.prompt_guide !== undefined) {
    const v = patch.prompt_guide.trim();
    if (!v) return { ok: false, error: '프롬프트 가이드는 비워둘 수 없습니다.' };
    update.prompt_guide = v;
  }
  if (patch.icon_emoji !== undefined) {
    update.icon_emoji = patch.icon_emoji.trim() || '🎨';
  }
  if (Object.keys(update).length === 0) return { ok: true };

  if (MOCK_MODE) {
    const row = mockRows().find((r) => r.id === id);
    if (!row) return { ok: false, error: '스타일을 찾을 수 없습니다.' };
    Object.assign(row, update, { updated_at: nowIso() });
    return { ok: true };
  }

  const { error } = await supabase.from('user_custom_styles').update(update).eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ================= 삭제 =================
export async function deleteCustomStyle(id: string): Promise<{ ok: boolean; error?: string }> {
  if (MOCK_MODE) {
    const i = mockRows().findIndex((r) => r.id === id);
    if (i >= 0) mockRows().splice(i, 1);
    return { ok: true };
  }
  const { error } = await supabase.from('user_custom_styles').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
