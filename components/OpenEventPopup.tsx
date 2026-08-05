import React, { useCallback, useEffect, useRef, useState } from 'react';
import popupImageUrl from '../docs/소담AI 스튜디오 팝업.png';

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSeu_Eyc0Gnw1GJAaOKowf8W6YrD3sBHITbmu90LpOfEcrwspA/viewform?usp=pp_url&entry.239677956=%ED%99%88%ED%8E%98%EC%9D%B4%EC%A7%80+%ED%8C%9D%EC%97%85%EC%98%A4%EC%A0%84';
const CAMPAIGN_END_AT = new Date('2026-08-10T23:59:59+09:00').getTime();
const HIDDEN_DATE_STORAGE_KEY = 'sodam-open-event-popup-hidden-date';
const MAX_TIMEOUT_MS = 2_147_483_647;

const koreanDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const getKoreanDateKey = (date: Date): string => {
  const parts = koreanDateFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const shouldOpenPopup = (): boolean => {
  const now = new Date();
  return now.getTime() <= CAMPAIGN_END_AT
    && localStorage.getItem(HIDDEN_DATE_STORAGE_KEY) !== getKoreanDateKey(now);
};

export const OpenEventPopup: React.FC = () => {
  const [open, setOpen] = useState(shouldOpenPopup);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const remainingMs = CAMPAIGN_END_AT - Date.now();
    const expiryTimer = window.setTimeout(close, Math.min(remainingMs + 1_000, MAX_TIMEOUT_MS));
    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.clearTimeout(expiryTimer);
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const hideToday = () => {
    localStorage.setItem(HIDDEN_DATE_STORAGE_KEY, getKoreanDateKey(new Date()));
    close();
  };

  if (!open) return null;

  return (
    <div
      data-open-event-popup
      role="dialog"
      aria-modal="true"
      aria-label="소담 AI 스튜디오 오픈 기념 지원 안내"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950/65 p-3 backdrop-blur-sm sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[94vh] max-w-[min(92vw,620px)] flex-col overflow-hidden rounded-[1.25rem] bg-white shadow-[0_28px_90px_rgba(0,0,0,0.45)] outline-none lp-modal-enter"
      >
        <a
          data-open-event-link
          href={FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="소담 AI 스튜디오 오픈 기념 지원 신청서 열기"
          className="block min-h-0 overflow-hidden bg-white focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <img
            data-open-event-image
            src={popupImageUrl}
            alt="소담 AI 스튜디오 오픈 기념, 30초 AI 쇼츠 제작 교육과 제작지원 및 5만원 상당 크레딧 제공 안내"
            width={984}
            height={1313}
            className="block max-h-[calc(94vh-64px)] w-auto max-w-full object-contain"
          />
        </a>

        <div className="grid h-14 shrink-0 grid-cols-2 divide-x divide-zinc-200 border-t border-zinc-200 bg-white text-sm font-bold">
          <button
            type="button"
            data-open-event-hide-today
            onClick={hideToday}
            className="text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            오늘 하루 보지 않기
          </button>
          <button
            type="button"
            data-open-event-close
            onClick={close}
            className="text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpenEventPopup;
