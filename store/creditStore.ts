import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const CREDIT_COSTS = {
  SCRIPT: 1,
  IMAGE_PRO: 5,
  IMAGE_STANDARD: 2,
  VIDEO_STANDARD: 30,
  VIDEO_HD: 100,
  VIDEO_ULTRA: 250,
} as const;

export const MAX_FREE_PROJECTS = 100;

interface CreditState {
  balance: number;
  maxCredits: number;
  isLoaded: boolean;
  loadError: string | null;
  _userId: string | null;
  loadCredits: (userId: string) => Promise<void>;
  deduct: (amount: number, description: string) => Promise<boolean>;
  refund: (amount: number, description: string) => Promise<boolean>;
  hasEnough: (amount: number) => boolean;
  reset: () => void;
}

export const useCreditStore = create<CreditState>()((set, get) => ({
  balance: 0,
  maxCredits: 0,
  isLoaded: false,
  loadError: null,
  _userId: null,

  loadCredits: async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('initialize_user_credits', {
        p_user_id: userId,
      });

      if (error) {
        console.error('Failed to load credits:', error.message);
        set({ balance: 0, maxCredits: 0, isLoaded: true, _userId: userId, loadError: error.message });
        return;
      }

      if (data && data.length > 0) {
        set({
          balance: data[0].balance,
          maxCredits: data[0].max_credits,
          isLoaded: true,
          _userId: userId,
          loadError: null,
        });
      } else {
        set({ balance: 0, maxCredits: 0, isLoaded: true, _userId: userId, loadError: 'No credit data returned' });
      }
    } catch (err) {
      console.error('Credit loading error:', err);
      set({ balance: 0, maxCredits: 0, isLoaded: true, _userId: userId, loadError: String(err) });
    }
  },

  deduct: async (amount: number, description: string) => {
    const { balance, _userId } = get();
    if (balance < amount) return false;
    if (!_userId) return false;

    try {
      const { data, error } = await supabase.rpc('deduct_credits', {
        p_user_id: _userId,
        p_amount: amount,
        p_description: description,
      });

      if (error) {
        console.error('Failed to deduct credits:', error.message);
        return false;
      }

      const newBalance = data as number;
      if (newBalance < 0) {
        // -1 means insufficient funds on DB side
        return false;
      }

      set({ balance: newBalance });
      return true;
    } catch (err) {
      console.error('Credit deduction error:', err);
      return false;
    }
  },

  refund: async (amount: number, description: string) => {
    const { _userId } = get();
    if (!_userId) return false;

    try {
      const { data, error } = await supabase.rpc('refund_credits', {
        p_user_id: _userId,
        p_amount: amount,
        p_description: description,
      });

      if (error) {
        console.error('Failed to refund credits:', error.message);
        return false;
      }

      const newBalance = data as number;
      if (newBalance < 0) {
        return false;
      }

      set({ balance: newBalance });
      return true;
    } catch (err) {
      console.error('Credit refund error:', err);
      return false;
    }
  },

  hasEnough: (amount: number) => get().balance >= amount,

  reset: () => set({ balance: 0, maxCredits: 0, isLoaded: false, _userId: null, loadError: null }),
}));
