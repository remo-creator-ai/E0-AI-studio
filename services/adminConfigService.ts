import { supabase } from '../lib/supabase';
import { MOCK_MODE, getMockRole } from '../lib/mockAuth';

// Cache for admin config values (avoids repeated DB queries)
const configCache: Map<string, { value: string; fetchedAt: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export type AdminConfigKey = 'gemini_api_key' | 'kling_access_key_id' | 'kling_access_key_secret';

/**
 * Get an admin config value (API key) from Supabase with caching
 */
export async function getAdminConfig(key: AdminConfigKey): Promise<string | null> {
  // Check cache first
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.value;
  }

  const { data, error } = await supabase
    .from('admin_config')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) {
    console.warn(`Admin config '${key}' not found:`, error?.message);
    return null;
  }

  configCache.set(key, { value: data.value, fetchedAt: Date.now() });
  return data.value;
}

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

  // Update cache
  configCache.set(key, { value, fetchedAt: Date.now() });
  return true;
}

/**
 * Get all admin config entries (for admin page)
 */
export async function getAllAdminConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('admin_config')
    .select('key, value');

  if (error || !data) {
    console.error('Failed to fetch admin config:', error?.message);
    return {};
  }

  const result: Record<string, string> = {};
  for (const row of data) {
    result[row.key] = row.value;
    configCache.set(row.key, { value: row.value, fetchedAt: Date.now() });
  }
  return result;
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

/**
 * Clear cache (useful after updates)
 */
export function clearConfigCache(): void {
  configCache.clear();
}
