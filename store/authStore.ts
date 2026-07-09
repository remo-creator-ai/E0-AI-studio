import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useCreditStore } from './creditStore';
import { clearApiKeyCache } from '../services/geminiService';
import type { User, Session } from '@supabase/supabase-js';

let authSubscriptionRegistered = false;

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setAuthLoading: (loading: boolean) => void;
  signInWithGoogle: () => Promise<void>;
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

  signOut: async () => {
    await supabase.auth.signOut();
    clearApiKeyCache();
    set({ user: null, session: null });
  },

  initialize: async () => {
    set({ isAuthLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null });

      if (session?.user) {
        await useCreditStore.getState().loadCredits(session.user.id);
      }

      if (!authSubscriptionRegistered) {
        authSubscriptionRegistered = true;
        supabase.auth.onAuthStateChange((_event, session) => {
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
