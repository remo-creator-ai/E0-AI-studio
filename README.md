<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# REMO AI Studio

AI-powered video production platform. From script to storyboard to video — all automated.

## Tech Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite 6
- **State**: Zustand
- **Styling**: Tailwind CSS v4
- **Auth**: Supabase + Google OAuth
- **AI**: Gemini AI (script/image/video), Kling AI (video)
- **Deploy**: Vercel

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.local.example` to `.env.local` and set your keys:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_ADMIN_EMAIL=admin@example.com
   ```
3. Run the app:
   ```bash
   npm run dev
   ```

## Build

```bash
npm run build
```

Runs `tsc --noEmit && vite build`. Output in `dist/`.

## Deployment (Vercel)

### Branch Strategy

- `master` — development branch
- `main` — production branch (Vercel deploys from here)

### Deploy Steps

1. Commit & push to `master`
2. Merge to `main`:
   ```bash
   git checkout main && git merge master && git push origin main && git checkout master
   ```
3. Trigger deploy (choose one):

   **Option A: Deploy Hook**
   ```bash
   curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_vygv6160dHyLDg5qJM4kqRWf9tFX/zyp1t8fip0"
   ```

   **Option B: Vercel API** (requires token)
   ```bash
   curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=team_aDbLgUvNQFsnJMcz0sE0bpN1" \
     -H "Authorization: Bearer $VERCEL_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"remo-ai-studio","project":"prj_vygv6160dHyLDg5qJM4kqRWf9tFX","gitSource":{"type":"github","org":"remo-creator-ai","repo":"REMO-AI-Studio-v1","ref":"main","repoId":1142116745},"target":"production"}'
   ```

4. Build takes ~3-5 minutes. Check status at Vercel Dashboard > Deployments.

## Supabase Setup

### Required Tables

Run migrations in order from `supabase/migrations/`:

| Migration | Description |
|-----------|-------------|
| `schema.sql` | profiles, projects, RLS, triggers |
| `002_project_summaries.sql` | get_project_summaries RPC |
| `003_current_stage.sql` | current_stage column |
| `004_fix_rpc_security.sql` | RPC security fixes |
| `005_user_credits.sql` | user_credits table, deduct/initialize RPCs |

### Admin: Add Credits

```sql
UPDATE user_credits
SET balance = balance + 100, max_credits = max_credits + 100
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'user@example.com')
RETURNING *;
```

## Project Structure

```
├── components/        # React components
│   ├── LandingPage.tsx
│   ├── Dashboard.tsx
│   ├── Layout.tsx
│   ├── PlanningStep.tsx
│   ├── VisualizingStep.tsx
│   ├── AssemblyStep.tsx
│   ├── ProductionStep.tsx
│   ├── SettingsPage.tsx
│   └── AdminPage.tsx
├── store/
│   ├── store.ts          # Main Zustand store
│   ├── authStore.ts      # Supabase auth
│   ├── creditStore.ts    # Credits (Supabase-backed)
│   └── settingsStore.ts  # User preferences
├── services/
│   ├── geminiService.ts  # Gemini AI API
│   ├── klingService.ts   # Kling AI API
│   └── projectService.ts # Project CRUD
├── lib/
│   └── supabase.ts       # Supabase client
├── types/
│   └── database.ts       # Supabase types
├── supabase/
│   └── migrations/       # SQL migrations
└── vercel.json           # Vercel config
```
