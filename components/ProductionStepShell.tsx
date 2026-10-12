// =============================================================
//  4. 전체영상제작하기 — 모드 선택 랜딩 + 라우팅 (Phase 2)
//
//  기존 ProductionStep(대형 파일, 1300+ lines) 은 그대로 두고 상위에 Shell 을 신설.
//  Shell 이 mode state 를 소유하고 라우팅:
//    - landing: 2개 카드로 모드 선택
//    - modeA (통합 영상 배치): production/ProductionModeA
//    - modeB (개별 씬 영상): production/ProductionModeB — 세로 타임라인 (Phase 5)
//
//  기존 ProductionStep.tsx 는 라우팅에서 빠졌지만 폴백 참고용으로 파일은 남겨둔다.
//
//  우상단에 "전문가에게 의뢰하기" 강조 버튼 배치 (Phase 7 에서 실제 모달·DB·이메일 배선).
//  이 커밋은 자리만 잡고 클릭 시 임시 안내.
// =============================================================

import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Layers, ArrowLeft, Wand2, Info, Send } from 'lucide-react';
import { useStore } from '../store';
import { CommissionModal } from './CommissionModal';

const ProductionModeA = React.lazy(() =>
  import('./production/ProductionModeA').then((m) => ({ default: m.ProductionModeA })),
);
const ProductionModeB = React.lazy(() =>
  import('./production/ProductionModeB').then((m) => ({ default: m.ProductionModeB })),
);

type Mode = 'landing' | 'modeA' | 'modeB';

/** 오른쪽 상단 "전문가에게 의뢰하기" */
const CommissionButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="group relative px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF7A45] to-[#F5316B] text-white font-black text-sm shadow-[0_8px_24px_rgba(245,49,107,0.35)] hover:shadow-[0_10px_28px_rgba(245,49,107,0.5)] transition-all flex items-center gap-2"
  >
    <Send size={16} />
    <span>전문가에게 의뢰하기</span>
    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-ping" />
    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white" />
  </button>
);

/** 모드 카드 */
interface ModeCardProps {
  icon: React.FC<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
  features: string[];
  cost: string;
  primary?: boolean;
  onClick: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ icon: Icon, title, subtitle, features, cost, primary, onClick }) => (
  <button
    onClick={onClick}
    className={`group relative flex flex-col items-start p-8 rounded-3xl transition-all text-left ${
      primary
        ? 'bg-gradient-to-br from-primary to-[#248B78] text-white shadow-[0_12px_32px_rgba(0,117,104,0.35)] hover:shadow-[0_16px_40px_rgba(0,117,104,0.45)]'
        : 'bg-white border-2 border-zinc-200 hover:border-primary/40 hover:shadow-lg'
    }`}
  >
    <div className={`p-3 rounded-2xl mb-4 ${primary ? 'bg-white/20' : 'bg-primary/10'}`}>
      <Icon size={28} className={primary ? 'text-white' : 'text-primary'} />
    </div>
    <h3 className={`text-xl font-black mb-1 ${primary ? 'text-white' : 'text-zinc-900'}`}>{title}</h3>
    <p className={`text-sm mb-4 ${primary ? 'text-white/80' : 'text-zinc-500'}`}>{subtitle}</p>
    <ul className={`space-y-1.5 mb-6 text-xs ${primary ? 'text-white/90' : 'text-zinc-600'}`}>
      {features.map((f, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={primary ? 'text-white' : 'text-primary'}>✓</span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
    <div className={`text-xs font-bold ${primary ? 'text-white/90' : 'text-zinc-500'}`}>{cost}</div>
    <div className={`mt-6 w-full py-3 rounded-2xl font-black text-sm text-center transition-all ${
      primary
        ? 'bg-white text-primary group-hover:scale-[1.02]'
        : 'bg-zinc-100 text-zinc-700 group-hover:bg-primary group-hover:text-white'
    }`}>
      시작 →
    </div>
  </button>
);

const Landing: React.FC<{ onSelect: (m: Mode) => void }> = ({ onSelect }) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-xl font-bold text-zinc-700 mb-1">스토리보드를 어떻게 영상으로 만드시겠어요?</h2>
      <p className="text-sm text-zinc-500">두 가지 방식 중 프로젝트에 맞는 걸 골라주세요.</p>
    </div>
    <div data-tour="production-mode-select" className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <ModeCard
        icon={Wand2}
        title="스토리보드로 한번에 만들기"
        subtitle="스토리보드 이미지 1장으로 통합 영상 1편을 만듭니다."
        features={[
          '스토리보드가 자동 시작 프레임',
          '시퀀스 프롬프트 자동 생성',
          'Kling I2V 1회 호출 · 최대 10초',
          '개별 방식 대비 크레딧 대폭 절감',
        ]}
        cost="🔥 예상 25cr · 1~3분"
        primary
        onClick={() => onSelect('modeA')}
      />
      <ModeCard
        icon={Layers}
        title="개별 영상 하나하나 만들기"
        subtitle="각 씬을 세밀하게 조정하며 씬별 영상을 제작합니다."
        features={[
          'Kling 정밀 컨트롤',
          '시작/끝 프레임 지정',
          '씬별 재생성 · 프롬프트 편집',
          '완성 후 트랜지션 · 합치기',
        ]}
        cost="씬당 10cr~ · 자유 페이스"
        onClick={() => onSelect('modeB')}
      />
    </div>
    <div data-tour="production-recommend" className="mt-4 p-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-3">
      <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
      <div className="text-xs text-blue-900 leading-relaxed">
        <strong>추천:</strong> 처음 만드는 분·빠른 완성 원하면 <strong>왼쪽</strong>, 특정 씬 품질이 중요하면 <strong>오른쪽</strong>.
        하이브리드: 왼쪽으로 초안 → 마음에 안 드는 씬만 오른쪽에서 정밀 제작.
      </div>
    </div>
  </div>
);

export const ProductionStepShell: React.FC = () => {
  const { t } = useTranslation();
  const project = useStore((s) => s.project);
  const [mode, setMode] = useState<Mode>('landing');
  const [commissionOpen, setCommissionOpen] = useState(false);

  if (!project) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 mx-auto flex items-center justify-center mb-4">
            <Film size={28} className="text-zinc-400" />
          </div>
          <h2 className="text-xl font-black text-zinc-900 mb-2">프로젝트를 선택해주세요</h2>
          <p className="text-sm text-zinc-500">대시보드에서 프로젝트를 만들거나 열어 영상 제작을 시작하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {mode !== 'landing' && (
            <button
              onClick={() => setMode('landing')}
              className="p-2 rounded-xl hover:bg-zinc-100 text-zinc-500"
              aria-label="back"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-zinc-900">
              {mode === 'landing' && '4. 전체영상제작하기'}
              {mode === 'modeA' && '스토리보드 통합 영상'}
              {mode === 'modeB' && '개별 영상 정밀 제작'}
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">{project.title}</p>
          </div>
        </div>
        <CommissionButton onClick={() => setCommissionOpen(true)} />
      </div>

      <CommissionModal open={commissionOpen} onClose={() => setCommissionOpen(false)} />

      {/* Body */}
      {mode === 'landing' && <Landing onSelect={setMode} />}
      {mode === 'modeA' && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          }
        >
          <ProductionModeA onBack={() => setMode('landing')} />
        </Suspense>
      )}
      {mode === 'modeB' && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          }
        >
          <ProductionModeB onBack={() => setMode('landing')} />
        </Suspense>
      )}
    </div>
  );
};

export default ProductionStepShell;
