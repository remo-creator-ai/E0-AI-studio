import React, { useEffect, useState } from 'react';
import { Pause, Play, Monitor, ArrowUpRight } from 'lucide-react';

/** A storyboard preview, not an exported or AI-generated video. */
export function LandingVideoExample({ en }: { en: boolean }) {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(false);
  const shots = en ? [
    { label: 'Catch the eye', title: 'A new season.', subtitle: 'A fresh reason to stop by.', detail: 'Opening · Establish the mood' },
    { label: 'Tell the story', title: 'Discover your next.', subtitle: 'Meet the new collection in store.', detail: 'Message · Introduce the collection' },
    { label: 'Invite a visit', title: 'See you in store.', subtitle: 'Explore. Discover. Make it yours.', detail: 'Closing · Invite the next step' },
  ] : [
    { label: '시선 끌기', title: '새로운 계절,', subtitle: '일상에 새로운 장면을 더하다.', detail: '오프닝 · 공간의 분위기를 전하는 장면' },
    { label: '메시지 전달', title: '새로운 발견.', subtitle: '매장에서 만나는 이번 시즌 컬렉션.', detail: '메인 · 소개할 내용을 선명하게' },
    { label: '방문 유도', title: '지금, 만나보세요.', subtitle: '당신의 다음 취향이 기다리는 곳.', detail: '엔딩 · 방문으로 이어지는 한마디' },
  ];
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setScene(value => (value + 1) % 3), 5000);
    return () => window.clearInterval(timer);
  }, [playing]);
  return <div className="e0-video-example">
    <div className="e0-example-heading"><span><Monitor size={15} />{en ? 'IN-STORE DISPLAY' : '매장 디스플레이 콘텐츠'}</span><span>16:9 · 15s</span></div>
    <div className={`e0-example-screen e0-example-scene-${scene}`} role="img" aria-label={`${en ? 'Storyboard concept' : '스토리보드 콘셉트'}: ${shots[scene].title} ${shots[scene].subtitle}`}>
      <div className="e0-example-art" aria-hidden="true"><i /><i /><i /></div>
      <div className="e0-example-screen-top"><span>SEASON COLLECTION</span><span>E0 / CONCEPT</span></div>
      <div className="e0-example-message" key={scene}><small>NEW PERSPECTIVES / 0{scene + 1}</small><strong>{shots[scene].title}</strong><p>{shots[scene].subtitle}</p></div>
      <div className="e0-example-screen-bottom"><span>{en ? 'YOUR NEXT DISCOVERY' : '공간에서 시작되는 새로운 이야기'}</span><ArrowUpRight size={23} /></div>
    </div>
    <div className="e0-example-controls"><button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? (en ? 'Pause scene preview' : '장면 미리보기 정지') : (en ? 'Play scene preview' : '장면 미리보기 재생')}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><span>{en ? 'Scene preview' : '장면 미리보기'}</span><b>00:{String(scene * 5).padStart(2, '0')} <span>/ 00:15</span></b></div>
    <div className="e0-example-shots" aria-label={en ? 'Choose a storyboard scene' : '스토리보드 장면 선택'}>{shots.map((shot, index) => <button type="button" key={shot.label} aria-pressed={scene === index} onClick={() => { setScene(index); setPlaying(false); }}><span className="e0-example-shot-meta">0{index + 1}<span>{index * 5}–{(index + 1) * 5}s</span></span><strong>{shot.label}</strong><i /></button>)}</div>
    <p className="e0-example-description">{shots[scene].detail}</p>
    <div className="e0-example-footnote">{en ? 'Illustrative storyboard · Scene switching preview, not a finished video' : '가상 캠페인 스토리보드 · 완성 영상이 아닌 장면 전환 예시입니다.'}</div>
  </div>;
}
