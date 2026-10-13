import React, { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Film, Image, Layers, PenTool, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from './BrandLogo';
import { LandingVideoExample } from './LandingVideoExample';
import { BRAND, CONTENT_STARTS } from '../lib/brand';
import { GOOGLE_AUTH_READY, MOCK_MODE } from '../lib/mockAuth';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

export const LandingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language.startsWith('en');
  const { setLanguage } = useSettingsStore();
  const { signInWithGoogle, signInAsMock } = useAuthStore();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const configured = GOOGLE_AUTH_READY && !MOCK_MODE;
  const start = () => { setError(''); dialog.current?.showModal(); };
  const login = async () => {
    setBusy(true); setError('');
    try { await signInWithGoogle(); }
    catch { setError(en ? 'Unable to sign in. Please try again.' : '로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const steps = [
    { icon: PenTool, title: en ? 'Plan your story' : '이야기를 기획하고', text: en ? 'Define the message and build a scene-by-scene script.' : '핵심 메시지에서 장면별 대본까지, 콘텐츠의 방향을 잡습니다.' },
    { icon: Image, title: en ? 'Create the visuals' : '이미지로 구체화하고', text: en ? 'Bring your product references and visual direction together.' : '제품 레퍼런스와 원하는 분위기로 장면을 구체화합니다.' },
    { icon: Layers, title: en ? 'Refine the storyboard' : '흐름을 다듬고', text: en ? 'Review every scene, reorder, and refine your storyboard.' : '장면의 순서와 내용을 검토하며 스토리보드를 완성합니다.' },
    { icon: Film, title: en ? 'Make it move' : '영상으로 완성하세요', text: en ? 'Generate clips and download your creative work.' : '장면을 영상으로 만들고 제작 결과물을 내려받습니다.' },
  ];
  return <div className="e0-landing">
    <a className="e0-skip" href="#main-content">{en ? 'Skip to content' : '본문으로 이동'}</a>
    <header className="e0-site-header"><a href="#" aria-label={BRAND.name}><BrandLogo /></a><nav aria-label={en ? 'Main navigation' : '주 메뉴'}><a href="#use-cases">{en ? 'Use cases' : '제작 용도'}</a><a href="#workflow">{en ? 'Workflow' : '제작 과정'}</a><button className="e0-language" onClick={() => setLanguage(en ? 'ko' : 'en')}>{en ? '한국어' : 'EN'}</button><button className="e0-button" onClick={start}>{en ? 'Get started' : '시작하기'}<ArrowUpRight size={16} /></button></nav></header>
    <main id="main-content">
      <section className="e0-hero">
        <div className="e0-hero-copy"><span className="e0-eyebrow"><span /> CONTENT, WITH PURPOSE</span><h1>{en ? <>Your brand idea.<br />A story worth<br /><em>bringing to life.</em></> : <>브랜드의 아이디어를,<br /><em>완성도 있는</em><br />영상으로.</>}</h1><p>{en ? 'From the first idea to images and video. Create the next chapter of your brand with E0 AI Studio.' : '기획부터 이미지와 영상 제작까지.\nE0 AI Studio에서 브랜드의 다음 이야기를 만드세요.'}</p><div className="e0-hero-actions"><button className="e0-button e0-button-large" onClick={start}>{en ? 'Create content' : '콘텐츠 만들기'}<ArrowRight size={18} /></button><a href="#workflow">{en ? 'Explore the workflow' : '제작 흐름 살펴보기'}<ArrowDown /></a></div><div className="e0-hero-note"><Check size={15}/>{en ? 'One connected workflow · Your assets, your direction' : '하나로 이어지는 제작 과정 · 브랜드 자산 재사용'}</div></div>
        <LandingVideoExample en={en} />
      </section>
      <div className="e0-context"><span>{en ? 'MADE FOR BRAND STORIES' : '브랜드가 필요한 모든 순간에'}</span><div><b>{en ? 'Product launches' : '제품 소개'}</b><i/><b>{en ? 'Store campaigns' : '매장 프로모션'}</b><i/><b>{en ? 'Brand stories' : '기업·브랜드 소개'}</b></div></div>
      <section id="use-cases" className="e0-section"><div className="e0-section-heading"><div><span className="e0-eyebrow">A GOOD PLACE TO START</span><h2>{en ? 'Start with your purpose.' : '목적이 정해지면,\n제작은 더 쉬워집니다.'}</h2></div><p>{en ? 'An editable starting point for the story you need.' : '무엇을 만들지 고민하는 시간은 줄이고,\n전달하고 싶은 메시지에 집중하세요.'}</p></div><div className="e0-purpose-grid">{CONTENT_STARTS.map((item,index)=><button key={item.id} onClick={start} className="e0-purpose-card"><span className="e0-purpose-number">0{index+1}<ArrowUpRight size={22}/></span><h3>{en ? item.en : item.title}</h3><p>{en ? item.descriptionEn : item.description}</p><span className="e0-purpose-line"/></button>)}</div></section>
      <section id="workflow" className="e0-section e0-workflow"><div className="e0-section-heading"><div><span className="e0-eyebrow">ONE CONNECTED WORKSPACE</span><h2>{en ? 'From a first idea to a final cut.' : '아이디어부터 결과물까지,\n끊김 없이 이어집니다.'}</h2></div><p>{en ? 'Keep control of every creative decision.' : '모든 단계를 직접 확인하고,\n원하는 방향으로 다듬어보세요.'}</p></div><div className="e0-step-grid">{steps.map((step,index)=><article key={step.title}><div className="e0-step-top"><step.icon size={24}/><span>0{index+1}</span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
      <section className="e0-closing"><div><span className="e0-eyebrow">YOUR NEXT STORY STARTS HERE</span><h2>{en ? 'Give your next idea a place to grow.' : '브랜드의 다음 이야기를\n지금 시작하세요.'}</h2></div><button className="e0-button e0-button-large" onClick={start}>{en ? 'Open the studio' : '스튜디오 시작하기'}<ArrowRight size={18}/></button></section>
    </main>
    <footer className="e0-footer"><BrandLogo/><div><a href={BRAND.website} target="_blank" rel="noreferrer">{BRAND.company}<ArrowUpRight size={14}/></a><small>© {new Date().getFullYear()} {BRAND.name}</small></div></footer>
    <dialog ref={dialog} className="e0-login-dialog" aria-labelledby="e0-login-title" onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div>
        <button className="e0-dialog-close" aria-label={en ? 'Close' : '닫기'} onClick={() => dialog.current?.close()}><X size={22}/></button>
        <BrandLogo/>
        <h2 id="e0-login-title">{en ? 'Log in or create an account' : '로그인하고 콘텐츠를 만들어보세요'}</h2>
        <p>{en ? 'Sign in to manage your assets and create brand content. New users can sign up with Google.' : '자산 보관부터 콘텐츠 제작까지, 로그인 후 이용할 수 있습니다. 처음 방문하셨다면 Google 계정으로 가입하세요.'}</p>
        <button className="e0-button" disabled={busy || !configured} onClick={login}>
          {busy ? (en ? 'Connecting…' : '연결 중…') : (en ? 'Log in / Sign up with Google' : 'Google로 로그인 / 회원가입')}
        </button>
        {!configured && <p role="status" className="e0-demo-explainer">{en ? 'Sign-in and registration are being prepared. They will be available once the service is connected.' : '로그인·회원가입 기능을 준비 중입니다. 서비스 연결이 완료되면 이용할 수 있습니다.'}</p>}
        {import.meta.env.DEV && MOCK_MODE && <div className="e0-demo-explainer">
          <p>{en ? 'Local development preview' : '로컬 개발용 미리보기'}</p>
          <button className="e0-text-button" onClick={() => signInAsMock('user')}>{en ? 'User preview' : '사용자 화면 미리보기'}</button>
          <button className="e0-text-button" onClick={() => signInAsMock('master')}>{en ? 'Admin preview' : '관리자 화면 미리보기'}</button>
        </div>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
      </div>
    </dialog>
  </div>;
};
function ArrowDown() { return <span aria-hidden="true">↓</span>; }
