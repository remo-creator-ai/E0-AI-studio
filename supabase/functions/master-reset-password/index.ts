// Supabase Edge Function: master-reset-password
// 마스터가 발급계정의 임시 비밀번호를 재발급한다.
// Deploy: supabase functions deploy master-reset-password
//
// 요청(JSON): { user_id: string }
// 응답(JSON): { ok: true, temp_password: string }  ← 마스터 화면에 1회만 표시 (DB/로그 저장 금지)
//
// 보안: 호출자 JWT 의 uid 가 profiles.role='master' 인 경우에만 동작.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// 읽기 쉬운 12자 임시 비밀번호 생성 (혼동 문자 제외)
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += chars[b % chars.length]
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // 1. 마스터 권한 검증
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return json({ error: '인증 토큰이 없습니다.' }, 401)

  const { data: caller, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !caller?.user) return json({ error: '유효하지 않은 세션입니다.' }, 401)

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single()
  if (callerProfile?.role !== 'master') {
    return json({ error: '마스터만 비밀번호를 재발급할 수 있습니다.' }, 403)
  }

  // 2. 대상 검증
  let payload: { user_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: '잘못된 요청 본문입니다.' }, 400)
  }
  const targetId = payload.user_id ?? ''
  if (!targetId) return json({ error: 'user_id 가 필요합니다.' }, 400)

  const { data: target } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', targetId)
    .single()
  if (!target) return json({ error: '대상 계정을 찾을 수 없습니다.' }, 404)
  if (target.role === 'master') {
    return json({ error: '마스터 계정의 비밀번호는 이 기능으로 변경할 수 없습니다.' }, 403)
  }

  // 3. 임시 비밀번호 설정
  const tempPassword = generateTempPassword()
  const { error: updateErr } = await admin.auth.admin.updateUserById(targetId, {
    password: tempPassword,
  })
  if (updateErr) {
    return json({ error: `비밀번호 재발급 실패: ${updateErr.message}` }, 500)
  }

  // 평문은 응답으로만 1회 반환 — 저장하지 않음
  return json({ ok: true, temp_password: tempPassword })
})
