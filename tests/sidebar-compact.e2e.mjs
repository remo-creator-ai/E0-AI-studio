import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3456';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.addInitScript(() => {
    localStorage.setItem('mock-auth-role', 'user');
    localStorage.setItem('remo-settings', JSON.stringify({
      state: { onboardingCompleted: { dashboard: true } },
      version: 0,
    }));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
    localStorage.setItem('sodam-open-event-popup-hidden-date', `${value('year')}-${value('month')}-${value('day')}`);
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const creditCard = page.locator('[data-tour="sidebar-credits"]');
  const profileCard = page.locator('[data-sidebar-profile]');
  const accountGroup = page.locator('[data-sidebar-account]');
  const settingsButton = page.locator('[data-sidebar-settings]');

  await creditCard.waitFor();
  await profileCard.waitFor();

  const creditBox = await creditCard.boundingBox();
  const profileBox = await profileCard.boundingBox();
  const accountBox = await accountGroup.boundingBox();

  assert.ok(creditBox && creditBox.height <= 60, `credit card height must be <= 60px, got ${creditBox?.height}`);
  assert.ok(profileBox && profileBox.height <= 60, `profile card height must be <= 60px, got ${profileBox?.height}`);
  assert.ok(accountBox && accountBox.height <= 108, `credit and profile group height must be <= 108px, got ${accountBox?.height}`);
  assert.equal(await settingsButton.count(), 1, 'profile row must contain one settings gear button');
  assert.equal(await page.locator('nav [data-sidebar-settings]').count(), 0, 'settings must not remain in the main navigation');

  await settingsButton.click();
  assert.equal(await settingsButton.getAttribute('aria-current'), 'page', 'settings gear must show the active state on the settings page');
} finally {
  await browser.close();
}
