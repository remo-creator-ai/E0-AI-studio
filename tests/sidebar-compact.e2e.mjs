import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3456';
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5_000);
  await page.addInitScript(() => localStorage.setItem('mock-auth-role', 'user'));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const creditCard = page.locator('[data-tour="sidebar-credits"]');
  const profileCard = page.locator('[data-sidebar-profile]');
  const settingsButton = page.locator('[data-sidebar-settings]');

  await creditCard.waitFor();
  await profileCard.waitFor();

  const creditBox = await creditCard.boundingBox();
  const profileBox = await profileCard.boundingBox();

  assert.ok(creditBox && creditBox.height <= 60, `credit card height must be <= 60px, got ${creditBox?.height}`);
  assert.ok(profileBox && profileBox.height <= 60, `profile card height must be <= 60px, got ${profileBox?.height}`);
  assert.equal(await settingsButton.count(), 1, 'profile row must contain one settings gear button');
  assert.equal(await page.locator('nav [data-sidebar-settings]').count(), 0, 'settings must not remain in the main navigation');

  await settingsButton.click();
  assert.equal(await settingsButton.getAttribute('aria-current'), 'page', 'settings gear must show the active state on the settings page');
} finally {
  await browser.close();
}
