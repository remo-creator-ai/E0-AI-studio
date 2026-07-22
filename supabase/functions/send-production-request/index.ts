// Supabase Edge Function: send-production-request
// Deploy: supabase functions deploy send-production-request
// Secrets needed: RESEND_API_KEY
//
// To set up:
// 1. Sign up at resend.com (free: 100 emails/day)
// 2. Get API key
// 3. Run: supabase secrets set RESEND_API_KEY=re_xxxxx

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const TO_EMAIL = 'remoimagevideo@gmail.com'

serve(async (req) => {
  try {
    const payload = await req.json()

    // Database Webhook wraps data in "record", direct calls don't
    const body = payload.record || payload

    const {
      project_title,
      requester_name,
      requester_email,
      aspect_ratio,
      scene_count,
      purpose,
      additional_notes,
      storyboard_url,
      assets_url,
      extra_file_urls,
      storyboard_downloaded,
      assets_downloaded,
    } = body

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const htmlBody = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0A; color: #fff; border-radius: 16px; overflow: hidden;">
        <div style="background: #0057FF; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px;">
            Sodam AI Studio - 영상 제작 의뢰
          </h1>
        </div>
        <div style="padding: 32px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #888; font-size: 12px; font-weight: 700;">의뢰자명</td><td style="padding: 8px 0; font-weight: 700;">${requester_name}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 12px; font-weight: 700;">이메일</td><td style="padding: 8px 0;">${requester_email}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 12px; font-weight: 700;">프로젝트명</td><td style="padding: 8px 0; font-weight: 700;">${project_title}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 12px; font-weight: 700;">비율</td><td style="padding: 8px 0;">${aspect_ratio}</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 12px; font-weight: 700;">씬 수</td><td style="padding: 8px 0;">${scene_count}컷</td></tr>
            <tr><td style="padding: 8px 0; color: #888; font-size: 12px; font-weight: 700;">영상 용도</td><td style="padding: 8px 0; font-weight: 700;">${purpose}</td></tr>
          </table>
          ${additional_notes ? `<div style="margin-top: 16px; padding: 16px; background: #1A1A1A; border-radius: 8px;"><p style="color: #888; font-size: 12px; font-weight: 700; margin: 0 0 8px;">추가 요청사항</p><p style="margin: 0; font-size: 14px;">${additional_notes}</p></div>` : ''}
          <div style="margin-top: 24px; padding: 20px; background: #1A1A1A; border-radius: 12px;">
            <p style="color: #888; font-size: 12px; font-weight: 700; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 1px;">📎 프로젝트 파일 다운로드</p>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${storyboard_url
                ? `<a href="${storyboard_url}" style="display: block; padding: 14px 18px; background: #0057FF; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 700; text-align: center;">📋 스토리보드 다운로드 (.json)</a>`
                : `<div style="padding: 14px 18px; background: #2A2A2A; color: #666; border-radius: 8px; font-size: 13px; font-weight: 700; text-align: center;">${storyboard_downloaded ? '✅ 스토리보드 (의뢰자 로컬 다운로드 완료)' : '❌ 스토리보드 미첨부'}</div>`
              }
              ${assets_url
                ? `<a href="${assets_url}" style="display: block; padding: 14px 18px; background: #0057FF; color: #fff; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 700; text-align: center;">🎨 이미지 에셋 다운로드 (.zip)</a>`
                : `<div style="padding: 14px 18px; background: #2A2A2A; color: #666; border-radius: 8px; font-size: 13px; font-weight: 700; text-align: center;">${assets_downloaded ? '✅ 이미지 에셋 (의뢰자 로컬 다운로드 완료)' : '❌ 이미지 에셋 미첨부'}</div>`
              }
            </div>
          </div>
          ${extra_file_urls?.length ? `<div style="margin-top: 16px; padding: 16px; background: #1A1A1A; border-radius: 8px;"><p style="color: #888; font-size: 12px; font-weight: 700; margin: 0 0 8px;">추가 첨부 파일</p>${extra_file_urls.map((url: string) => `<a href="${url}" style="color: #0057FF; display: block; margin: 4px 0; font-size: 13px;">${decodeURIComponent(url.split('/').pop() || url)}</a>`).join('')}</div>` : ''}
        </div>
        <div style="padding: 16px 32px; background: #111; text-align: center; font-size: 11px; color: #555;">
          Sodam AI Studio &copy; ${new Date().getFullYear()}
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Sodam AI Studio <noreply@resend.dev>',
        to: [TO_EMAIL],
        reply_to: requester_email,
        subject: `[소담] 영상 제작 의뢰 - ${project_title} (${requester_name})`,
        html: htmlBody,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Resend error:', result)
      return new Response(
        JSON.stringify({ error: 'Email send failed', details: result }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
