import { supabase } from '../lib/supabase';

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
 * Check if admin email matches current user
 */
export function isAdmin(userEmail: string | undefined): boolean {
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  if (!adminEmail || !userEmail) return false;
  return userEmail.toLowerCase() === adminEmail.toLowerCase();
}

/**
 * Clear cache (useful after updates)
 */
export function clearConfigCache(): void {
  configCache.clear();
}
