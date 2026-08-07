// =============================================================
//  AI 프록시 클라이언트 (보안)
//
//  AI 공급자 키는 브라우저로 내려오지 않는다. Edge Function(ai-proxy)이
//  서버 시크릿의 키를 주입해 Google 로 포워드한다.
//
//  @google/genai SDK 의 httpOptions.baseUrl 을 이 프록시로 지정하므로,
//  호출부의 프롬프트·모델·응답 파싱 코드는 전혀 바뀌지 않는다.
//  즉 여기서 바뀌는 것은 "전송 경로"뿐이고 생성 결과물의 동작은 동일하다.
//
//  이 모듈은 영상 경로(geminiService)와 단건 이미지 경로(imageStudioService)가
//  함께 쓴다. 공유하는 것은 전송 계층뿐이며 프롬프트 로직은 각자 유지한다.
// =============================================================

import { GoogleGenAI } from '@google/genai';
import { supabase } from './supabase';

export const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * 프록시를 경유하는 GoogleGenAI 클라이언트.
 * 세션이 없으면 null (프록시가 인증 없는 호출을 401 로 막는다).
 */
export async function proxyClient(): Promise<GoogleGenAI | null> {
  const token = await accessToken();
  if (!token) return null;
  return new GoogleGenAI({
    // 진짜 키는 서버에만 있다. SDK 가 헤더를 채우도록 자리표시자만 준다.
    apiKey: 'via-ai-proxy',
    httpOptions: {
      baseUrl: PROXY_BASE,
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

/**
 * Google 호스트 URL 을 프록시 경유로 바꿔서 가져온다.
 * SDK 를 타지 않는 직접 fetch(예: VEO 결과 영상 다운로드 링크)에 쓴다.
 * 원래 코드는 `${downloadLink}&key=${apiKey}` 처럼 URL 쿼리에 키를 붙였는데,
 * 그러면 키가 다시 브라우저로 내려와야 하므로 프록시가 대신 붙이게 한다.
 */
export async function proxyFetch(googleUrl: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new Error('로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.');

  const src = new URL(googleUrl);
  const target = `${PROXY_BASE}${src.pathname}${src.search}`;

  return fetch(target, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

/**
 * 공급자 키가 서버에 설정돼 있는지 여부만 확인한다.
 * 프록시의 /health 는 boolean 만 돌려주고 키 값은 반환하지 않는다.
 */
export async function proxyHealth(): Promise<{ gemini: boolean; kling: boolean; openai: boolean; googleTts: boolean } | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${PROXY_BASE}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return {
      gemini: Boolean(body?.gemini),
      kling: Boolean(body?.kling),
      openai: Boolean(body?.openai),
      googleTts: Boolean(body?.googleTts),
    };
  } catch {
    return null;
  }
}
