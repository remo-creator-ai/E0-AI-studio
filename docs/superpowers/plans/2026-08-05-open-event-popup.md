# Open Event Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the supplied campaign image as a time-limited, dismissible homepage popup linked to the supplied Google Form.

**Architecture:** A focused `OpenEventPopup` component owns campaign dates, Korean-date suppression, modal accessibility, and the external link. `LandingPage` mounts it once so authenticated application modals remain unaffected.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Playwright browser API, Vite asset imports.

## Global Constraints

- Active through `2026-08-10T23:59:59+09:00` inclusive.
- Store only the Korean calendar date for `오늘 하루 보지 않기`.
- Use the exact user-provided Google Form URL.
- Add no dependency.

---

### Task 1: Popup browser contract

**Files:**
- Create: `tests/open-event-popup.e2e.mjs`

**Interfaces:**
- Consumes: homepage at `E2E_BASE_URL`
- Produces: regression coverage for `[data-open-event-popup]`

- [x] Write a Playwright test that fixes browser time within the campaign period and asserts the dialog, image link, and close controls.
- [x] Run the test and confirm it fails because the popup does not exist.
- [x] Extend the test to verify same-day suppression and expiration after August 10.

### Task 2: Campaign popup component

**Files:**
- Create: `components/OpenEventPopup.tsx`
- Modify: `components/LandingPage.tsx`
- Use: `docs/소담AI 스튜디오 팝업.png`

**Interfaces:**
- Consumes: browser `Date`, `localStorage`, supplied PNG asset
- Produces: `OpenEventPopup` React component

- [x] Implement Korean-date calculation and the fixed campaign end instant.
- [x] Render an accessible responsive dialog whose image links to the exact Google Form URL in a new tab.
- [x] Implement normal close, backdrop close, Escape close, and same-day suppression.
- [x] Mount the component once above the public and authenticated application branches.
- [x] Run the popup browser test and confirm it passes.

### Task 3: Visual and build verification

**Files:**
- Update: `.omx/state/open-event-popup/ralph-progress.json`

**Interfaces:**
- Consumes: rendered homepage screenshot and supplied PNG reference
- Produces: visual verdict and final verification evidence

- [x] Capture desktop and mobile popup screenshots.
- [x] Run visual verdict and iterate if the score is below 90.
- [x] Run `npm run build`, the popup browser test, and `git diff --check`.
