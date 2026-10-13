# E0 authentication setup

Project: `E0-AI-studio` / `dmgpelodmgkmlqlbabra`, Seoul.
Dashboard: https://supabase.com/dashboard/project/dmgpelodmgkmlqlbabra
Site URL: https://e0-ai-studio.vercel.app

Database migrations through `044_e0_auth_roles.sql` are applied to E0 only.
The production Vercel project has the E0 public URL and anon key.
`VITE_GOOGLE_AUTH_ENABLED=false` keeps sign-in unavailable until OAuth is configured.
Database signup, initial credits, rejection of metadata role escalation, and rejection
of user profile self-promotion/admin request access were tested in a rolled-back transaction.

## Remaining Google setup

1. In Google Cloud create/select an E0 project, configure Google Auth Platform branding and audience.
2. Create a Web application OAuth client.
3. Authorized JavaScript origin: `https://e0-ai-studio.vercel.app`.
4. Authorized redirect URI: `https://dmgpelodmgkmlqlbabra.supabase.co/auth/v1/callback`.
5. Enter the client ID and secret in E0 Supabase Authentication > Sign In / Providers > Google, then enable it.
6. If the Google app is in Testing, add the intended testers, including `remoimagevideo@gmail.com`.
7. Verify the provider is enabled, set Vercel `VITE_GOOGLE_AUTH_ENABLED=true`, and redeploy.
8. Test real Google consent, return to dashboard, refresh, logout, and two-user data isolation.
9. Assign the intended administrator's profile role explicitly after their first verified sign-in.

Google secrets belong in Supabase provider settings, never in VITE variables or Git.
AI provider keys and Edge Functions are separate from Google sign-in and are not connected yet.

Reference: https://supabase.com/docs/guides/auth/social-login/auth-google
