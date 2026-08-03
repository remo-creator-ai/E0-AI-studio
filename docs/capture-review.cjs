// Mode B 배선 리뷰용 스크린샷 캡처 스크립트
// 실행: node docs/capture-review.cjs
//
// 대상:
//  1) docs/mockups/mode-b-with-upscale.html (디자인 목업 · 인증 불필요)
//  2) http://localhost:3456 (라이브 랜딩 페이지)

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'review-screenshots');
fs.mkdirSync(OUT, { recursive: true });

const VW = 1280, VH = 900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const captions = {};

async function capturePage(page, file, caption, opts = {}) {
  captions[file] = caption;
  const h = opts.fullPage
    ? await page.evaluate(() =>
        Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 900),
      )
    : VH;
  if (opts.fullPage) {
    await page.setViewportSize({ width: VW, height: h });
    await wait(300);
  }
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  if (opts.fullPage) {
    await page.setViewportSize({ width: VW, height: VH });
  }
  console.log('  ✓', file, `(${h}px)`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // dev 오버레이 숨기기
  await page.addInitScript(() => {
    const inject = () => {
      if (!document.head || document.getElementById('__cap_hide')) return;
      const s = document.createElement('style');
      s.id = '__cap_hide';
      s.textContent = `
        nextjs-portal, [data-nextjs-toast-wrapper], [data-nextjs-toast],
        [data-nextjs-dialog-overlay], [data-nextjs-dialog],
        #__next-build-watcher, #__next-route-announcer__,
        [data-vite-dev-id], [data-vite-error] { display: none !important; }
      `;
      document.head.appendChild(s);
    };
    if (document.head) inject();
    document.addEventListener('DOMContentLoaded', inject);
  });

  // ═══════════ A. 목업 (디자인 참조) ═══════════
  const mockupPath = 'file://' + path.resolve(__dirname, 'mockups', 'mode-b-with-upscale.html').replace(/\\/g, '/');
  console.log('[A] Mockup:', mockupPath);
  await page.goto(mockupPath);
  await page.waitForLoadState('networkidle');
  await wait(600);
  await capturePage(page, 'A1_mockup_full.png', '목업 전체 (사용자 편집본 · 카드뷰 START/END 중심)', { fullPage: true });

  // ═══════════ B. 라이브 앱 (인증 요구 페이지 접근 불가) ═══════════
  console.log('[B] Live app landing');
  await page.goto('http://localhost:3456/');
  await page.waitForLoadState('networkidle');
  await wait(1200);
  await capturePage(page, 'B1_landing_top.png', '소담 AI Studio 랜딩 페이지 (미로그인 상태)');
  await capturePage(page, 'B1_landing_full.png', '소담 AI Studio 랜딩 페이지 전체', { fullPage: true });

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(captions, null, 2));
  console.log('\n캡션 저장:', path.join(OUT, 'captions.json'));
  console.log('\n완료.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
