import { MOCK_MODE } from './mockAuth';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Use placeholder URL to prevent createClient from throwing on missing env vars
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.placeholder';

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || PLACEHOLDER_URL,
  supabaseAnonKey || PLACEHOLDER_KEY,
  {
    auth: { storageKey: 'e0-auth', persistSession: !MOCK_MODE, autoRefreshToken: !MOCK_MODE, detectSessionInUrl: !MOCK_MODE },
    ...(MOCK_MODE ? { global: { fetch: async () => new Response(JSON.stringify({ message: '미리보기 모드에서는 서버 작업을 사용할 수 없습니다.', code: 'PREVIEW_ONLY' }), { status: 503, headers: { 'Content-Type': 'application/json' } }) } } : {}),
  }
);
