import React from 'react';
import { ImagePlus, Sparkles } from 'lucide-react';

// PRD v1.4 §9.4 단건 이미지 제작 — placeholder stub.
// 후속 스프린트에서 프롬프트 + 자산 레퍼런스(최대 3자산·5장) + 크레딧 차감·환불·결과 저장을 붙인다.

export const ImageStudio: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
        <ImagePlus size={30} />
      </div>
      <h1 className="text-3xl font-black tracking-tight text-zinc-900 mb-2">이미지 생성</h1>
      <p className="text-sm text-zinc-500 max-w-md leading-relaxed mb-6">
        한 줄 프롬프트로 단건 이미지를 만들고, 자산 보관함의 캐릭터·제품을 레퍼런스로 붙일 수 있는 화면입니다.
        <br />현재는 준비 중이며, 곧 오픈됩니다.
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-bold text-zinc-500">
        <Sparkles size={12} className="text-primary" /> Coming soon · PRD §9.4
      </div>
    </div>
  );
};
