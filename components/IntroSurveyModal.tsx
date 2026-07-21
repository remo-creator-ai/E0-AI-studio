import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSurveyStore } from '../store/surveyStore';
import { SURVEY_QUESTIONS, type SurveyAnswers, type SurveyFieldId } from '../lib/surveyQuestions';

// PRD §9.0 인트로 설문 모달.
// 대시보드 첫 진입에서 노출. 앱 접근을 차단하지 않으며(SURVEY-10) 제출·건너뛰기 모두
// 1회만 기록되어 재노출되지 않는다. 최소 1개 응답 시 제출 활성(SURVEY-02),
// 건너뛰기는 항상 가능(SURVEY-03).

export const IntroSurveyModal: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { submit, skip, isSubmitting } = useSurveyStore();
  const [answers, setAnswers] = useState<SurveyAnswers>({});

  const answeredCount = Object.values(answers).filter(Boolean).length;

  const choose = (id: SurveyFieldId, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: prev[id] === value ? undefined : value }));
  };

  const onSubmit = () => {
    if (!user || answeredCount === 0 || isSubmitting) return;
    submit(user.id, answers);
  };
  const onSkip = () => {
    if (!user || isSubmitting) return;
    skip(user.id);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-md">
      <div className="relative bg-white border border-zinc-200 rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-7 pb-4 shrink-0 relative">
          <button
            onClick={onSkip}
            aria-label={t('survey.skip')}
            className="absolute top-6 right-6 p-2 hover:bg-zinc-100 rounded-xl transition-all"
          >
            <X size={18} className="text-zinc-400" />
          </button>
          <h2 className="text-xl font-black tracking-tight text-zinc-900">{t('survey.title')}</h2>
          <p className="text-sm text-zinc-500 leading-relaxed mt-2 pr-8">{t('survey.subtitle')}</p>
        </div>

        {/* Questions */}
        <div className="px-7 space-y-5 overflow-y-auto custom-scrollbar">
          {SURVEY_QUESTIONS.map((q) => (
            <div key={q.id}>
              <p className="text-sm font-bold text-zinc-800 mb-2.5">{t(`survey.${q.id}.label`)}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => choose(q.id, opt)}
                      className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-all active:scale-95 ${
                        selected
                          ? 'bg-primary border-primary text-white shadow-[0_4px_12px_rgba(0,80,191,0.2)]'
                          : 'bg-white border-zinc-200 text-zinc-600 hover:border-primary/40'
                      }`}
                    >
                      {t(`survey.${q.id}.${opt}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-7 pt-5 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onSkip}
            disabled={isSubmitting}
            className="flex-1 py-3.5 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full font-bold text-sm text-zinc-600 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {t('survey.skip')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={answeredCount === 0 || isSubmitting}
            className="flex-1 py-3.5 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 rounded-full font-black text-sm text-white transition-all active:scale-[0.98] shadow-[0_8px_20px_rgba(0,80,191,0.25)] disabled:shadow-none"
          >
            {isSubmitting ? t('survey.submitting') : t('survey.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};
