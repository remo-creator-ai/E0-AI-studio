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
//   KLING_API_KEY             — 신규 단일 키 방식 (트라이얼/간편, Bearer 직전달) — 우선순위 1
//   KLING_ACCESS_KEY_ID       — Legacy JWT 방식 (엔터프라이즈) — 폴백
//   KLING_ACCESS_KEY_SECRET   — Legacy JWT 방식 — 폴백
//   OPENAI_API_KEY            — GPT Image 2 (이미지 생성)
//   GOOGLE_TTS_API_KEY        — Google Cloud Text-to-Speech (음성 생성)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 프로젝트에 기본 주입됨
//
// 라우팅:
//   /ai-proxy/v1beta/...  → generativelanguage.googleapis.com 그대로 포워드.
//     @google/genai SDK 의 httpOptions.baseUrl 을 이 함수로 지정하면 SDK 가
//     알아서 이 경로로 호출한다. 덕분에 클라이언트는 클라이언트 생성부만
//     바뀌고 프롬프트·모델·응답 파싱은 그대로다.
//   /ai-proxy/kling/...   → api.klingai.com
//   /ai-proxy/openai/...  → api.openai.com (GPT Image 2)
//     주의: '/openai' 분기는 Gemini 분기보다 먼저 평가해야 한다. Gemini 쪽이
//     '/v1' 접두사를 통째로 받으므로 순서가 뒤바뀌면 Google 로 잘못 나간다.
//
// 보안: 호출자 JWT 를 검증하고 profiles.status='active' 인 사용자만 통과시킨다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_HOST = 'https://generativelanguage.googleapis.com'
const KLING_HOST = 'https://api.klingai.com'
const OPENAI_HOST = 'https://api.openai.com'
const GOOGLE_TTS_HOST = 'https://texttospeech.googleapis.com'

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
  return config(admin, 'gemini_api_key', 'GEMINI_API_KEY')
}

/** OpenAI 키 조달 (GPT Image 2). 조달 규칙은 Gemini 와 동일. */
async function openaiKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  return config(admin, 'openai_api_key', 'OPENAI_API_KEY')
}

/** Google Cloud TTS 키 조달. Gemini 와 다른 키 (aistudio 계정과 gcp 계정이 다르기 때문). */
async function googleTtsKey(admin: ReturnType<typeof createClient>): Promise<string | null> {
  return config(admin, 'google_tts_api_key', 'GOOGLE_TTS_API_KEY')
}

/**
 * Kling 인증 자격증명.
 *   kind='single'  : 신규 단일 API Key (Bearer 로 직접 전달)
 *   kind='legacy'  : AK+SK 조합 (서버가 JWT 서명)
 * 우선순위: single → legacy → null
 * 사용자가 어느 쪽을 세팅했든 자동 감지된다.
 */
type KlingCreds =
  | { kind: 'single'; token: string }
  | { kind: 'legacy'; id: string; secret: string }

async function klingKeys(admin: ReturnType<typeof createClient>): Promise<KlingCreds | null> {
  const single = await config(admin, 'kling_api_key', 'KLING_API_KEY')
  if (single) return { kind: 'single', token: single }

  const id = await config(admin, 'kling_access_key_id', 'KLING_ACCESS_KEY_ID')
  const secret = await config(admin, 'kling_access_key_secret', 'KLING_ACCESS_KEY_SECRET')
  if (id && secret) return { kind: 'legacy', id, secret }
  return null
}

/** admin_config(DB) → Function Secret 순으로 설정값을 읽는다. */
async function config(
  admin: ReturnType<typeof createClient>,
  dbKey: string,
  secretName: string,
): Promise<string | null> {
  const { data } = await admin
    .from('admin_config')
    .select('value')
    .eq('key', dbKey)
    .maybeSingle()
  const fromDb = (data?.value as string | undefined)?.trim()
  if (fromDb) return fromDb
  return Deno.env.get(secretName) ?? null
}

/**
 * Kling 은 accessKeySecret 으로 HS256 JWT 를 서명해 인증한다.
 * 예전에는 이 서명을 브라우저에서 했다(= secret 이 브라우저에 있어야 함).
 * 서명을 여기로 옮겨서 secret 이 서버 밖으로 나가지 않게 한다.
 */
