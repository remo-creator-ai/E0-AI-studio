// Supabase Edge Function: master-create-account
// 마스터가 발급계정(아이디/비번)을 생성한다.
// Deploy: supabase functions deploy master-create-account
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (프로젝트에 기본 주입됨)
//
// 요청(JSON): { login_id: string, password: string, display_name?: string }
// 응답(JSON): { ok: true, user_id: string, login_id, email }
//
// 보안: 호출자 JWT(Authorization: Bearer)의 uid 가 profiles.role='master' 인 경우에만 동작.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EMAIL_DOMAIN = 'sodam.local' // docs/AUTH_MODEL_TRANSITION.md §6 확정
const INITIAL_CREDITS = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // 1. 호출자 인증 및 마스터 권한 검증
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401)

  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) return json({ error: '유효하지 않은 세션입니다.' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single()
  if (callerProfile?.role !== 'master') {
    return json({ error: '마스터만 계정을 생성할 수 있습니다.' }, 403)
  }

  // 2. 입력 검증
  let payload: { login_id?: string; password?: string; display_name?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: '잘못된 요청 본문입니다.' }, 400)
  }
  const loginId = (payload.login_id ?? '').trim().toLowerCase()
  const password = payload.password ?? ''
  const displayName = payload.display_name?.trim() || loginId

  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(loginId)) {
    return json({ error: '아이디는 영문 소문자/숫자/._- 조합 3~32자여야 합니다.' }, 400)
  }
  if (password.length < 8) {
    return json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400)
  }

  const email = `${loginId}@${EMAIL_DOMAIN}`

  // 3. 계정 생성 (이메일 확인 불필요 → email_confirm: true)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { login_id: loginId, role: 'user', full_name: displayName },
  })
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? ''
    if (msg.includes('already') || msg.includes('registered')) {
      return json({ error: '이미 존재하는 아이디입니다.' }, 409)
    }
    return json({ error: `계정 생성 실패: ${msg}` }, 500)
  }

  // 4. 초기 크레딧 부여 (트리거로 profile 은 자동 생성됨)
  const { error: creditErr } = await admin
    .from('user_credits')
    .upsert(
      { user_id: created.user.id, balance: INITIAL_CREDITS, max_credits: INITIAL_CREDITS },
      { onConflict: 'user_id' }
    )
  if (creditErr) {
    console.error('크레딧 초기화 실패:', creditErr.message)
  }

  return json({ ok: true, user_id: created.user.id, login_id: loginId, email })
})
