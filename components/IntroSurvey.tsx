import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

// PRD v1.4 §9.0 인트로 설문 (SURVEY-01~10)
// 대시보드 최초 진입 시 오버레이. 6문항 · 건너뛰기 가능 · 사용자당 1회 저장.

type Q1 = 'creator' | 'smb' | 'marketer' | 'freelancer' | 'other';
type Q2 = 'product_promo' | 'brand_story' | 'education' | 'sns_shorts' | 'other';
type Q3 = 'food' | 'fashion' | 'retail' | 'service' | 'education' | 'it' | 'other';
type Q4 = 'lt_5' | '5_to_20' | '20_to_50' | 'gte_50';
type Q5 = 'first' | 'few' | 'often';
type Q6 = 'website' | 'referral' | 'search' | 'sns' | 'other';

interface Props {
  userId: string;
  onClose: () => void;
}

const SURVEY_VERSION = 'v1';

const OPT = <T extends string>(value: T, label: string) => ({ value, label });

const Q1_OPTIONS = [
  OPT<Q1>('creator', '크리에이터'),
  OPT<Q1>('smb', '소상공인'),
  OPT<Q1>('marketer', '마케팅 담당자'),
  OPT<Q1>('freelancer', '프리랜서'),
  OPT<Q1>('other', '기타'),
];

const Q2_OPTIONS = [
  OPT<Q2>('product_promo', '제품 홍보'),
  OPT<Q2>('brand_story', '브랜드 스토리'),
  OPT<Q2>('education', '교육·강의'),
  OPT<Q2>('sns_shorts', 'SNS 릴스·숏폼'),
  OPT<Q2>('other', '기타'),
];

const Q3_OPTIONS = [
  OPT<Q3>('food', '요식업'),
  OPT<Q3>('fashion', '패션·뷰티'),
  OPT<Q3>('retail', '리테일'),
  OPT<Q3>('service', '서비스업'),
  OPT<Q3>('education', '교육'),
  OPT<Q3>('it', 'IT·스타트업'),
  OPT<Q3>('other', '기타'),
];

const Q4_OPTIONS = [
  OPT<Q4>('lt_5', '5개 미만'),
  OPT<Q4>('5_to_20', '5~20개'),
  OPT<Q4>('20_to_50', '20~50개'),
  OPT<Q4>('gte_50', '50개 이상'),
];

const Q5_OPTIONS = [
  OPT<Q5>('first', '처음'),
  OPT<Q5>('few', '몇 번 써봤음'),
  OPT<Q5>('often', '자주 사용함'),
];

const Q6_OPTIONS = [
  OPT<Q6>('website', '홈페이지'),
  OPT<Q6>('referral', '지인 소개'),
  OPT<Q6>('search', '검색'),
  OPT<Q6>('sns', 'SNS'),
  OPT<Q6>('other', '기타'),
];

export const IntroSurvey: React.FC<Props> = ({ userId, onClose }) => {
  const [q1, setQ1] = useState<Q1 | ''>('');
  const [q2, setQ2] = useState<Q2 | ''>('');
  const [q3, setQ3] = useState<Q3 | ''>('');
  const [q4, setQ4] = useState<Q4 | ''>('');
  const [q5, setQ5] = useState<Q5 | ''>('');
  const [q6, setQ6] = useState<Q6 | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    const { error } = await supabase.from('intro_survey_responses').insert({
      user_id: userId,
      status: 'completed',
      survey_version: SURVEY_VERSION,
      q1_role: q1 || null,
      q2_content_type: q2 || null,
      q3_industry: q3 || null,
      q4_expected_volume: q4 || null,
      q5_ai_experience: q5 || null,
      q6_referral: q6 || null,
    });
    setSubmitting(false);
    if (error && error.code !== '23505') {
      // 중복(UNIQUE)이면 이미 저장된 것으로 간주하고 그냥 닫음
      console.error('[IntroSurvey] submit failed', error);
    }
    onClose();
  };

  const skip = async () => {
    setSubmitting(true);
    await supabase.from('intro_survey_responses').insert({
      user_id: userId,
      status: 'skipped',
      survey_version: SURVEY_VERSION,
    });
    setSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      aria-modal="true"
      role="dialog"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Intro Survey</p>
            <h2 className="text-lg font-black text-zinc-900 mt-1">환영합니다 👋 6가지만 알려주세요</h2>
            <p className="text-xs text-zinc-500 mt-1">응답은 서비스 개선에만 활용됩니다. 언제든 건너뛰실 수 있어요.</p>
          </div>
          <button
            onClick={skip}
            disabled={submitting}
            title="건너뛰기"
            className="shrink-0 w-9 h-9 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          <Question label="1. 어떤 신분으로 이용하시나요?" required>
            <Choices options={Q1_OPTIONS} value={q1} onChange={setQ1} />
          </Question>
          <Question label="2. 주로 어떤 콘텐츠를 만드실 예정인가요?" required>
            <Choices options={Q2_OPTIONS} value={q2} onChange={setQ2} />
          </Question>
          <Question label="3. 업종/카테고리">
            <Choices options={Q3_OPTIONS} value={q3} onChange={setQ3} />
          </Question>
          <Question label="4. 월 예상 제작량" required>
            <Choices options={Q4_OPTIONS} value={q4} onChange={setQ4} />
          </Question>
          <Question label="5. AI 도구 사용 경험">
            <Choices options={Q5_OPTIONS} value={q5} onChange={setQ5} />
          </Question>
          <Question label="6. 유입 경로">
            <Choices options={Q6_OPTIONS} value={q6} onChange={setQ6} />
          </Question>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between gap-3 bg-zinc-50/50">
          <button
            onClick={skip}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors disabled:opacity-50"
          >
            건너뛰기
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl text-sm font-black text-white bg-primary hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
          >
            {submitting ? '저장 중…' : '제출'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Question: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({
  label,
  required,
  children,
}) => (
  <div>
    <p className="text-xs font-black text-zinc-800 mb-2">
      {label} {required && <span className="text-primary">*</span>}
    </p>
    {children}
  </div>
);

interface ChoicesProps<T extends string> {
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (v: T) => void;
}

function Choices<T extends string>({ options, value, onChange }: ChoicesProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ' +
              (active
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50')
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
