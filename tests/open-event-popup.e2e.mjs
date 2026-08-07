import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3457';
const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeu_Eyc0Gnw1GJAaOKowf8W6YrD3sBHITbmu90LpOfEcrwspA/viewform?usp=pp_url&entry.239677956=%ED%99%88%ED%8E%98%EC%9D%B4%EC%A7%80+%ED%8C%9D%EC%97%85%EC%98%A4%EC%A0%84';
const storageKey = 'sodam-open-event-popup-hidden-date';
const browser = await chromium.launch({ headless: true });

const openAt = async (isoTime, hiddenDate, mockRole) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ fixedIsoTime, hiddenDateValue, key, role }) => {
    const NativeDate = Date;
    const fixedTime = NativeDate.parse(fixedIsoTime);
    class MockDate extends NativeDate {
      constructor(...args) {
        super(...(args.length > 0 ? args : [fixedTime]));
      }
      static now() {
        return fixedTime;
      }
    }
    window.Date = MockDate;
    if (hiddenDateValue) localStorage.setItem(key, hiddenDateValue);
    if (role) localStorage.setItem('mock-auth-role', role);
  }, { fixedIsoTime: isoTime, hiddenDateValue: hiddenDate, key: storageKey, role: mockRole });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  return { context, page };
};

try {
  const active = await openAt('2026-08-05T01:00:00+09:00');
  const popup = active.page.locator('[data-open-event-popup]');
  await popup.waitFor();

  assert.equal(await popup.getAttribute('role'), 'dialog');
  assert.equal(await popup.getAttribute('aria-modal'), 'true');
  assert.equal(await active.page.locator('[data-open-event-link]').getAttribute('href'), formUrl);
  assert.equal(await active.page.locator('[data-open-event-link]').getAttribute('target'), '_blank');
  assert.ok(await active.page.locator('[data-open-event-image]').evaluate((image) => image.naturalWidth > 0));

  const applyButton = active.page.locator('[data-open-event-apply]');
  const closeButton = active.page.locator('[data-open-event-close]');
  assert.equal(await applyButton.getAttribute('href'), formUrl);
  assert.equal(await applyButton.getAttribute('target'), '_blank');
  assert.equal((await applyButton.textContent())?.trim(), '신청하기');

  const applyBox = await applyButton.boundingBox();
  const closeBox = await closeButton.boundingBox();
  assert.ok(applyBox && closeBox, 'footer actions must be visible');
  assert.ok(closeBox.x > applyBox.x + applyBox.width, 'close must sit to the right of the apply button');
  assert.ok(closeBox.width < applyBox.width / 2, 'close must remain visually smaller than the apply button');

  await closeButton.click();
  assert.equal(await popup.count(), 0, 'normal close must hide the popup');
  await active.page.reload({ waitUntil: 'domcontentloaded' });
  await active.page.locator('[data-open-event-popup]').waitFor();

  await active.page.locator('[data-open-event-hide-today]').click();
  assert.equal(await active.page.evaluate((key) => localStorage.getItem(key), storageKey), '2026-08-05');
  await active.page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await active.page.locator('[data-open-event-popup]').count(), 0, 'same-day suppression must survive reload');
  await active.context.close();

  const nextDay = await openAt('2026-08-06T01:00:00+09:00', '2026-08-05');
  await nextDay.page.locator('[data-open-event-popup]').waitFor();
  await nextDay.context.close();

  const authenticated = await openAt('2026-08-05T01:00:00+09:00', undefined, 'user');
  await authenticated.page.locator('[data-sidebar-profile]').waitFor();
  await authenticated.page.locator('[data-open-event-popup]').waitFor();
  await authenticated.context.close();

  const expired = await openAt('2026-08-11T00:00:00+09:00');
  assert.equal(await expired.page.locator('[data-open-event-popup]').count(), 0, 'popup must be absent after August 10 KST');
  await expired.context.close();
} finally {
  await browser.close();
}
