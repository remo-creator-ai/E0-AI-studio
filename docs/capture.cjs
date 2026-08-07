// =============================================================
//  개발분 스크린샷 캡처 (Playwright)
//
//  실행: node docs/capture.cjs
//  전제: VITE_MOCK_AUTH=true 로 dev 서버가 떠 있어야 한다 (기본 3456).
//        가계정 모드라 Supabase 세션 없이 UI 를 볼 수 있다.
//
//  이 앱은 라우터가 없다 — currentStep(zustand) 로 화면을 바꾸므로
//  URL 이동이 아니라 사이드바 클릭으로 이동한다.
// =============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3457';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const VW = 1440, VH = 900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const captions = {};

// 가계정 세션 + 온보딩 완료 표시를 미리 심는다.
// (투어가 자동으로 떠서 일반 화면 캡처를 가리는 것을 막는다)
function seed(role, tourDone) {
  return `(() => {
    localStorage.setItem('mock-auth-role', ${JSON.stringify(role)});
    // 오픈 이벤트 팝업 억제. 클릭으로 닫으면 투어 오버레이가 클릭을 가로채 실패한다.
    const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    localStorage.setItem('sodam-open-event-popup-hidden-date', kst);
    localStorage.setItem('remo-settings', JSON.stringify({
      state: { onboardingCompleted: ${tourDone
        ? `{ dashboard: true, imageStudio: true, videoStudio: true, planning: true, visualizing: true, assembly: true, production: true }`
        : `{}`}, _replayTourId: null },
      version: 0
    }));
  })()`;
}

// dev 오버레이(에러 토스트 등) 숨김
const HIDE_DEV = () => {
  const inject = () => {
    if (!document.head || document.getElementById('__cap_hide')) return;
    const s = document.createElement('style');
    s.id = '__cap_hide';
    s.textContent = `[data-vite-dev-id],[data-vite-error],vite-error-overlay{display:none!important}`
      + (window.__hideTour ? `.driver-overlay,.driver-popover{display:none!important}` : '');
    document.head.appendChild(s);
  };
  if (document.head) inject();
  document.addEventListener('DOMContentLoaded', inject);
};

