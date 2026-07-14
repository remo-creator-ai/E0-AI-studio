import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useCreditStore } from './creditStore';
import { clearApiKeyCache } from '../services/geminiService';
import { MOCK_MODE, getMockRole, setMockRole, buildMockUser, buildMockSession, type MockRole } from '../lib/mockAuth';
import type { User, Session } from '@supabase/supabase-js';

let authSubscriptionRegistered = false;

// 발급계정 아이디 → 합성 이메일 도메인 (docs/AUTH_MODEL_TRANSITION.md §6 확정)
export const LOGIN_EMAIL_DOMAIN = 'sodam.local';

/** 발급계정 아이디를 로그인용 합성 이메일로 변환 */
export function loginIdToEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
}

/**
 * 구글 셀프가입 차단 (docs/AUTH_MODEL_TRANSITION.md §6.2)
 * 구글 OAuth 는 마스터 전용 — 마스터 이메일이 아닌 구글 로그인은 즉시 로그아웃.
 * 발급계정은 provider='email'(@sodam.local) 이므로 이 가드를 통과한다.
 * @returns 차단(로그아웃)했으면 true
 */
async function enforceGoogleMasterOnly(user: User | null): Promise<boolean> {
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  if (provider !== 'google') return false;

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL?.toLowerCase();
  const userEmail = user.email?.toLowerCase();
  if (adminEmail && userEmail && userEmail === adminEmail) return false;

  // 허용되지 않은 구글 계정 → 강제 로그아웃
  console.warn('허용되지 않은 구글 계정 로그인 차단:', userEmail);
  await supabase.auth.signOut();
  return true;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setAuthLoading: (loading: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signInWithId: (loginId: string, password: string) => Promise<{ error: string | null }>;
  signInAsMock: (role: MockRole) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthLoading: true,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setAuthLoading: (loading) => set({ isAuthLoading: loading }),

  signInWithGoogle: async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  },

  // 발급계정: 아이디 + 비밀번호 로그인
  signInWithId: async (loginId, password) => {
    const email = loginIdToEmail(loginId);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    }
    return { error: null };
  },

  // 디자인(가계정) 모드: 가짜 마스터/발급계정으로 즉시 입장
  signInAsMock: (role) => {
    setMockRole(role);
    const user = buildMockUser(role);
    set({ user, session: buildMockSession(user) });
    useCreditStore.getState().loadCredits(user.id);
  },

  signOut: async () => {
    if (MOCK_MODE) {
      setMockRole(null);
      clearApiKeyCache();
      useCreditStore.getState().reset();
      set({ user: null, session: null });
      return;
    }
    await supabase.auth.signOut();
    clearApiKeyCache();
    set({ user: null, session: null });
  },

  initialize: async () => {
    set({ isAuthLoading: true });
    try {
      // 디자인(가계정) 모드: Supabase 를 건너뛰고 저장된 가계정 세션을 복원
      if (MOCK_MODE) {
        const role = getMockRole();
        if (role) {
          const user = buildMockUser(role);
          set({ session: buildMockSession(user), user });
          await useCreditStore.getState().loadCredits(user.id);
        } else {
          set({ session: null, user: null });
        }
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (await enforceGoogleMasterOnly(session?.user ?? null)) {
        set({ session: null, user: null });
      } else {
        set({ session, user: session?.user ?? null });
        if (session?.user) {
          await useCreditStore.getState().loadCredits(session.user.id);
        }
      }

      if (!authSubscriptionRegistered) {
        authSubscriptionRegistered = true;
        supabase.auth.onAuthStateChange(async (_event, session) => {
          if (await enforceGoogleMasterOnly(session?.user ?? null)) {
            set({ session: null, user: null });
            useCreditStore.getState().reset();
            clearApiKeyCache();
            return;
          }
          set({ session, user: session?.user ?? null });
          if (session?.user) {
            useCreditStore.getState().loadCredits(session.user.id);
          } else {
            useCreditStore.getState().reset();
            clearApiKeyCache();
          }
        });
      }
    } finally {
      set({ isAuthLoading: false });
    }
  },
}));
