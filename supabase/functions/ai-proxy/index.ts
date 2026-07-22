// Supabase Edge Function: ai-proxy
// AI 공급자 API 키를 서버에만 두고 호출을 대신 수행한다.
// Deploy: supabase functions deploy ai-proxy
//
// 배경 (docs 보안 이슈):
//   지금까지 브라우저가 admin_config 에서 gemini_api_key 를 직접 읽어 Google 을
//   호출했다. 그래서 (1) 키가 모든 로그인 사용자에게 노출되고 (2) admin_config
//   RLS 를 좁히면 일반 사용자 AI 기능이 전부 죽는 교착이 있었다.
//   이 함수가 (2)를 풀어 준다. 클라이언트는 키를 몰라도 되고, 그 다음에야
//   admin_config 를 is_master() 전용으로 잠글 수 있다.
//
// Secrets (supabase secrets set):
//   GEMINI_API_KEY            — Google AI Studio 키
//   KLING_ACCESS_KEY_ID       — (4단계에서 사용)
//   KLING_ACCESS_KEY_SECRET   — (4단계에서 사용)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 프로젝트에 기본 주입됨
//
// 라우팅:
//   /ai-proxy/v1beta/...  → generativelanguage.googleapis.com 그대로 포워드.
//     @google/genai SDK 의 httpOptions.baseUrl 을 이 함수로 지정하면 SDK 가
//     알아서 이 경로로 호출한다. 덕분에 클라이언트는 클라이언트 생성부만
//     바뀌고 프롬프트·모델·응답 파싱은 그대로다.
//
// 보안: 호출자 JWT 를 검증하고 profiles.status='active' 인 사용자만 통과시킨다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_HOST = 'https://generativelanguage.googleapis.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-api-key, x-goog-api-client',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

/**
 * Gemini 키 조달.
 *
 * 우선순위: admin_config(DB) → Function Secret.
 * DB 를 먼저 보는 이유는 마스터가 관리자 콘솔에서 키를 교체할 수 있게 하기
 * 위해서다. admin_config 는 RLS 로 마스터 전용이지만, 여기서는 service role 로
 * 읽으므로 RLS 를 우회한다. 즉 키는 서버 안에서만 오간다.
 * Function Secret 은 DB 가 비었을 때의 폴백.
 */
async function geminiKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await admin
    .from('admin_config')
    .select('value')
    .eq('key', 'gemini_api_key')
    .maybeSingle()
  const fromDb = (data?.value as string | undefined)?.trim()
  if (fromDb) return fromDb
  return Deno.env.get('GEMINI_API_KEY') ?? null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ---------- 1. 호출자 인증 ----------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) return json({ error: '유효하지 않은 세션입니다.' }, 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('status')
    .eq('id', caller.user.id)
    .single()
  if (!profile) return json({ error: '프로필을 찾을 수 없습니다.' }, 403)
  if (profile.status !== 'active') return json({ error: '비활성 계정입니다.' }, 403)

  // ---------- 2. 경로 파싱 ----------
  // 실제 요청 경로: /functions/v1/ai-proxy/<나머지>
  const url = new URL(req.url)
  const marker = '/ai-proxy'
  const idx = url.pathname.indexOf(marker)
  if (idx === -1) return json({ error: '잘못된 경로입니다.' }, 400)
  const rest = url.pathname.slice(idx + marker.length) // 예: /v1beta/models/x:generateContent

  // ---------- 2.5 상태 확인 ----------
  // 클라이언트가 "키가 설정돼 있는지"만 알고 싶을 때 쓴다. 키 값은 절대 돌려주지 않는다.
  if (rest === '/health') {
    return json({
      ok: true,
      gemini: Boolean(await geminiKey(admin)),
      kling: Boolean(Deno.env.get('KLING_ACCESS_KEY_ID') && Deno.env.get('KLING_ACCESS_KEY_SECRET')),
    })
  }

  // ---------- 3. Gemini 포워드 ----------
  if (rest.startsWith('/v1beta') || rest.startsWith('/v1')) {
    const apiKey = await geminiKey(admin)
    if (!apiKey) return json({ error: 'GEMINI_API_KEY 가 설정되지 않았습니다.' }, 503)

    const target = `${GEMINI_HOST}${rest}${url.search}`

    // 클라이언트가 보낸 x-goog-api-key 는 버리고 서버 키로 교체한다.
    // (클라이언트는 더 이상 진짜 키를 모른다)
    const headers = new Headers()
    headers.set('Content-Type', req.headers.get('Content-Type') ?? 'application/json')
    headers.set('x-goog-api-key', apiKey)
    const clientInfo = req.headers.get('x-goog-api-client')
    if (clientInfo) headers.set('x-goog-api-client', clientInfo)

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    })

    // 응답은 그대로 통과시킨다 (스트리밍 포함). CORS 헤더만 얹는다.
    const respHeaders = new Headers(corsHeaders)
    const ct = upstream.headers.get('Content-Type')
    if (ct) respHeaders.set('Content-Type', ct)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  }

  // ---------- 4. Kling (후속 단계) ----------
  if (rest.startsWith('/kling')) {
    return json({ error: 'Kling 프록시는 아직 준비 중입니다.' }, 501)
  }

  return json({ error: `지원하지 않는 경로입니다: ${rest}` }, 404)
})
