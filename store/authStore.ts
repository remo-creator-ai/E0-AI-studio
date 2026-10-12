import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useCreditStore } from './creditStore';
import { clearApiKeyCache } from '../services/geminiService';
import { MOCK_MODE, getMockRole, setMockRole, buildMockUser, buildMockSession, type MockRole } from '../lib/mockAuth';
import type { User, Session } from '@supabase/supabase-js';

let authSubscriptionRegistered = false;

type IntroSurveyStatus = 'unknown' | 'pending' | 'done';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthLoading: boolean;
  introSurveyStatus: IntroSurveyStatus;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setIntroSurveyStatus: (s: IntroSurveyStatus) => void;
  signInWithGoogle: () => Promise<void>;
  signInAsMock: (role: MockRole) => void;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isAuthLoading: true,
  introSurveyStatus: 'unknown',
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setAuthLoading: (loading) => set({ isAuthLoading: loading }),
  setIntroSurveyStatus: (s) => set({ introSurveyStatus: s }),

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  },

  // 디자인(가계정) 모드: 가짜 마스터/일반 사용자로 즉시 입장
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

      set({ session, user: session?.user ?? null });
      if (session?.user) {
        await useCreditStore.getState().loadCredits(session.user.id);
      }

      if (!authSubscriptionRegistered) {
        authSubscriptionRegistered = true;
        supabase.auth.onAuthStateChange(async (_event, session) => {
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
