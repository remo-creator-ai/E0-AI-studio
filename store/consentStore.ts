import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import { CONSENT_DOCUMENTS, currentConsentKeys } from '../lib/consentDocuments';
import { useCreditStore } from './creditStore';

// 약관 동의 게이트 상태 (PRD §9.1)
//
// needsConsent === true  → 현재 버전 3종 중 미동의가 있음 → App 이 ConsentGate 를 띄운다.
// needsConsent === false → 모두 동의 → 앱 진입 허용.
// needsConsent === null  → 아직 로드 전(로딩 스피너 유지).

// 목 모드 동의 저장 키 — 현재 버전 조합이 바뀌면 자동으로 재동의가 필요해진다.
// authStore(목 계정 전환 시 초기화)에서도 참조하므로 export.
export const MOCK_CONSENT_KEY = 'mock-consent';
function mockConsentSignature(): string {
  return [...currentConsentKeys()].sort().join('|');
}

interface ConsentState {
  needsConsent: boolean | null;
  isLoaded: boolean;
  isSubmitting: boolean;
  loadConsent: (userId: string) => Promise<void>;
  agree: (userId: string) => Promise<boolean>;
  reset: () => void;
}

export const useConsentStore = create<ConsentState>()((set) => ({
  needsConsent: null,
  isLoaded: false,
  isSubmitting: false,

  loadConsent: async (userId: string) => {
    // 디자인(가계정) 모드: localStorage 로 동의 여부만 재현
    if (MOCK_MODE) {
      const agreed = localStorage.getItem(MOCK_CONSENT_KEY) === mockConsentSignature();
      set({ needsConsent: !agreed, isLoaded: true });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('consent_history')
        .select('document_type, document_version')
        .eq('user_id', userId);

      if (error) {
        // 조회 실패 시 게이트를 열어 진행을 막지 않는다(로그인 자체는 유지).
        // 단, 동의 없이 통과시키지 않도록 needsConsent=true 로 둔다.
        console.error('Failed to load consent:', error.message);
        set({ needsConsent: true, isLoaded: true });
        return;
      }

      const have = new Set((data ?? []).map((r) => `${r.document_type}:${r.document_version}`));
      const required = currentConsentKeys();
      const allAgreed = [...required].every((k) => have.has(k));
      set({ needsConsent: !allAgreed, isLoaded: true });
    } catch (err) {
      console.error('Consent loading error:', err);
      set({ needsConsent: true, isLoaded: true });
    }
  },

  agree: async (userId: string) => {
    set({ isSubmitting: true });
    try {
      if (MOCK_MODE) {
        localStorage.setItem(MOCK_CONSENT_KEY, mockConsentSignature());
        set({ needsConsent: false, isSubmitting: false });
        return true;
      }

      // 현재 버전 3종을 기록. (user_id, document_type, document_version) UNIQUE +
      // ignoreDuplicates 로 재시도/중복을 흡수(AUTH-07 멱등).
      const rows = CONSENT_DOCUMENTS.map((d) => ({
        user_id: userId,
        document_type: d.type,
        document_version: d.version,
      }));
      const { error } = await supabase
        .from('consent_history')
        .upsert(rows, { onConflict: 'user_id,document_type,document_version', ignoreDuplicates: true });

      if (error) {
        console.error('Failed to record consent:', error.message);
        set({ isSubmitting: false });
        return false;
      }

      // 가입 완료(=최초 동의) 시 20크레딧 멱등 지급(AUTH-06). initialize_user_credits 는
      // ON CONFLICT DO NOTHING 이라 재동의/중복 호출에도 한 번만 지급된다.
      await useCreditStore.getState().loadCredits(userId);

      set({ needsConsent: false, isSubmitting: false });
      return true;
    } catch (err) {
      console.error('Consent submit error:', err);
      set({ isSubmitting: false });
      return false;
    }
  },

  reset: () => set({ needsConsent: null, isLoaded: false, isSubmitting: false }),
}));
