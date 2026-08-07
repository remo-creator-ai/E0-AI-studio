// 나머지 3장 (동영상 · 음성 · Admin) 채우기 · native click 우회
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://127.0.0.1:3457';
const OUT = path.join(__dirname, 'session-2026-08-07');
const VW = 1440, VH = 900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    localStorage.setItem('mock-auth-role', 'master');
    localStorage.setItem('remo-language', 'ko');
    localStorage.setItem('remo-settings', JSON.stringify({
      state: { onboardingCompleted: { dashboard: true, planning: true, visualizing: true, assembly: true } },
      version: 0,
    }));
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('sodam-open-event-popup-hidden-date', iso);
    const inject = () => {
      if (!document.head || document.getElementById('__cap_hide')) return;
      const s = document.createElement('style');
      s.id = '__cap_hide';
      s.textContent = `
        .driver-overlay, .driver-popover, .driver-popover-wrapper,
        .driver-active-element, .driver-stage,
        [data-open-event-popup="true"] { display: none !important; pointer-events: none !important; }
        body.driver-active, body.driver-fade { pointer-events: auto !important; }
      `;
      document.head.appendChild(s);
    };
    if (document.head) inject();
    document.addEventListener('DOMContentLoaded', inject);
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(1500);

  // 사이드바 항목을 label 로 찾아 native click 트리거 (Playwright actionability 우회)
  const clickSidebar = async (label) => {
    const clicked = await page.evaluate((label) => {
      // driver.js 오버레이 강제 제거 (혹시 남아있으면)
      document.querySelectorAll('.driver-overlay, .driver-popover, .driver-active-element')
        .forEach((el) => el.remove());
      document.body.classList.remove('driver-active', 'driver-fade');
      // 사이드바의 SidebarItem 은 <button> 안에 <span class="font-bold">라벨</span>
      const spans = Array.from(document.querySelectorAll('aside button span.font-bold'));
      const target = spans.find((s) => s.textContent?.trim() === label);
      if (!target) return false;
      const btn = target.closest('button');
      if (!btn) return false;
      btn.click();
      return true;
    }, label);
    await wait(1200);
    return clicked;
  };

  const shot = async (file, waitAfter = 300) => {
    await wait(waitAfter);
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    console.log('  ✓', file);
  };

  // 동영상 생성
  const okVideo = await clickSidebar('동영상 생성');
  console.log('sidebar click 동영상 생성:', okVideo);
  await shot('03-video-studio-header.png');

  // 음성 생성 (신규)
  const okVoice = await clickSidebar('음성 생성');
  console.log('sidebar click 음성 생성:', okVoice);
  await shot('04-voice-studio-empty.png');

  // 음성 · 스크립트 채운 상태
  const textarea = page.locator('textarea').first();
  await textarea.fill('안녕하세요, 소담 AI 스튜디오입니다. 오늘도 좋은 하루 되세요.');
  await shot('04b-voice-studio-filled.png', 400);

  // 관리자 콘솔 (마스터 모드에서만 노출)
  const okAdmin = await clickSidebar('관리자 콘솔');
  console.log('sidebar click 관리자 콘솔:', okAdmin);
  await wait(1000);
  // API Keys 탭 클릭 (탭 컴포넌트가 있으면)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const apiTab = btns.find((b) => /API.?Key/i.test(b.textContent ?? ''));
    if (apiTab) apiTab.click();
  });
  await wait(800);
  // 관리자 화면은 스크롤 필요할 수 있어 fullPage 흉내 (viewport 늘려서 캡처)
  const h = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 900),
  );
  await page.setViewportSize({ width: VW, height: Math.min(h, 2400) });
  await wait(300);
  await page.screenshot({ path: path.join(OUT, '05-admin-api-keys.png'), fullPage: false });
  await page.setViewportSize({ width: VW, height: VH });
  console.log('  ✓ 05-admin-api-keys.png');

  console.log('done');
} finally {
  await browser.close();
}