async function makePage(browser, { role = 'master', tourDone = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  });
  if (tourDone) await ctx.addInitScript(() => { window.__hideTour = true; });
  await ctx.addInitScript(HIDE_DEV);
  await ctx.addInitScript(seed(role, tourDone));
  const page = await ctx.newPage();
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 공통 캡처 헬퍼 ----------
  const makeShot = (page) => async (file, caption, opts = {}) => {
    captions[file] = caption;
    if (opts.overlay) {
      // 투어 팝오버·모달은 fixed 라 viewport 그대로 찍어야 제자리에 보인다.
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    } else {
      const h = await page.evaluate((min) => Math.max(
        document.documentElement.scrollHeight, document.body.scrollHeight, min,
      ), VH);
      await page.setViewportSize({ width: VW, height: Math.min(h, 2600) });
      await wait(250);
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
      await page.setViewportSize({ width: VW, height: VH });
    }
    console.log('  ✓', file);
  };

  const goNav = async (page, label) => {
    await page.getByRole('button', { name: label, exact: false }).first().click();
    await wait(1200);
  };

  // ============ 1) 일반 화면 (투어 끔) ============
  {
    const { ctx, page } = await makePage(browser, { tourDone: true });
    const shot = makeShot(page);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(1500);
    await shot('01_dashboard.png', '가계정 모드 대시보드. 사이드바 크리에이티브 그룹에 이미지·동영상·음성 생성이 나란히 있다.');

    // ---- 이미지 생성: 모델별 크레딧 변화 ----
    await goNav(page, '이미지 생성');
    await shot('02_image_default.png', '이미지 생성 첫 진입. 생성 모델 드롭다운이 스타일과 이미지 형태 사이에 있고, 기본값은 가장 저렴한 Nano Banana 2.');

    const modelSelect = page.locator('select').first();
    for (const [value, file, cap] of [
      ['gpt-image-2', '03_image_model_gpt.png', 'GPT Image 2 선택 시 생성 버튼의 크레딧이 3cr 로 바뀐다.'],
      ['gemini-3-pro-image-preview', '04_image_model_pro.png', 'Nano Banana Pro 선택 시 6cr. 모델별 장당 원가에 맞춰 단가가 차등된다.'],
    ]) {
      await modelSelect.selectOption(value);
      await wait(500);
      await shot(file, cap);
    }
    await modelSelect.selectOption('gemini-3.1-flash-image-preview');
    await wait(400);

    // ---- 동영상 생성 ----
    await goNav(page, '동영상 생성');
    await shot('05_video_default.png', '동영상 생성 첫 진입. 시작·끝 프레임 슬롯, 길이(5/10초), 해상도(720p/1080p)를 고른다.');

    const btn1080 = page.getByRole('button', { name: '1080p', exact: false }).first();
    if (await btn1080.count()) {
      await btn1080.click();
      await wait(500);
      await shot('06_video_1080p.png', '1080p 선택 시 Pro 모드로 올라가며 크레딧이 2배가 된다는 안내가 뜬다.');
    }

    // ---- 음성 생성 ----
    await goNav(page, '음성 생성');
    await shot('07_voice_stub.png', '음성 생성은 아직 준비 중 화면. 사이드바 라우팅만 먼저 열어 흐름을 확인할 수 있게 했다.');

    // ---- 관리자 콘솔 · API 키 ----
    await goNav(page, '관리자 콘솔');
    await wait(800);
    const apiTab = page.getByRole('button', { name: 'API 키', exact: false }).first();
    if (await apiTab.count()) {
      await apiTab.click();
      await wait(700);
      await shot('08_admin_keys.png', '관리자 콘솔 API 키 탭. OpenAI(GPT Image 2)·Google TTS 키 입력란이 추가됐다.');
    }

    await ctx.close();
  }

  // ============ 2) 온보딩 가이드 (투어 켬) ============
  {
    const { ctx, page } = await makePage(browser, { tourDone: false });
    const shot = makeShot(page);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(2600); // 자동 트리거 800ms + 렌더 여유
    if (await page.locator('.driver-popover').count()) {
      await shot('09_tour_dashboard.png', '대시보드 진입 시 자동으로 뜨는 온보딩 가이드 1컷.', { overlay: true });

      // 2번째 스텝(워크플로우) — 문구를 한글 단계명으로 고친 부분
      const next = page.locator('.driver-popover-next-btn');
      if (await next.count()) {
        await next.click();
        await wait(900);
        await shot('10_tour_workflow.png', '워크플로우 안내. 영문 단계명 대신 실제 화면의 한글 단계명으로 교체했다.', { overlay: true });
      }
    } else {
      console.log('  ! 대시보드 투어 팝오버를 찾지 못함');
    }

    await ctx.close();
  }

  // ============ 3) 이미지 생성 투어 ============
  {
    const { ctx, page } = await makePage(browser, { tourDone: false });
    const shot = makeShot(page);

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(1500);
    // 대시보드 투어가 떠 있으면 닫고 이동
    const close = page.locator('.driver-popover-close-btn');
    if (await close.count()) { await close.click(); await wait(500); }

    await goNav(page, '이미지 생성');
    await wait(2200);
    if (await page.locator('.driver-popover').count()) {
      await shot('11_tour_image.png', '이번에 신설한 이미지 생성 가이드. 생성 방식 → 생성 모델 → 생성 버튼 3컷.', { overlay: true });
      const next = page.locator('.driver-popover-next-btn');
      if (await next.count()) {
        await next.click();
        await wait(900);
        await shot('12_tour_image_model.png', '모델 선택 스텝. 모델에 따라 화질이 달라진다는 점을 안내한다.', { overlay: true });
      }
    } else {
      console.log('  ! 이미지 생성 투어 팝오버를 찾지 못함');
    }

    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'captions.json'), JSON.stringify(captions, null, 2));
  console.log('\n캡처 완료:', Object.keys(captions).length, '컷');
})().catch((e) => { console.error(e); process.exit(1); });
