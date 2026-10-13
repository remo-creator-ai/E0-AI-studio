import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3456';
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => {
      localStorage.setItem('e0-mock-auth-role', 'user');
      localStorage.setItem('e0-language', 'ko');
      localStorage.setItem('remo-settings', JSON.stringify({ state: { onboardingCompleted: { dashboard: true, assembly: true } }, version: 0 }));
    });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.locator('.e0-starts').waitFor();
    assert.equal(await page.locator('.e0-starts button').count(), 3);
    assert.equal(await page.locator('[data-dashboard-quick-action]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    // The retained sample must still open the project workflow.
    await page.getByRole('button', { name: '사전 작성된 샘플 스토리보드 열기' }).click();
    await page.locator('[data-tour="assembly-storyboard"]').waitFor();
    await page.reload();
    await page.locator('[data-dashboard-project-grid]').waitFor();
    await context.close();
  }
  console.log('PASS: simplified dashboard, responsive width, sample workflow and persistence');
} finally {
  await browser.close();
}
