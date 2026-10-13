import type { User, Session } from '@supabase/supabase-js';

// Mock accounts are available only in the local development server.
// A production build must never restore a preview role, even with an old env flag.
const env = import.meta.env;
export const AUTH_CONFIGURED = !!env.VITE_SUPABASE_URL && !!env.VITE_SUPABASE_ANON_KEY;
export const MOCK_MODE: boolean = !!env.DEV && env.VITE_MOCK_AUTH !== 'false'
  && (env.VITE_MOCK_AUTH === 'true' || !AUTH_CONFIGURED);

export type MockRole = 'master' | 'user';

const ROLE_KEY = 'e0-mock-auth-role';

/** 새로고침 후에도 가계정 세션이 유지되도록 role 을 localStorage 에 보관 */
export function getMockRole(): MockRole | null {
  const v = localStorage.getItem(ROLE_KEY);
  return v === 'master' || v === 'user' ? v : null;
}

export function setMockRole(role: MockRole | null): void {
  if (role) localStorage.setItem(ROLE_KEY, role);
  else localStorage.removeItem(ROLE_KEY);
}

const MOCK_CREATED_AT = '2026-01-01T00:00:00.000Z';

export function buildMockUser(role: MockRole): User {
  const isMaster = role === 'master';
  return {
    id: isMaster
      ? 'mock-master-0000-0000-0000-000000000000'
      : 'mock-user-0000-0000-0000-000000000000',
    aud: 'authenticated',
    role: 'authenticated',
    email: isMaster ? 'master@e0.local' : 'demo.user@gmail.com',
    app_metadata: { provider: 'mock' },
    user_metadata: {
      full_name: isMaster ? 'E0 관리자 (가계정)' : '데모 사용자 (가계정)',
      name: isMaster ? 'E0 관리자 (가계정)' : '데모 사용자 (가계정)',
      role,
    },
    created_at: MOCK_CREATED_AT,
  } as unknown as User;
}

export function buildMockSession(user: User): Session {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 9999999999,
    user,
  } as unknown as Session;
}

/** 가계정 크레딧 (디자인 확인용 표시값) — 신규 가입 시 100 크레딧 부여 기준 (038) */
export const MOCK_CREDITS: Record<MockRole, { balance: number; maxCredits: number }> = {
  master: { balance: 78, maxCredits: 100 },
  user: { balance: 24, maxCredits: 100 },
};
