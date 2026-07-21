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
 * 현재 로그인 사용자가 마스터(role='master')인지 DB 에서 확인.
 * 권한 판별의 신뢰 소스. `is_master()` SECURITY DEFINER RPC 사용.
 * (구 isAdmin() 의 VITE_ADMIN_EMAIL 문자열 비교 방식은 DEV-004 로 폐기됨)
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
