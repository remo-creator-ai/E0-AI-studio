// =============================================================
//  음성 생성 (TTS) — 사이드바 신규 도구 · stub 상태
//
//  현재 프로바이더 조사 중 (Task #9). 확정되면 ImageStudio · VideoStudio
//  대칭 3영역(설정 · 재생 · 히스토리)으로 채운다.
//
//  왜 stub 을 배포하나:
//   - 사이드바에서 클릭 시 라우팅이 존재해야 UX 흐름 파악 · 피드백 수집 가능
//   - 진짜 컴포넌트가 없을 때 <Suspense fallback> 만 뜨면 오해할 여지
//   - 지금은 명시적인 '준비 중' 안내로 대체
// =============================================================

import React from 'react';
import { Mic, Sparkles } from 'lucide-react';

export const VoiceStudio: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <div className="max-w-md w-full bg-white border border-zinc-200 rounded-3xl p-8 text-center space-y-6 shadow-[0_10px_30px_rgba(0,80,191,0.08)]">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <Mic className="text-primary" size={30} />
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-primary">Coming Soon</div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">음성 생성</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            스크립트를 자연스러운 나레이션 음성으로<br />변환해 드립니다.
          </p>
        </div>

        <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5 space-y-3 text-left">
          <div className="flex items-start gap-3">
            <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-black text-zinc-900">준비 중인 기능</div>
              <ul className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed space-y-1">
                <li>· 한국어 · 영어 스크립트 → mp3 자동 변환</li>
                <li>· 목소리 프리셋 · 속도 · 톤 선택</li>
                <li>· 30일 히스토리 · 자산 보관함 저장</li>
                <li>· 스토리보드 씬별 나레이션 자동 뽑기</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-zinc-400 leading-relaxed">
          현재 오픈소스 · 무료 TTS 프로바이더 비교 중입니다.<br />
          결정되는 대로 이 화면이 실기능으로 교체됩니다.
        </p>
      </div>
    </div>
  );
};

export default VoiceStudio;
