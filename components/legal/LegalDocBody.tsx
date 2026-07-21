import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ConsentDocType } from '../../lib/consentDocuments';

// 법적 문서 본문(스크롤 컨테이너 내부 콘텐츠만) 공용 렌더러.
// LandingPage 의 개인정보/약관 모달과 ConsentGate 의 원문 뷰어가 함께 사용해
// 문서 마크업 중복을 없앤다. 텍스트 원본은 i18n 단일 소스.
//
// privacy/terms 는 기존 landing.* 키를, ai_content 는 consent.aiContentDoc.* 를 읽는다.

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-zinc-900 font-bold text-base mt-4">{children}</h4>
);
const List: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="list-disc list-inside space-y-1 text-zinc-500">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);
const Stamp: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{children}</p>
);

const PrivacyBody: React.FC = () => {
  const { t } = useTranslation();
  const p = (k: string) => t(`landing.privacy.${k}`);
  return (
    <>
      <Stamp>{p('lastModified')}</Stamp>
      <H>{p('section1Title')}</H>
      <p>{p('section1Intro')}</p>
      <List items={[p('section1Item1'), p('section1Item2'), p('section1Item3'), p('section1Item4')]} />
      <H>{p('section2Title')}</H>
      <p>{p('section2Intro')}</p>
      <ul className="list-disc list-inside space-y-1 text-zinc-500">
        <li><strong className="text-zinc-600">{p('section2Required')}</strong> {p('section2RequiredItems')}</li>
        <li><strong className="text-zinc-600">{p('section2Auto')}</strong> {p('section2AutoItems')}</li>
        <li><strong className="text-zinc-600">{p('section2Usage')}</strong> {p('section2UsageItems')}</li>
      </ul>
      <H>{p('section3Title')}</H>
      <p>{p('section3Text')}</p>
      <List items={[p('section3Item1'), p('section3Item2'), p('section3Item3'), p('section3Item4')]} />
      <H>{p('section4Title')}</H>
      <p>{p('section4Text')}</p>
      <List items={[p('section4Item1'), p('section4Item2')]} />
      <H>{p('section5Title')}</H>
      <p>{p('section5Text')}</p>
      <List items={[p('section5Item1'), p('section5Item2'), p('section5Item3')]} />
      <H>{p('section6Title')}</H>
      <p>{p('section6Text')}</p>
      <H>{p('section7Title')}</H>
      <p>{p('section7Text')}</p>
      <List items={[p('section7Email')]} />
    </>
  );
};

const TermsBody: React.FC = () => {
  const { t } = useTranslation();
  const p = (k: string) => t(`landing.terms.${k}`);
  return (
    <>
      <Stamp>{p('lastModified')}</Stamp>
      <H>{p('article1Title')}</H>
      <p>{p('article1Text')}</p>
      <H>{p('article2Title')}</H>
      <List items={[p('article2Item1'), p('article2Item2'), p('article2Item3')]} />
      <H>{p('article3Title')}</H>
      <p>{p('article3Text')}</p>
      <H>{p('article4Title')}</H>
      <List items={[p('article4Item1'), p('article4Item2'), p('article4Item3')]} />
      <H>{p('article5Title')}</H>
      <p>{p('article5Text')}</p>
      <List items={[p('article5Item1'), p('article5Item2'), p('article5Item3'), p('article5Item4')]} />
      <H>{p('article6Title')}</H>
      <List items={[p('article6Item1'), p('article6Item2'), p('article6Item3'), p('article6Item4')]} />
      <H>{p('article7Title')}</H>
      <List items={[p('article7Item1'), p('article7Item2'), p('article7Item3')]} />
    </>
  );
};

const AiContentBody: React.FC = () => {
  const { t } = useTranslation();
  const p = (k: string) => t(`consent.aiContentDoc.${k}`);
  return (
    <>
      <Stamp>{p('lastModified')}</Stamp>
      <H>{p('section1Title')}</H>
      <p>{p('section1Text')}</p>
      <H>{p('section2Title')}</H>
      <p>{p('section2Text')}</p>
      <H>{p('section3Title')}</H>
      <p>{p('section3Text')}</p>
      <H>{p('section4Title')}</H>
      <p>{p('section4Text')}</p>
      <H>{p('section5Title')}</H>
      <p>{p('section5Text')}</p>
    </>
  );
};

/** 문서 제목 i18n 키 */
export function legalDocTitleKey(type: ConsentDocType): string {
  return type === 'ai_content' ? 'consent.aiContentDoc.title' : `landing.${type}.title`;
}

export const LegalDocBody: React.FC<{ type: ConsentDocType }> = ({ type }) => {
  switch (type) {
    case 'privacy': return <PrivacyBody />;
    case 'terms': return <TermsBody />;
    case 'ai_content': return <AiContentBody />;
  }
};
