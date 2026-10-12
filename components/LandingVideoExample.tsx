import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, Monitor, ArrowUpRight } from 'lucide-react';

/** A real-time motion concept driven by one pausable 15-second clock. */
export function LandingVideoExample({ en }: { en: boolean }) {
  const [time, setTime] = useState(0);
  const elapsed = useRef(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const scene = Math.floor(time / 5000) % 3;
  const progress = (time % 5000) / 5000;
  const phase = time / 15000 * Math.PI * 2;
  const seek = (index: number) => { elapsed.current = index * 5000; setTime(elapsed.current); };
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
    let frame: number;
    let previous = performance.now();
    let lastPaint = previous;
    const tick = (now: number) => {
      // Do not jump through scenes after returning from a background tab.
      elapsed.current = (elapsed.current + Math.min(now - previous, 100)) % 15000;
      previous = now;
      if (now - lastPaint >= 32) { setTime(elapsed.current); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  return <div className="e0-video-example">
    <div className="e0-example-heading"><span><Monitor size={15} />{en ? 'IN-STORE DISPLAY' : '매장 디스플레이 콘텐츠'}</span><span>16:9 · 15s</span></div>
    <div className={`e0-example-screen e0-example-scene-${scene}`} role="img" aria-label={`${en ? 'Storyboard concept' : '스토리보드 콘셉트'}: ${shots[scene].title} ${shots[scene].subtitle}`}>
      <div className="e0-example-art" aria-hidden="true">
        <div className="e0-motion-orb e0-motion-orb-main" style={{ transform: `translate(${Math.sin(phase) * 48}px, ${Math.cos(phase) * 32}px) rotate(${time / 15000 * 360}deg) scale(${1 + Math.sin(phase) * .12})`, borderRadius: `${38 + Math.sin(phase) * 12}%` }} />
        <div className="e0-motion-orb e0-motion-orb-back" style={{ transform: `translate(${Math.cos(phase) * 60}px, ${Math.sin(phase) * 44}px) scale(${1 + Math.cos(phase) * .15})` }} />
        <div className="e0-motion-orb e0-motion-orb-front" style={{ transform: `translate(${Math.sin(phase + 2) * 45}px, ${Math.cos(phase + 2) * 38}px) rotate(${-time / 15000 * 360}deg)` }} />
        <div className="e0-motion-light" style={{ transform: `translateX(${Math.sin(phase) * 35}%) rotate(-25deg)`, opacity: .3 + Math.cos(phase) * .15 }} />
        <div className="e0-motion-ring" style={{ transform: `translate(${Math.cos(phase) * 20}px, ${Math.sin(phase) * 25}px) scale(${1 + Math.sin(phase) * .1})` }} />
      </div>
      <div className="e0-example-screen-top"><span>SEASON COLLECTION</span><span>E0 / CONCEPT</span></div>
      <div className="e0-example-message" style={{ opacity: !playing ? 1 : Math.min(1, .15 + progress / .12, (1 - progress) / .12), transform: `translateY(${(1 - Math.min(1, progress / .2)) * 18 - Math.max(0, (progress - .85) / .15) * 10}px)` }}><small>NEW PERSPECTIVES / 0{scene + 1}</small><strong>{shots[scene].title}</strong><p>{shots[scene].subtitle}</p></div>
      <div className="e0-example-screen-bottom"><span>{en ? 'YOUR NEXT DISCOVERY' : '공간에서 시작되는 새로운 이야기'}</span><ArrowUpRight size={23} /></div>
    </div>
    <div className="e0-example-controls"><button type="button" onClick={() => setPlaying(!playing)} aria-label={playing ? (en ? 'Pause scene preview' : '장면 미리보기 정지') : (en ? 'Play scene preview' : '장면 미리보기 재생')}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><span>{en ? 'Motion preview' : '모션 미리보기'}</span><b>00:{String(Math.floor(time / 1000)).padStart(2, '0')} <span>/ 00:15</span></b></div>
    <div className="e0-example-shots" aria-label={en ? 'Choose a storyboard scene' : '스토리보드 장면 선택'}>{shots.map((shot, index) => <button type="button" key={shot.label} aria-pressed={scene === index} onClick={() => seek(index)}><span className="e0-example-shot-meta">0{index + 1}<span>{index * 5}–{(index + 1) * 5}s</span></span><strong>{shot.label}</strong><i><span style={{ transform: `scaleX(${index < scene ? 1 : index === scene ? progress : 0})` }} /></i></button>)}</div>
    <p className="e0-example-description">{shots[scene].detail}</p>
    <div className="e0-example-footnote">{en ? '15-second motion concept · Illustrative campaign, not an AI-generated video' : '15초 모션 콘셉트 · AI 생성 결과물이 아닌 가상 캠페인 예시입니다.'}</div>
  </div>;
}
