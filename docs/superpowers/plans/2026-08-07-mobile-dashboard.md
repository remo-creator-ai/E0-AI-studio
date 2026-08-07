# Mobile Creation Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authenticated dashboard mobile-first by prioritizing a new short-form project CTA, direct studio shortcuts, compact project/request layouts, and current Korean product copy.

**Architecture:** Keep `Dashboard` as the existing data and interaction owner. Add responsive markup and Tailwind classes inside that component, reuse Zustand `setStep` for studio navigation, and keep desktop project behavior unchanged. Extend Playwright E2E coverage at the browser boundary without adding runtime dependencies.

**Tech Stack:** React 19, TypeScript, Zustand, i18next, Tailwind CSS 4, Playwright, Vite

## Global Constraints

- Modify only the authenticated dashboard and the open-event popup CTA copy.
- Keep sidebar, studio internals, project workflow steps, project CRUD, intro survey, and onboarding behavior unchanged.
- Use 768px as the mobile/desktop breakpoint and validate 390px and 430px widths.
- Do not add dependencies, backend APIs, or database changes.
- Keep the popup artwork link unchanged while changing its footer CTA to `신청하기`.

---

### Task 1: Popup CTA Copy

**Files:**
- Modify: `tests/open-event-popup.e2e.mjs`
- Modify: `components/OpenEventPopup.tsx`

**Interfaces:**
- Consumes: existing `[data-open-event-apply]` link and `FORM_URL`
- Produces: the visible CTA label `신청하기` while preserving the same href and target

- [ ] **Step 1: Update the existing browser assertion first**

```js
assert.equal((await applyButton.textContent())?.trim(), '신청하기');
```

- [ ] **Step 2: Run the popup E2E test and verify RED**

Run: `node tests/open-event-popup.e2e.mjs`

Expected: FAIL because the rendered label is still `지금 신청하기`.

- [ ] **Step 3: Make the minimal production copy change**

```tsx
<a data-open-event-apply ...>
  신청하기
</a>
```

- [ ] **Step 4: Run the popup E2E test and verify GREEN**

Run: `node tests/open-event-popup.e2e.mjs`

Expected: PASS with the form URL, CTA label, close placement, suppression, and expiry scenarios intact.

### Task 2: Mobile Hero and Studio Shortcuts

**Files:**
- Create: `tests/dashboard-mobile.e2e.mjs`
- Modify: `components/Dashboard.tsx`
- Modify: `i18n/ko.json`
- Modify: `i18n/en.json`

**Interfaces:**
- Consumes: `useStore().setStep`, `ProjectStep.IMAGE_STUDIO`, `ProjectStep.VIDEO_STUDIO`, `ProjectStep.VOICE_STUDIO`
- Produces: `[data-dashboard-mobile-title]`, `[data-dashboard-primary-cta]`, `[data-dashboard-quick-actions]`, and `[data-dashboard-quick-action]`

- [ ] **Step 1: Create a failing mobile E2E test**

```js
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  localStorage.setItem('mock-auth-role', 'user');
  localStorage.setItem('remo-settings', JSON.stringify({
    state: { onboardingCompleted: { dashboard: true } },
    version: 0,
  }));
  localStorage.setItem('sodam-open-event-popup-hidden-date', koreanDateKey());
});
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
assert.equal((await page.locator('[data-dashboard-mobile-title]').textContent())?.trim(), '무엇을 만들어볼까요?');
assert.equal(await page.locator('[data-dashboard-quick-action]').count(), 3);
assert.ok(await page.locator('[data-dashboard-primary-cta]').evaluate((button) => button.clientWidth >= 320));
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
```

- [ ] **Step 2: Run the dashboard E2E test and verify RED**

Run: `node tests/dashboard-mobile.e2e.mjs`

Expected: FAIL because the mobile title and quick-action elements do not exist.

- [ ] **Step 3: Add exact translation keys**

```json
{
  "mobileTitle": "무엇을 만들어볼까요?",
  "mobileSubtitle": "AI 쇼츠부터 이미지·영상·음성까지 한곳에서 시작하세요.",
  "quickStart": "바로 시작하기",
  "recentProjects": "최근 프로젝트",
  "emptyTitle": "아직 만든 프로젝트가 없어요",
  "emptySubtitle": "아이디어만 준비되면 AI가 제작 과정을 도와드려요."
}
```

Add equivalent English values: `What will you create?`, `Start AI shorts, images, video, and voice in one place.`, `Quick Start`, `Recent Projects`, `No projects yet`, and `Bring an idea and AI will guide the production process.` Reuse the existing `newProject` key for the CTA.

- [ ] **Step 4: Implement responsive hero and shortcuts**

