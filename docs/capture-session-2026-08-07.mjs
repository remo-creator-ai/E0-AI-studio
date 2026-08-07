// Session review capture · 2026-08-07
// 이번 세션 변경 UI 5~8컷 · VITE_MOCK_AUTH=true 모드로 3457 에서 캡처
// 실행: node docs/capture-session-2026-08-07.mjs

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.env.BASE || 'http://127.0.0.1:3457';
const OUT = path.join(__dirname, 'session-2026-08-07');
fs.mkdirSync(OUT, { recursive: true });

const VW = 1440, VH = 900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const captions = {};

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);

  // mock 세션 강제 + dev overlay hide + 온보딩 완료 처리
  await page.addInitScript(() => {
    localStorage.setItem('mock-auth-role', 'master');    // Admin 콘솔까지 잡기 위해 master
    localStorage.setItem('remo-language', 'ko');
    localStorage.setItem('remo-settings', JSON.stringify({
      state: { onboardingCompleted: { dashboard: true, planning: true, visualizing: true, assembly: true } },
      version: 0,
    }));
    // 오픈 이벤트 팝업 오늘 날짜 숨김 처리 (클릭 인터셉트 방지)
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    localStorage.setItem('sodam-open-event-popup-hidden-date', iso);
    // dev overlay + Vite HMR + driver.js 온보딩 오버레이 hide
    const inject = () => {
      if (!document.head || document.getElementById('__cap_hide')) return;
      const s = document.createElement('style');
      s.id = '__cap_hide';
      s.textContent = `
        [data-vite-dev-id], [data-vite-error],
        vite-plugin-runtime-error-modal,
        .driver-overlay, .driver-popover, .driver-popover-wrapper,
        .driver-active-element, .driver-stage,
        [data-open-event-popup="true"] { display: none !important; pointer-events: none !important; }
        /* body 에 붙는 driver-active 클래스가 클릭 인터셉트 · 무력화 */
        body.driver-active, body.driver-fade { pointer-events: auto !important; }
      `;
      document.head.appendChild(s);
    };
    if (document.head) inject();
    document.addEventListener('DOMContentLoaded', inject);
  });

  const shotViewport = async (file, caption) => {
    captions[file] = caption;
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    console.log('  ✓', file);
  };

  const shotFull = async (file, caption) => {
    captions[file] = caption;
    const h = await page.evaluate(() =>
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 900),
    );
    await page.setViewportSize({ width: VW, height: Math.min(h, 3000) });
    await wait(250);
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    await page.setViewportSize({ width: VW, height: VH });
    console.log('  ✓', file);
  };

  // ============ 01. 대시보드 (사이드바 + 로고 + 스폰서) ============
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(1500);
  await shotViewport('01-dashboard-sidebar.png',
    '한글 로고 "소담 AI 스튜디오" · 사이드바 최하단 스폰서 · Powered by 표시 · 크리에이티브 섹션에 새 항목 "음성 생성"(Mic) 추가');

  // ============ 02. 이미지 생성 화면 (헤더 아이콘 · 스타일 팝업 이전) ============
  await page.locator('button', { hasText: '이미지 생성' }).first().click({ force: true });
  await wait(800);
  await shotViewport('02-image-studio-header.png',
    '이미지 생성 헤더 · 좌측 ImagePlus 파란 아이콘 (동영상 생성과 대칭 통일). 기본 진입 상태');

  // 스타일 팝업 열기 (있으면)
  const styleBtnImg = page.locator('button', { hasText: '스타일' }).first();
  if (await styleBtnImg.count() > 0) {
    await styleBtnImg.click({ force: true }).catch(() => {});
    await wait(500);
    await shotViewport('02b-image-studio-style-popup.png',
      '이미지 생성 스타일 팝업 · 내 스타일(있으면) + 프리셋 10종. 커스텀 스타일이 팝업 상단에 별도 섹션으로 노출');
    await page.keyboard.press('Escape').catch(() => {});
    await wait(300);
  }

  // ============ 03. 동영상 생성 화면 (헤더 · 신설 스타일 팝업) ============
  await page.locator('button', { hasText: '동영상 생성' }).first().click({ force: true });
  await wait(800);
  await shotViewport('03-video-studio-header.png',
    '동영상 생성 헤더 · Video 파란 아이콘 · 신설된 "스타일 선택" 버튼 (프롬프트 위) 확인');

  // 스타일 팝업 열기
  const styleBtnVid = page.locator('button', { hasText: /스타일 선택|스타일:/ }).first();
  if (await styleBtnVid.count() > 0) {
    await styleBtnVid.click({ force: true }).catch(() => {});
    await wait(500);
    await shotViewport('03b-video-studio-style-popup.png',
      '동영상 생성 신설 스타일 팝업 · 내 스타일 + 기본 스타일 · 선택 시 프롬프트 뒤에 . Style: 로 합쳐서 Kling 에 전달');
    await page.keyboard.press('Escape').catch(() => {});
    await wait(300);
  }

  // ============ 04. 음성 생성 화면 (신규) ============
  await page.locator('button', { hasText: '음성 생성' }).first().click({ force: true });
  await wait(800);
  await shotViewport('04-voice-studio-empty.png',
    '음성 생성 (신규) · 3영역 (설정 · 재생 안내 · 세션 히스토리) · Mic 헤더 아이콘 · 4가지 한국어 목소리 프리셋');

  // 스크립트 채워서 생성 준비 상태
  await page.locator('textarea').first().fill('안녕하세요, 소담 AI 스튜디오입니다. 오늘도 좋은 하루 되세요.');
  await wait(400);
  await shotViewport('04b-voice-studio-filled.png',
    '음성 생성 · 스크립트 입력 후 · 글자수 카운터 · 크레딧 자동 계산 (100자당 1cr) · 생성 버튼 활성');

  // ============ 05. 관리자 콘솔 API Keys 탭 ============
  // Admin 진입은 사이드바 or 프로필 메뉴에서
  const adminLink = page.locator('button', { hasText: /관리자|Admin/ }).first();
  if (await adminLink.count() > 0) {
    await adminLink.click({ force: true }).catch(() => {});
    await wait(1000);
    // API Keys 탭 찾기
    const apiKeysTab = page.locator('button', { hasText: /API.?Key/i }).first();
    if (await apiKeysTab.count() > 0) {
      await apiKeysTab.click({ force: true }).catch(() => {});
      await wait(500);
    }
    await shotFull('05-admin-api-keys.png',
      '관리자 콘솔 · API Keys 탭 · Gemini · OpenAI(GPT Image 2) · Google Cloud TTS(신규) · Kling 키 필드 · 각 필드는 "설정됨" 뱃지 · 새 값 입력 시 교체');
  }

  // ============ 06. 의뢰하기 모달 하단 피자 링크 ============
  // 프로덕션 스텝 (스토리보드 로드된 상태 필요 · mock 프로젝트가 없으면 스킵)
  // 우선 대시보드로 돌아가서 프로젝트 진입 시도
  await page.locator('button', { hasText: /대시보드|Dashboard/ }).first().click({ force: true }).catch(() => {});
  await wait(600);
  const projectCard = page.locator('[data-testid="project-card"]').first();
  if (await projectCard.count() > 0) {
    await projectCard.click({ force: true }).catch(() => {});
    await wait(800);
    // 제작 단계로
    await page.locator('button', { hasText: /전체영상제작|Production/ }).first().click({ force: true }).catch(() => {});
    await wait(800);
    const commissionBtn = page.locator('button', { hasText: /의뢰하기|Expert/ }).first();
    if (await commissionBtn.count() > 0) {
      await commissionBtn.click({ force: true }).catch(() => {});
      await wait(500);
      await shotViewport('06-commission-modal-pizza.png',
        '전문가 의뢰하기 모달 · 폼 하단에 신규 "🍕 개발자에게 피자 사주기" 노란 버튼 · buymeacoffee 링크');
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'session-2026-08-07-captions.json'),
    JSON.stringify(captions, null, 2),
  );
  console.log('\ntotal:', Object.keys(captions).length, 'captions');
} finally {
  await browser.close();
}
