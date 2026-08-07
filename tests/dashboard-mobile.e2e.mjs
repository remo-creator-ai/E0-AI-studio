import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3457';
const browser = await chromium.launch({ headless: true });

const koreanDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const openDashboard = async (width, height, fixtures = {}) => {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(({ hiddenDate }) => {
    localStorage.setItem('mock-auth-role', 'user');
    localStorage.setItem('remo-language', 'ko');
    localStorage.setItem('remo-settings', JSON.stringify({
      state: { onboardingCompleted: { dashboard: true } },
      version: 0,
    }));
    localStorage.setItem('sodam-open-event-popup-hidden-date', hiddenDate);
  }, { hiddenDate: koreanDateKey() });
  if (fixtures.projects) {
    await context.route('**/rest/v1/rpc/get_project_summaries', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.projects),
    }));
  }
  if (fixtures.requests) {
    await context.route('**/rest/v1/production_requests**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixtures.requests),
    }));
  }
  const page = await context.newPage();
  page.setDefaultTimeout(7_000);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-sidebar-profile]').waitFor();
  return { context, page };
};

try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const { context, page } = await openDashboard(viewport.width, viewport.height);

    const mobileTitle = page.locator('[data-dashboard-mobile-title]');
    const primaryCta = page.locator('[data-dashboard-primary-cta]');
    const quickActions = page.locator('[data-dashboard-quick-action]');

    await mobileTitle.waitFor();
    assert.equal((await mobileTitle.textContent())?.trim(), '무엇을 만들어볼까요?');
    assert.equal((await page.locator('[data-dashboard-mobile-subtitle]').textContent())?.trim(), 'AI 쇼츠부터 이미지·영상·음성까지 한곳에서 시작하세요.');
    assert.equal((await primaryCta.textContent())?.replace(/\s+/g, ' ').trim(), '새 프로젝트');
    assert.equal(await quickActions.count(), 3);
    assert.equal(await page.locator('[data-dashboard-empty-title]').textContent(), '아직 만든 프로젝트가 없어요');

    const ctaBox = await primaryCta.boundingBox();
    assert.ok(ctaBox && ctaBox.width >= viewport.width - 48, `primary CTA should span the mobile content width at ${viewport.width}px`);
    assert.ok(ctaBox && ctaBox.width > ctaBox.height * 4, 'primary CTA text must remain horizontal');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, 'dashboard must not overflow horizontally');

    await context.close();
  }

  for (const action of [
    { id: 'image', title: '이미지 생성' },
    { id: 'video', title: '동영상 생성' },
    { id: 'voice', title: '음성 생성' },
  ]) {
    const navigation = await openDashboard(390, 844);
    await navigation.page.locator(`[data-dashboard-quick-action="${action.id}"]`).click();
    await navigation.page.locator('[data-dashboard-mobile-title]').waitFor({ state: 'detached' });
    await navigation.page.getByText(action.title, { exact: true }).first().waitFor();
    assert.equal(await navigation.page.locator('[data-dashboard-mobile-title]').count(), 0, `${action.id} quick action must leave the dashboard`);
    await navigation.context.close();
  }

  const populated = await openDashboard(390, 844, {
    projects: [{
      id: 'project-1',
      title: '동네 카페 쇼츠',
      style: 'CINEMATIC',
      duration: 30,
      created_at: '2026-08-06T01:00:00.000Z',
      updated_at: '2026-08-07T01:00:00.000Z',
      scenes_count: 4,
      images_done: 4,
      videos_done: 2,
      thumbnail: null,
      current_stage: 'PRODUCTION',
      original_creator_id: null,
      creator_display_name: null,
      creator_avatar_url: null,
    }],
    requests: [{
      id: 'request-1',
      project_title: '동네 카페 쇼츠',
      status: 'in_progress',
      created_at: '2026-08-07T01:00:00.000Z',
      purpose: '매장 SNS 홍보용 세로형 쇼츠 제작',
    }],
  });

  const projectGrid = populated.page.locator('[data-dashboard-project-grid]');
  await projectGrid.waitFor();
  assert.equal(await projectGrid.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length), 1);
  assert.equal(await populated.page.locator('[data-dashboard-request-cards]').isVisible(), true);
  assert.equal(await populated.page.locator('[data-dashboard-request-table]').isVisible(), false);
  assert.equal(await populated.page.evaluate(() => document.documentElement.scrollWidth), 390);
  await populated.context.close();

  const desktop = await openDashboard(1440, 900, {
    projects: [{
      id: 'project-1', title: '동네 카페 쇼츠', style: 'CINEMATIC', duration: 30,
      created_at: '2026-08-06T01:00:00.000Z', updated_at: '2026-08-07T01:00:00.000Z',
      scenes_count: 4, images_done: 4, videos_done: 2, thumbnail: null,
      current_stage: 'PRODUCTION', original_creator_id: null,
      creator_display_name: null, creator_avatar_url: null,
    }],
    requests: [{
      id: 'request-1', project_title: '동네 카페 쇼츠', status: 'in_progress',
      created_at: '2026-08-07T01:00:00.000Z', purpose: '매장 SNS 홍보용 세로형 쇼츠 제작',
    }],
  });
  await desktop.page.locator('[data-dashboard-project-grid]').waitFor();
  assert.equal(await desktop.page.locator('[data-dashboard-request-cards]').isVisible(), false);
  assert.equal(await desktop.page.locator('[data-dashboard-request-table]').isVisible(), true);
  assert.equal(await desktop.page.evaluate(() => document.documentElement.scrollWidth), 1440);
  await desktop.context.close();
} finally {
  await browser.close();
}
