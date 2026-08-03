import { supabase } from '../lib/supabase';
import { MOCK_MODE, getMockRole } from '../lib/mockAuth';

export type AdminConfigKey =
  | 'gemini_api_key'
  | 'kling_api_key'                // 신규 단일 키 방식 (트라이얼·간편) — Bearer 로 직접 전달
  | 'kling_access_key_id'          // Legacy JWT 방식 (엔터프라이즈) — 서버가 HS256 서명
  | 'kling_access_key_secret';     // Legacy JWT 방식 — HMAC 시크릿

// 값을 읽어오는 getAdminConfig() 는 제거했다.
// Gemini·Kling 호출이 모두 ai-proxy Edge Function 을 경유하므로 클라이언트가
// 키 값을 알 이유가 없다. 다시 만들지 말 것 — 만드는 순간 브라우저에 키가
// 내려오고, admin_config 의 마스터 전용 RLS(030)를 우회할 명분이 생긴다.
// 설정 여부만 필요하면 아래 getConfiguredKeys() 를 쓴다.

/**
 * Set an admin config value (only callable by admin)
 */
export async function setAdminConfig(key: AdminConfigKey, value: string): Promise<boolean> {
  const { error } = await supabase
    .from('admin_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    console.error(`Failed to set admin config '${key}':`, error.message);
    return false;
  }

  return true;
}

/**
 * 어떤 키가 설정돼 있는지만 조회한다 (관리자 콘솔용).
 *
 * 이전의 getAllAdminConfig() 는 값까지 가져와 입력창에 채웠는데, 그러면 마스터
 * 브라우저에 실제 API 키가 내려온다. 관리 화면은 "설정됨/미설정"만 알면 되므로
 * value 컬럼을 아예 요청하지 않는다. 키 교체는 새 값을 덮어쓰는 방식(쓰기 전용).
 */
export async function getConfiguredKeys(): Promise<Set<AdminConfigKey>> {
  const { data, error } = await supabase.from('admin_config').select('key');
  if (error || !data) {
    console.error('Failed to fetch admin config keys:', error?.message);
    return new Set();
  }
  return new Set(data.map((r) => r.key as AdminConfigKey));
}

/**
 * Check if admin email matches current user.
 * ⚠️ UI 노출 게이팅 전용 — 실제 권한은 DB RLS/`is_master()` 로 강제됩니다.
 * (docs/AUTH_MODEL_TRANSITION.md §4.4)
 */
export function isAdmin(userEmail: string | undefined): boolean {
  // 디자인(가계정) 모드: 가짜 마스터면 콘솔 노출
  if (MOCK_MODE) return getMockRole() === 'master';
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  if (!adminEmail || !userEmail) return false;
  return userEmail.toLowerCase() === adminEmail.toLowerCase();
}

/**
 * 현재 로그인 사용자가 마스터(role='master')인지 DB 에서 확인.
 * 권한 판별의 신뢰 소스. `is_master()` SECURITY DEFINER RPC 사용.
 */
export async function isMaster(): Promise<boolean> {
  if (MOCK_MODE) return getMockRole() === 'master';
  const { data, error } = await supabase.rpc('is_master');
  if (error) {
    console.warn('is_master RPC 실패:', error.message);
    return false;
  }
  return data === true;
}