Use `md:hidden` for the mobile title, `hidden md:block` for the existing desktop title, a full-width mobile CTA, and three shortcut buttons:

```tsx
const quickActions = [
  { step: ProjectStep.IMAGE_STUDIO, label: t('nav.imageStudio'), icon: ImageIcon },
  { step: ProjectStep.VIDEO_STUDIO, label: t('nav.videoStudio'), icon: Film },
  { step: ProjectStep.VOICE_STUDIO, label: t('nav.voiceStudio'), icon: Mic },
];

<button
  data-dashboard-quick-action
  onClick={() => setStep(action.step)}
  className="min-w-0 rounded-2xl border border-zinc-200 bg-white px-2 py-4"
>
  <action.icon />
  <span className="whitespace-nowrap">{action.label}</span>
</button>
```

- [ ] **Step 5: Verify quick navigation and responsive geometry GREEN**

Run: `node tests/dashboard-mobile.e2e.mjs`

Expected: PASS for title, CTA width, three shortcuts, navigation, and zero horizontal overflow at 390px and 430px.

### Task 3: Compact Projects and Mobile Request Cards

**Files:**
- Modify: `tests/dashboard-mobile.e2e.mjs`
- Modify: `components/Dashboard.tsx`

**Interfaces:**
- Consumes: existing `projects`, `myRequests`, `handleOpenProject`, `handleDeleteProject`, and `formatDate`
- Produces: `[data-dashboard-project-grid]`, `[data-dashboard-request-cards]`, and `[data-dashboard-request-table]`

- [ ] **Step 1: Add fixture-backed failing assertions**

Intercept `**/rest/v1/rpc/get_project_summaries` and `**/rest/v1/production_requests*` with literal project/request fixtures before navigation, then assert:

```js
assert.equal(await page.locator('[data-dashboard-project-grid]').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 1);
assert.equal(await page.locator('[data-dashboard-request-cards]').isVisible(), true);
assert.equal(await page.locator('[data-dashboard-request-table]').isVisible(), false);
```

- [ ] **Step 2: Run the fixture scenario and verify RED**

Run: `node tests/dashboard-mobile.e2e.mjs`

Expected: FAIL because mobile request cards and their data selectors do not exist.

- [ ] **Step 3: Tighten mobile project cards**

Keep `md:grid-cols-2 lg:grid-cols-3`, reduce mobile gaps and padding, and add the `최근 프로젝트` section label without changing open/delete/progress behavior.

- [ ] **Step 4: Render requests as cards below 768px**

Render a `md:hidden` card list with project name, purpose, date, and status. Wrap the existing table in `hidden md:block` and preserve all current desktop cells and status styling.

- [ ] **Step 5: Run the complete dashboard test GREEN**

Run: `node tests/dashboard-mobile.e2e.mjs`

Expected: PASS for empty and populated dashboard states at both mobile widths.

### Task 4: Full Verification, Visual QA, and Publish

**Files:**
- Modify only if verification reveals a scoped defect
- Record untracked visual evidence under `.omx/state/mobile-dashboard/`

**Interfaces:**
- Consumes: completed dashboard and popup behavior
- Produces: build/test evidence, desktop/mobile screenshots, visual verdict JSON, and deployed production verification

- [ ] **Step 1: Run fresh automated verification**

Run:

```powershell
npm run build
node tests/dashboard-mobile.e2e.mjs
node tests/open-event-popup.e2e.mjs
node tests/sidebar-compact.e2e.mjs
git diff --check
```

Expected: all commands exit 0; Vite may retain its existing large-chunk advisory only.

- [ ] **Step 2: Capture responsive evidence**

Capture authenticated dashboard screenshots at 390x844, 430x932, and 1440x900 with onboarding and the event popup suppressed. Capture both empty and fixture-populated mobile states.

- [ ] **Step 3: Apply visual-verdict**

Persist `.omx/state/mobile-dashboard/ralph-progress.json` with score 90 or greater, no horizontal overflow, no vertical button text, readable shortcut cards, and preserved desktop hierarchy. If below 90, apply the listed corrections and repeat screenshots before further edits.

- [ ] **Step 4: Commit only scoped files using the Lore protocol**

Stage `components/Dashboard.tsx`, `components/OpenEventPopup.tsx`, `i18n/ko.json`, `i18n/en.json`, `tests/dashboard-mobile.e2e.mjs`, and `tests/open-event-popup.e2e.mjs`. Do not stage `.omx/`.

- [ ] **Step 5: Push `main`, wait for Vercel success, and smoke-test production**

Verify the deployed URL at 390px for the new title, full-width CTA, three shortcuts, no overflow, and popup label `신청하기`.