async function klingJwt(accessKeyId: string, accessKeySecret: string): Promise<string> {
  const b64url = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: accessKeyId, exp: now + 1800, nbf: now - 5 }))
  const data = `${header}.${payload}`

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(accessKeySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return `${data}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`
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
      kling: Boolean(await klingKeys(admin)),
      openai: Boolean(await openaiKey(admin)),
      googleTts: Boolean(await googleTtsKey(admin)),
    })
  }

  // ---------- 2.6 OpenAI 포워드 (GPT Image 2) ----------
  // /ai-proxy/openai/v1/images/generations → https://api.openai.com/v1/images/generations
  //
  // ⚠️ Gemini/Kling 분기보다 먼저 와야 한다. 아래 Gemini 분기가 '/v1' 로 시작하는
  //    경로를 전부 가로채므로, '/openai/v1/...' 도 그쪽으로 빨려들어간다.
  //
  // ⚠️ 본문을 req.text() 로 읽지 않는다. 참조 이미지를 쓰는 /v1/images/edits 는
  //    multipart/form-data 라서 텍스트로 디코딩하면 바이너리가 깨진다.
  //    req.body 를 그대로 흘려보내고 Content-Type(boundary 포함)만 전달한다.
  if (rest.startsWith('/openai')) {
    const apiKey = await openaiKey(admin)
    if (!apiKey) return json({ error: 'OPENAI_API_KEY 가 설정되지 않았습니다.' }, 503)

    const target = `${OPENAI_HOST}${rest.slice('/openai'.length)}${url.search}`

    const headers = new Headers()
    const ct = req.headers.get('Content-Type')
    if (ct) headers.set('Content-Type', ct)
    headers.set('Authorization', `Bearer ${apiKey}`)

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // 스트림 본문을 그대로 전달할 때 Deno/undici 가 요구한다.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit)

    const respHeaders = new Headers(corsHeaders)
    const upstreamCt = upstream.headers.get('Content-Type')
    if (upstreamCt) respHeaders.set('Content-Type', upstreamCt)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  }

  // ---------- 2.7 Google Cloud TTS 포워드 (음성 생성) ----------
  // /ai-proxy/google/tts/v1/text:synthesize → https://texttospeech.googleapis.com/v1/text:synthesize
  //
  // ⚠️ Gemini 분기(rest.startsWith('/v1')) 보다 먼저 와야 한다.
  // Google TTS 는 URL query 로 ?key=<KEY> 를 붙이는 방식으로 인증한다
  // (Bearer 아님). 클라이언트가 보낸 query 는 무시하고 서버에서만 붙인다.
  if (rest.startsWith('/google/tts')) {
    const apiKey = await googleTtsKey(admin)
    if (!apiKey) return json({ error: 'GOOGLE_TTS_API_KEY 가 설정되지 않았습니다.' }, 503)

    const pathAfter = rest.slice('/google/tts'.length)  // 예: /v1/text:synthesize
    const target = `${GOOGLE_TTS_HOST}${pathAfter}?key=${encodeURIComponent(apiKey)}`

    const headers = new Headers()
    const ct = req.headers.get('Content-Type')
    if (ct) headers.set('Content-Type', ct)

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
    })

    const respHeaders = new Headers(corsHeaders)
    const upstreamCt = upstream.headers.get('Content-Type')
    if (upstreamCt) respHeaders.set('Content-Type', upstreamCt)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
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

  // ---------- 4. Kling 포워드 ----------
  // /ai-proxy/kling/v1/videos/... → https://api.klingai.com/v1/videos/...
  // 예전에는 브라우저가 secret 으로 직접 JWT 를 서명했다. 이제 여기서 서명한다.
  // (덤: 기존 '/api/kling' 은 vite dev 전용 프록시라 프로덕션 빌드에서는 아예
  //  동작하지 않았다. 이 경로로 옮기면 배포 환경에서도 동작한다.)
  if (rest.startsWith('/kling')) {
    const creds = await klingKeys(admin)
    if (!creds) return json({ error: 'Kling API 키가 설정되지 않았습니다.' }, 503)

    const target = `${KLING_HOST}${rest.slice('/kling'.length)}${url.search}`
    // single: 발급된 키를 그대로 Bearer 로. legacy: 서버에서 매 요청마다 JWT 서명.
    const bearer = creds.kind === 'single' ? creds.token : await klingJwt(creds.id, creds.secret)

    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.headers.get('Content-Type') ?? 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    })

    const respHeaders = new Headers(corsHeaders)
    const ct = upstream.headers.get('Content-Type')
    if (ct) respHeaders.set('Content-Type', ct)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  }

  return json({ error: `지원하지 않는 경로입니다: ${rest}` }, 404)
})
