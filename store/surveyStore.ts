import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import { SURVEY_VERSION, type SurveyAnswers } from '../lib/surveyQuestions';

// 인트로 설문 상태 (PRD §9.0)
//
// needsSurvey === true  → 대시보드 첫 진입에서 설문 모달을 띄운다.
// needsSurvey === false → 이미 제출/건너뛰기(로우 존재) → 다시 띄우지 않는다.
// needsSurvey === null  → 로드 전.
//
// 약관 게이트와 달리 앱 접근을 차단하지 않는다(SURVEY-10). 제출·건너뛰기 모두
// user_id UNIQUE 로 1회만 기록되어 재노출되지 않는다(SURVEY-04/05).

const MOCK_SURVEY_KEY = 'mock-survey';

interface SurveyState {
  needsSurvey: boolean | null;
  isLoaded: boolean;
  isSubmitting: boolean;
  loadSurvey: (userId: string) => Promise<void>;
  submit: (userId: string, answers: SurveyAnswers) => Promise<boolean>;
  skip: (userId: string) => Promise<boolean>;
  reset: () => void;
}

async function record(
  set: (partial: Partial<SurveyState>) => void,
  userId: string,
  status: 'completed' | 'skipped',
  answers: SurveyAnswers,
): Promise<boolean> {
  set({ isSubmitting: true });
  try {
    if (MOCK_MODE) {
      localStorage.setItem(MOCK_SURVEY_KEY, status);
      set({ needsSurvey: false, isSubmitting: false });
      return true;
    }
    // 사용자당 1건(user_id UNIQUE). 재시도/중복은 ignoreDuplicates 로 흡수.
    const { error } = await supabase
      .from('intro_survey_responses')
      .upsert(
        { user_id: userId, status, survey_version: SURVEY_VERSION, ...answers },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
    if (error) {
      console.error('Failed to record survey:', error.message);
      set({ isSubmitting: false });
      return false;
    }
    set({ needsSurvey: false, isSubmitting: false });
    return true;
  } catch (err) {
    console.error('Survey submit error:', err);
    set({ isSubmitting: false });
    return false;
  }
}

export const useSurveyStore = create<SurveyState>()((set) => ({
  needsSurvey: null,
  isLoaded: false,
  isSubmitting: false,

  loadSurvey: async (userId: string) => {
    if (MOCK_MODE) {
      const done = localStorage.getItem(MOCK_SURVEY_KEY) !== null;
      set({ needsSurvey: !done, isLoaded: true });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('intro_survey_responses')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        // 조회 실패 시 설문을 강제로 띄우지 않는다(앱 사용을 막지 않는 부가 기능).
        console.error('Failed to load survey:', error.message);
        set({ needsSurvey: false, isLoaded: true });
        return;
      }
      set({ needsSurvey: data === null, isLoaded: true });
    } catch (err) {
      console.error('Survey loading error:', err);
      set({ needsSurvey: false, isLoaded: true });
    }
  },

  submit: (userId, answers) => record(set, userId, 'completed', answers),
  skip: (userId) => record(set, userId, 'skipped', {}),

  reset: () => set({ needsSurvey: null, isLoaded: false, isSubmitting: false }),
}));

export { MOCK_SURVEY_KEY };
