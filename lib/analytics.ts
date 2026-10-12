// =============================================================
//  Google Analytics 4 · 이벤트 트래킹 유틸
//
//  index.html 에서 gtag.js 가 로드되어 window.gtag 를 심어놓는다.
//  이 모듈은 그 window.gtag 를 감싸서:
//    - MOCK 세션에선 GA 호출 스킵 (테스트 데이터 오염 방지 · 콘솔에만 기록)
//    - 커스텀 이벤트 · 페이지뷰 헬퍼 제공
//    - 실패해도 앱 흐름은 절대 막지 않음 (try/catch 로 감쌈)
//
//  ⚠️ 트래킹 이벤트에 개인정보(이메일 · 이름 · 프롬프트 원문 등)를 절대 넣지 말 것.
//     구조화된 메타(모델·길이·비용 등)만 보낸다.
// =============================================================

import { MOCK_MODE } from './mockAuth';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const DEV = typeof window !== 'undefined' && window.location.hostname === 'localhost';

/** GA 호출 조건: MOCK/로컬 개발은 콘솔 로그만 · 프로덕션만 실제 전송. */
function shouldSend(): boolean {
  if (typeof window === 'undefined') return false;
  if (MOCK_MODE) return false;
  if (DEV) return false;
  return typeof window.gtag === 'function';
}

/** 커스텀 이벤트. properties 는 최상위 flat object (nested 는 GA 가 축약함). */
export function track(event: string, properties?: Record<string, string | number | boolean | null | undefined>): void {
  try {
    if (!shouldSend()) {
      // 개발 중 이벤트가 실제로 뽑히는지 확인용
      if (DEV) console.log('[analytics·mock]', event, properties);
      return;
    }
    window.gtag!('event', event, properties ?? {});
  } catch (e) {
    // 트래킹 실패로 앱 흐름 방해하지 않는다.
    console.warn('analytics track failed:', e);
  }
}

/** 페이지뷰 · currentStep 이 바뀔 때마다 App.tsx 가 호출.
 *  E0는 URL 이 안 바뀌는 store 기반 라우팅이라 자동 감지 안 됨 → 명시 호출. */
export function pageView(path: string, title?: string): void {
  try {
    if (!shouldSend()) {
      if (DEV) console.log('[analytics·mock] page_view', path, title);
      return;
    }
    window.gtag!('event', 'page_view', {
      page_path: path,
      page_title: title,
      page_location: `${window.location.origin}${path}`,
    });
  } catch (e) {
    console.warn('analytics pageView failed:', e);
  }
}

/** 로그인한 사용자를 GA user_id 로 연결 (익명 매칭에 씀 · 이메일 등 PII 금지). */
export function setUserId(userId: string | null): void {
  try {
    if (!shouldSend()) return;
    window.gtag!('config', import.meta.env.VITE_GA_MEASUREMENT_ID, { user_id: userId });
  } catch (e) {
    console.warn('analytics setUserId failed:', e);
  }
}
