from pathlib import Path
import json, html, re

ROOT = Path(__file__).resolve().parent
ROOT.mkdir(parents=True, exist_ok=True)

CSS = '''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3f6f5;color:#172b29;font:16px/1.8 'Segoe UI','Malgun Gothic',sans-serif}a{color:#006f63;text-underline-offset:4px}header{background:#102d29;color:white;padding:52px max(24px,calc((100vw - 1120px)/2))}header p{color:#bbd8d2}h1{font-size:36px;line-height:1.35;letter-spacing:-1.2px}h2{font-size:25px;margin-top:48px;border-top:1px solid #d8e2df;padding-top:28px;line-height:1.5}h3{font-size:19px;margin-top:28px}main{max-width:1120px;margin:0 auto;padding:24px 28px 80px;background:white}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding:18px 0;border-bottom:1px solid #d8e2df}table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px}th,td{padding:13px;text-align:left;vertical-align:top;border:1px solid #d8e2df}th{background:#edf5f2}p,li{word-break:keep-all;overflow-wrap:anywhere}.callout{padding:20px 24px;background:#e8f5f1;border-left:4px solid #009481;margin:24px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}.card{border:1px solid #d8e2df;border-radius:14px;padding:24px}.tag{font-size:12px;letter-spacing:2px;font-weight:700;color:#72dbc5}code,pre{font-family:Consolas,monospace;font-size:13px}code{overflow-wrap:anywhere}pre{background:#112d29;color:#e5f5ef;padding:24px;white-space:pre-wrap;border-radius:12px}img{max-width:100%;height:auto}.muted{color:#546c65;font-size:14px}.swatch{display:inline-block;width:14px;height:14px;vertical-align:middle;margin-right:7px;border:1px solid #999}.figure{margin:24px 0;background:#f1f5f3;padding:20px}footer{margin-top:48px;font-size:13px;color:#546c65}section{scroll-margin-top:20px}@media(max-width:720px){h1{font-size:29px}.grid{grid-template-columns:1fr}main{padding:16px}table{display:block;overflow:auto}header{padding:32px 20px}}@media print{body,main{background:white}header{background:white;color:#102d29;padding:0}header p{color:#546c65}nav{display:none}main{max-width:none;padding:0}h2,h3{break-after:avoid}tr,.card{break-inside:avoid}a{color:inherit}pre{background:#eee;color:#111} @page{size:A4;margin:16mm}}'''

def table(headers, rows):
    return '<table><thead><tr>'+''.join('<th>'+x+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+str(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'

def doc(filename,title,subtitle,body):
    nav='<nav><a href="index.html">분석·후보 비교</a><a href="preview.html">두 후보 화면 보기</a><a href="A-product-prd.html">A 기능 PRD</a><a href="A-design-prd.html">A 디자인 PRD</a><a href="B-product-prd.html">B 기능 PRD</a><a href="B-design-prd.html">B 디자인 PRD</a></nav>'
    text=f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><style>{CSS}</style></head><body><header><div class="tag">E0 AI STUDIO · PLANNING v0.1</div><h1>{title}</h1><p>{subtitle}</p></header><main>{nav}{body}<footer>2026-10-12 · 검토용 제안 v0.1 · 문서와 시안만 작성. 앱 구현·Supabase 연결·Vercel 배포는 진행하지 않음.</footer></main></body></html>'
    (ROOT/filename).write_text(text,encoding='utf-8')

sources='''<h2 id="sources">근거와 확인 범위</h2><ul>
<li><a href="http://eoneoms.com/main/main.php">S1 공식 홈페이지</a>: 사업 분야와 메인 정보구조. 2026-10-12 확인.</li>
<li><a href="https://eoneoms.com/company/aboutus.php">S2 회사 소개</a>: 하드웨어·소프트웨어·콘텐츠를 함께 제공하는 사업 특성.</li>
<li><a href="https://eoneoms.com/customer_service/cms.php">S3 CMS 소개</a>: 회사의 콘텐츠 운영 사업 맥락. E0 앱과의 연동 증거는 아님.</li>
<li><a href="http://eoneoms.com/common/css/layout.css">S4 공식 layout.css</a>, <a href="http://eoneoms.com/common/css/basic.css">basic.css</a>: 청록색 #009481, 흑백·회색, Noto Sans KR 및 Segoe UI 선언 확인.</li>
<li><a href="http://eoneoms.com/images/common/logo.png">S5 공식 로고</a>: 청록색 e와 어두운 나머지 글자를 직접 확인. 원본 비율 유지.</li>
<li><a href="http://eoneoms.com/images/main/new_main_vasual01.jpg">S6 LED 메인 이미지</a>, <a href="http://eoneoms.com/images/main/new_main_vasual04.jpg">스마트미러 이미지</a>: 건축 공간·화면 발광·설치 맥락을 직접 확인. 메인 연출 이미지의 실제 시공 여부는 별도 검증하지 않음.</li>
<li>로컬 근거: <code>styles.css</code>, <code>App.tsx</code>, <code>components/Layout.tsx</code>, <code>Dashboard.tsx</code>, <code>LandingPage.tsx</code>, <code>types.ts</code>, <code>i18n/ko.json</code>, <code>lib/mockAuth.ts</code>, 기존 대시보드 스크린샷.</li></ul>
<p class="muted">공식 페이지 텍스트·HTML·CSS·로고·대표 이미지를 교차 확인했다. 연결 가능한 브라우저가 없어 전체 페이지의 실제 렌더링과 모바일 동작은 검증하지 못했다. 아래 시각 해석은 소스와 이미지 관찰에 기반하며, 완성된 사이트 화면의 실측 결과가 아니다. 홈페이지 게시 수치·수상·고객사를 E0의 사용 실적이나 성능으로 전용하지 않는다.</p>'''

comparison=table(['항목','A · E0 Brand Studio','B · E0 Spatial Studio'],[
('방향','밝고 단정한 기업형 AI 제작 도구','어두운 공간·디스플레이 중심 제작 도구'),
('주 사용자 가설','이원 내부 마케팅·영업, 고객 콘텐츠 담당자','공간 제안 담당자, 사이니지 콘텐츠 디자이너'),
('시작점','어떤 콘텐츠를 만들까요?','어떤 화면에 보여줄까요?'),
('정보구조','프로젝트와 기존 제작 도구 중심','화면 프로필 선택 → 콘텐츠 기획 → 장면 제작'),
('색·형태','화이트 + 딥 틸 CTA / 12px 카드','차콜 + 민트 CTA / 8px 패널'),
('브랜드 연결','eone 로고·청록색을 직접 계승','공식 공간 이미지와 디스플레이 경험을 재해석'),
('MVP 차별점','3개 용도별 시작 템플릿·브랜드 문구','가로/세로 화면 프로필·무음 검토 프레임'),
('개발 영향','낮음~중간: 기존 흐름과 레이아웃 재사용','중간~높음: 시작 흐름·미리보기·어두운 화면 전환'),
('주요 한계','브랜드 변경만 하면 차별성이 약함 → 용도 템플릿 보완','화면 미리보기가 실제 장치 검증처럼 오인되지 않게 표시'),
('추천 상황','빠른 E0 전환과 일상 제작 업무','디스플레이 사업 특화 데모·영업 경쟁력 우선')])

doc('index.html','이원오엠에스 분석과 E0 후보 2안','공식 브랜드에서 출발하여 기존 소담 AI 제작 기능을 E0의 사용 맥락으로 전환',f'''
<div class="callout"><b>추천: A를 1차 기본안으로 채택.</b> 기존 제작 기능에 기업 정체성을 안정적으로 적용하기 좋다. 디스플레이 특화가 핵심 목표로 확인되면 B를 선택한다. 두 안은 색만 다른 테마가 아니라 프로젝트 시작 방식과 결과 검토 방식이 다르다.</div>
<p>이번 과업은 회사 홈페이지를 다시 만드는 것이 아니라, 복제된 AI 영상 제작 앱을 이원오엠에스에 맞추는 것이다. 제품명은 사용자 지정 <b>E0 AI Studio</b>(숫자 0)를 작업명으로 사용한다. 회사 공식 표기는 <b>eone / 주식회사 이원오엠에스</b>이며 두 명칭을 혼용하지 않는다. 최종 서비스 명칭과 운영자 표기는 확정 전이다.</p>
<h2>1. 사이트에서 읽히는 사업·브랜드</h2>
{table(['관찰 사실','E0에 대한 해석·적용 제안'],[
('LED Display·Digital Signage·KIOSK·Smart Mirror·Contents를 메인에서 구분 [S1]','하드웨어 사양보다 결과물이 놓일 공간과 화면을 템플릿 언어로 반영한다.'),
('회사는 하드웨어·소프트웨어·콘텐츠를 아우르는 솔루션을 소개 [S2]','AI 이미지·영상 제작을 고객 공간의 콘텐츠 준비 단계로 포지셔닝할 수 있다. 실제 사용자 수요는 미확인 가설이다.'),
('회사 사이트에 CMS와 운영 기능 소개가 존재 [S3]','제작 파일 전달 이후 운영으로 확장할 여지가 있다. API·계정·스케줄러 연동은 새 과제다.'),
('청록색 e 로고, #009481 강조색, 흑백·회색 기반 CSS [S4,S5]','소담이 마스코트를 걷어내고 기업 워드마크와 절제된 청록색을 사용한다. 공식 CI 매뉴얼을 확보한 것은 아니다.'),
('메인 이미지가 건물 LED와 생활공간 스마트미러를 보여줌 [S6]','큰 화면 비율·프레임·공간 맥락을 활용하되 작업 화면은 편집 가독성을 우선한다.'),
('메인 구조는 제품 소개·기업 신뢰·설치 사례·브랜드·뉴스 [S1]','앱 랜딩은 제작 목적·사용 흐름·샘플·시작 CTA로 재편한다. 회사 홍보 섹션을 그대로 복제하지 않는다.')])}
<h2>2. 현재 소담 버전에서 바꿔야 하는 지점</h2>
<p>현재 코드 토큰은 오픈놀 블루 <code>#0050BF</code>이고, 좌측 캐릭터·큰 기울임 영문 제목·둥근 버튼·제작 4단계 구조가 있다. 저장된 디자인 문서에는 다른 색상 버전도 있어, 현재 코드를 구현 기준으로 삼는다. 기존 PRD와 목 계정의 크레딧 수치도 달라 E0의 혜택 정책으로 자동 승계하지 않는다.</p>
{table(['구분','처리 계획'],[
('유지','기획 → 이미지 → 스토리보드 → 영상의 기본 기능, 개별 이미지·동영상·음성 생성, 자산 보관함, 저장 상태 표시'),
('브랜드 교체','서비스명, 로고·파비콘, 랜딩·헤더·푸터, 한국어·영어 번역, AI 프롬프트 속 명칭, 내보내기 제목·파일명'),
('콘텐츠 정리','소담 행사 팝업·지원 신청 링크·오픈놀 후원 표기 제거/대체. E0 실제 혜택이 정해지기 전 숫자·무료 제공 약속 금지'),
('후속 확정','운영자와 문의처, 이용정책 문구, 요금·크레딧, 서비스 도메인, GA 식별자, Supabase·Vercel 새 연결'),
('이번 산출물','공식 사이트 분석 1개, 후보 화면 비교 1개, 후보별 기능·콘텐츠 PRD 2개, 후보별 디자인 PRD 2개, 디자인 토큰 JSON')])}
<h2>3. 후보 비교</h2>{comparison}
<div class="grid"><article class="card"><h3>A · E0 Brand Studio</h3><p>“브랜드의 아이디어를, 완성도 있는 영상으로.”</p><p>화이트 캔버스에 청록색을 명확한 행동에만 사용한다. 비전문 담당자가 기존 제작 흐름을 쉽게 이용하도록 만든다.</p><p><a href="A-product-prd.html">기능·콘텐츠 PRD →</a> · <a href="A-design-prd.html">디자인 PRD →</a></p></article><article class="card"><h3>B · E0 Spatial Studio</h3><p>“공간을 채우는 콘텐츠, 화면에서 시작하다.”</p><p>차콜 작업실에서 결과 이미지가 중심이 된다. 화면 방향과 무음 상황을 먼저 정해 제작 결과를 검토한다.</p><p><a href="B-product-prd.html">기능·콘텐츠 PRD →</a> · <a href="B-design-prd.html">디자인 PRD →</a></p></article></div>
<p><a href="preview.html"><b>두 후보의 대시보드·랜딩 문구와 화면 구성 비교 보기 →</b></a></p>
<h2>4. 실행 순서와 결정 항목</h2><ol><li>A 또는 B 방향을 선택한다. 이름은 E0 AI Studio를 임시 유지한다.</li><li>선택한 안으로 로컬 브랜드 구성·랜딩·공통 레이아웃·대시보드를 구현한다.</li><li>작업 화면·출력물·온보딩의 문구와 테마를 일괄 정리하고 목 데이터로 검토한다.</li><li>새 Supabase·Vercel과 운영정책을 확정한 뒤 실제 인증·저장·생성·배포를 검증한다.</li></ol><p>사용자 가설은 내부 담당자/고객사 제작자이며 아직 인터뷰하지 않았다. 승인 워크플로, 조직별 공동 자산, 장치 제어, CMS 송출은 기존 구현 사실로 간주하지 않는다.</p>{sources}''')

common_requirements=[
('C-01','P0','E0 브랜드 구성','명칭·로고·로컬 시안용 설명을 한 구성 객체로 관리. 한국어/영어 대응. 화면과 출력물에서 소담/오픈놀 노출 0건(보관된 과거 문서 제외).'),
('C-02','P0','기존 기능 보존','기획·이미지·조립·영상 및 개별 생성 도구로 이동 가능. 기존 프로젝트 데이터 구조를 임의 변환하지 않음.'),
('C-03','P0','초기 안내 정비','소담 오픈 행사와 외부 신청 폼 미노출. E0 제작 예시와 간결한 안내로 교체.'),
('C-04','P0','저장·실패 상태','저장 중/저장됨/실패/권한 없음 구분. 실패 시 입력 유지·재시도. 생성 중 중복 제출 방지, 완료 전 완료 표시 금지.'),
('C-05','P0','출력물 브랜드','스토리보드 HTML·ZIP·인쇄 제목, 영상·CapCut ZIP 기본 파일명을 e0 계열로 정리. 확장자·내용·다운로드 동작 보존.'),
('C-06','P0','시안 모드','목 데이터 사용을 명시. 실제 생성·저장 성공을 가장하지 않음. 기존 목 인증만으로 전체 네트워크가 차단된다고 가정하지 않고 호출별 목 어댑터 적용.'),
('C-07','P1','운영 연결','새 Supabase 인증/저장/스토리지/RLS·크레딧, 새 Vercel 도메인·환경변수·GA를 연결하는 별도 후속 작업. 이번 변경에서 실행하지 않음.')]

files=[
('styles.css','브랜드·의미 색 토큰, 상태 색, 폰트·여백, 오래된 sd-* 도우미 정리'),
('components/LandingPage.tsx / Layout.tsx / Dashboard.tsx','로고·문구·레이아웃·프로젝트 시작점·후원 표기'),
('App.tsx / components/OpenEventPopup.tsx','기존 행사 노출 해제, 로딩/전환 배경과 목 검토 경로'),
('i18n/ko.json / en.json / constants.ts','전역 명칭·가이드·온보딩·생성 프롬프트 정리'),
('components/PlanningStep.tsx / VisualizingStep.tsx / AssemblyStep.tsx','용도 예시, 장면 카드·출력 제목·인쇄 브랜드'),
('components/production/* / ImageStudio.tsx / VideoStudio.tsx / VoiceStudio.tsx','작업 패널·기본 예시·다운로드 파일명·로딩·오류 색'),
('lib/mockAuth.ts / components/ui/OnboardingTour.tsx','E0 데모 사용자와 온보딩 문구, 크레딧은 예시 표기'),
('index.html / metadata.json / public/ / package.json / package-lock.json','메타·아이콘·앱 식별명. 운영 URL 확정 전 기존 URL 제거/보류; 잠금 파일은 패키지 관리 도구로 정합성 유지'),
('lib/analytics.ts / index.html / 배포 문서','소담 측정 대상·배포 훅 재사용 방지, 새 연결 단계에서 확정')]

for key,name in [('A','E0 Brand Studio'),('B','E0 Spatial Studio')]:
    a=key=='A'
    position='브랜드 콘텐츠를 손쉽게 기획하고 이미지·영상으로 완성하는 기업형 AI 제작 공간' if a else '게시할 화면의 방향과 시청 맥락에서 출발하는 공간 콘텐츠 제작 공간'
    reqs=([
    ('A-01','P0','목적별 시작 카드','제품 소개 / 매장 프로모션 / 기업·브랜드 소개 3개. 선택 시 편집 가능한 기획 예시를 채우고 즉시 유료 생성하지 않음.'),
    ('A-02','P0','프로젝트 대시보드','최근 수정순 프로젝트, 생성 도구 바로가기, 제목·형식·진행 단계·저장 시간 표시. 목록이 없으면 한 개 시작 CTA.'),
    ('A-03','P0','기획 입력','프로젝트명·핵심 메시지·레퍼런스·16:9/9:16·기존 컷 수 선택. 누락 필드는 인라인 안내하고 입력 유지.'),
    ('A-04','P1','브랜드 기본값 재사용','기존 개인 자산 선택 흐름 활용. 회사 공용 브랜드킷·조직 권한은 추가 설계 후 진행.')]
    if a else [
    ('B-01','P0','화면 우선 시작','가로 디스플레이 16:9 / 세로 디스플레이 9:16 선택 후 기존 비율 필드로 연결. 실제 장치 자동 감지·해상도 보장 문구 없음.'),
    ('B-02','P0','공간 콘텐츠 브리프','공간 유형·화면 방향·전달 메시지·무음 검토 여부를 입력. 필수는 방향과 메시지, 나머지는 선택. 선택값으로 편집 가능한 프롬프트 보조문 생성.'),
    ('B-03','P0','프레임 검토','16:9/9:16 비율 프레임, contain 기본, 제목·핵심 메시지는 프레임 밖 검토 정보로 표시. 무음 재생은 플레이어 음소거이며 원본 음원 삭제가 아님.'),
    ('B-04','P0','결과 준비 상태','생성됨 / 검토 필요 / 다운로드 가능을 구분. 미리보기 아래 “비율 확인용 · 실제 디스플레이 송출 검증 전” 명시.'),
    ('B-05','P1','확장 화면','사용자 지정 픽셀, 초광폭 LED, 멀티비전 분할, 루프 편집·문자 합성은 API·렌더 파이프라인 지원을 확인한 뒤 별도 구현.'),
    ('B-06','P2','CMS 전달','API 사양·파일 제약·인증·스케줄·상태 반환 확인 후 별도 연동. MVP에 송출 버튼이나 가짜 장치 목록을 만들지 않음.')])
    flow='목적 카드 선택 → 브리프 확인 → 장면 기획 → 이미지 제작 → 스토리보드 검토 → 영상 제작 → 다운로드' if a else '화면 방향 선택 → 공간·메시지 브리프 → 장면 기획 → 이미지 제작 → 스토리보드 검토 → 프레임/무음 검토 → 다운로드'
    doc(f'{key}-product-prd.html',f'후보 {key} · 기능·콘텐츠 PRD',name+' / 제품 요구사항과 적용 계획',f'''
    <div class="callout"><b>제품 정의:</b> {position}. 사용자 가설을 기반으로 한 제안이며, 현재 앱에 특화 기능이 이미 구현되었다는 뜻은 아니다.</div>
    <h2>1. 문제·목표·범위</h2><p>소담 브랜드·행사·일반 쇼츠 문구가 남아 있어 이원오엠에스의 서비스로 인식하기 어렵다. 핵심 목표는 E0의 소유감과 제작 목적을 명확하게 하고, 기존 생성 흐름을 유지하는 것이다.</p>
    <p>이번 산출 범위는 요구사항과 시안이다. 선택 후 P0 구현은 로컬 목 데이터 검토까지 진행하며, 실제 인증·저장·유료 생성·배포의 출시는 후속 연결 단계의 검증을 조건으로 한다.</p>
    <h2>2. 사용자·핵심 시나리오</h2>
    {table(['사용자 가설','해야 할 일','성공 조건'],[
    ('내부 마케팅 담당자' if a else '공간 제안 담당자','제품 이미지와 핵심 메시지로 '+('프로모션 영상 기획' if a else '가로/세로 화면용 콘텐츠 기획'),'시작점과 다음 단계가 설명 없이 이해됨'),
    ('고객사 콘텐츠 담당자' if a else '콘텐츠 디자이너','기존 자산을 재사용하여 장면을 수정','원본 레퍼런스·프로젝트 내용 유지, 결과 검토 후 파일 확보'),
    ('관리자','사용 현황과 요청·크레딧 관리','기존 역할·접근 제어 유지. E0 별도 정책은 후속 확정')])}
    <h2>3. 사용자 흐름과 정보구조</h2><div class="callout">{flow}</div>
    <p>공통 메뉴: 내 프로젝트 / 이미지 생성 / 동영상 생성 / 음성 생성 / 자산 보관함. 프로젝트 진입 후 기획 → 이미지 → 스토리보드 → 영상의 단계 표시. 설정·도움말·계정은 하단, 관리자 메뉴는 기존 권한 조건을 유지한다.</p>
    <p>{'프로젝트 시작 모달을 간결하게 유지하고 목적 카드 선택은 기본 프롬프트와 안내 문구에 반영한다.' if a else '프로젝트 시작 모달의 첫 화면을 화면 방향 선택으로 바꾼다. 장치 관제 메뉴는 추가하지 않으며, 키오스크·스마트미러도 MVP에서는 정적 콘텐츠 사용 맥락만 다룬다.'}</p>
    <h2>4. 기능 요구사항·완료 기준</h2>{table(['ID','우선순위','요구사항','수용 기준'],common_requirements+reqs)}
    <h2>5. 랜딩과 화면별 콘텐츠</h2>
    {table(['화면','제안 문구·정보'],[
    ('랜딩 헤드라인','브랜드의 아이디어를, 완성도 있는 영상으로.' if a else '공간을 채우는 콘텐츠, 화면에서 시작하다.'),
    ('보조 설명','기획부터 이미지와 영상 제작까지. E0 AI Studio에서 브랜드 콘텐츠를 준비하세요.' if a else '가로·세로 화면에 맞춰 장면을 기획하고, 공간에 어울리는 콘텐츠를 만들어보세요.'),
    ('랜딩 CTA','콘텐츠 만들기 / 제작 흐름 살펴보기' if a else '화면 선택하고 시작하기 / 제작 예시 살펴보기'),
    ('랜딩 순서','핵심 메시지 → 목적별 예시 3개 → 4단계 제작 → 자산 재사용 → 시작 CTA' if a else '공간 비주얼 → 화면 방향 → 장면 제작 흐름 → 프레임 검토 → 시작 CTA'),
    ('대시보드 제목','오늘, 어떤 콘텐츠를 만들까요?' if a else '어떤 화면을 위한 콘텐츠인가요?'),
    ('빈 목록','첫 프로젝트를 만들어보세요. 제품 이미지와 한 줄 메시지로 시작할 수 있습니다.'),
    ('생성 오류','생성을 완료하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요. 차감 여부는 실제 서버 결과에 따라 표시.'),
    ('푸터','E0 AI Studio / 주식회사 이원오엠에스 연계 서비스 표기 검토. 운영 주체·문의처·개발사 표기는 계약과 실제 운영 기준 확정 후 반영.')])}
    <h3>예시 템플릿: 실제 납품 실적이 아닌 가상 제작 과제</h3><p>{'제품 소개: 제품 이미지 + 특징 3개 + 구매 유도 메시지 / 매장 프로모션: 행사명 + 기간 + 안내 문구 / 기업 소개: 사업 설명 + 핵심 역량 + 문의 유도.' if a else '가로 매장 화면: 신제품 이미지와 간결한 메시지 / 세로 안내 화면: 행사 소개 이미지와 장소 안내 / 쇼룸 화면: 공간 분위기와 제품 장면. 날짜·가격·사양은 사용자가 제공한 값만 사용한다.'}</p>
    <h2>6. 데이터·기술 경계</h2><p>현재 <code>AspectRatio</code>는 16:9와 9:16이다. 모델별 지원 해상도는 별도이며, 화면 방향 선택만으로 4K·초광폭 출력이 보장되지 않는다. 기존 <code>ProjectStep</code>·프로젝트 저장 및 역할 체계를 우선 재사용한다.</p>
    <p>{'초기 템플릿은 프런트 정적 구성으로 관리하고, 선택한 메시지는 기존 기획 입력으로 복사한다. 조직 공용 데이터 추가 없이 P0를 구성한다.' if a else 'P0 화면 방향은 기존 aspect_ratio에 매핑한다. 공간·무음 검토 선택값은 로컬 목 상태에서 먼저 검증하며 재진입 유지가 필요하다. 실제 저장 단계에서는 version=1의 선택적 displayBrief 메타데이터와 서비스 직렬화·DB 변경을 함께 설계한다. 미지정된 기존 프로젝트는 표준 방향으로 열고 강제 마이그레이션하지 않는다.'}</p>
    <p>자산의 로고·제품 형상은 레퍼런스로 제공해도 생성 모델이 항상 보존하지는 않는다. 정확한 문구·로고 보장이 필요하면 후속 오버레이 합성 기능으로 분리한다. CMS 제공 여부와 E0 연동 가능성은 서로 다른 사실이다.</p>
    <h2>7. 적용 파일 계획</h2>{table(['대상','변경 내용'],files)}
    <h2>8. 단계별 실행·산출물</h2>
    {table(['단계','작업','완료 조건'],[
    ('D0 · 선택','후보·제품명·주 사용자를 결정','A/B 중 기준안과 미확정 운영 항목 기록'),
    ('D1 · 기반','brandConfig·토큰·공통 컴포넌트·로고 자산','하드코딩된 주요 색과 서비스명 교체, 임시 워드마크 구분'),
    ('D2 · 주요 화면','랜딩·대시보드·시작 흐름 '+('목적별 카드' if a else '화면 선택·프레임 검토'),'데스크톱·모바일 목 시안 검토'),
    ('D3 · 전체 적용','제작 도구·온보딩·내보내기·빈 화면·오류','잔여 브랜드 검색과 수용 시나리오 통과'),
    ('D4 · 후속 연결','새 Supabase·Vercel·도메인·운영정책','실제 저장/권한/생성/크레딧/배포 검증 후 출시')])}
    <p>상대 공수: {'기존 구조 재사용이 많아 B보다 작다.' if a else 'A의 브랜드 작업 외에 화면 선택·프레임 검토·어두운 테마 전수 적용이 추가된다.'} 확정 일정은 선택 후 화면 범위와 API 연결 조건을 확인하여 산정한다.</p>
    <h2>9. 검증·성과 지표</h2><ul><li>목 검토: 신규 프로젝트, 기존 프로젝트 열기, 빈 목록, 저장 실패, 생성 대기/실패/성공 샘플, 모바일 메뉴, 키보드 탐색을 모두 확인한다.</li><li>선택안 구현 후 TypeScript·Vite 빌드 통과. 브랜드 노출 검색은 화면·출력물 대상이며 Git 이력과 과거 문서는 보존한다.</li><li>후속 실연결 후: 사용자별 데이터 격리, 저장 후 재열기, 생성 실패 시 크레딧 처리, 다운로드 파일과 인쇄를 확인한다.</li><li>사용성 목표(제안): 내부 검토자 5명 중 4명 이상이 도움 없이 프로젝트 시작. 첫 기획 진입 시간 2분 이내. 실측치가 아니다.</li><li>출시 후 측정: 프로젝트 시작→첫 기획 완료율, 생성 성공률, 다운로드 도달률. 시안에서는 가상 지표를 실제 사용량처럼 표시하지 않는다.</li></ul>
    <h2>10. 미확정 사항·비목표</h2><p>외부 고객 공개 여부, 초기 크레딧·요금, 운영자·문의처, 확정 로고, 공용 자산/승인 권한, 배포 도메인은 결정 필요. 결제·팀 협업·AI 가상피팅·장치 제어·송출 스케줄·자동 다중비율 변환은 P0에 포함하지 않는다.</p>
    <p><a href="{key}-design-prd.html">후보 {key} 디자인 기준과 화면별 명세 →</a> · <a href="index.html#sources">분석 출처와 확인 한계 →</a></p>''')

TOKENS={
'A':{'brand':'#009481','primary':'#007568','primaryHover':'#005D53','onPrimary':'#FFFFFF','background':'#F4F7F6','surface':'#FFFFFF','surfaceAlt':'#E8F4F0','text':'#172B29','textSecondary':'#536861','border':'#CEDBD6','inputBorder':'#71887E','focus':'#007568','success':'#17663F','warning':'#805600','danger':'#B42318','info':'#245C96','radius':12},
'B':{'brand':'#009481','primary':'#4AD9BD','primaryHover':'#76E6D0','onPrimary':'#082B24','background':'#101817','surface':'#192523','surfaceAlt':'#223630','text':'#F1F7F4','textSecondary':'#B0C4BC','border':'#3B544A','inputBorder':'#789389','focus':'#4AD9BD','success':'#80D9AA','warning':'#F2CA77','danger':'#FFAAA1','info':'#9AC8FF','radius':8}}
for key,t in TOKENS.items():
    t.update({'fontFamily':'Pretendard, Noto Sans KR, Segoe UI, sans-serif','bodySize':16,'lineHeight':1.6,'controlHeight':48,'space':[4,8,12,16,24,32,48,64],'sidebarWidth':256 if key=='A' else 240})
(ROOT/'design-tokens.json').write_text(json.dumps(TOKENS,ensure_ascii=False,indent=2),encoding='utf-8')

for key,t in TOKENS.items():
    a=key=='A'
    color_rows=[(k,f'<span class="swatch" style="background:{t[k]}"></span><code>{t[k]}</code>',desc) for k,desc in [('brand','공식 CSS 관찰값. 장식·브랜드 식별'),('primary','주요 행동. 공식색을 그대로 쓰지 않고 대비 조정한 제안색'),('primaryHover','Hover'),('onPrimary','주요 버튼 텍스트'),('background','앱 배경'),('surface','패널'),('surfaceAlt','선택/보조 영역'),('text','본문'),('textSecondary','설명'),('border','장식 경계'),('inputBorder','입력 컨트롤 식별 경계'),('focus','키보드 포커스'),('success','완료'),('warning','확인 필요'),('danger','실패/삭제'),('info','안내')]]
    doc(f'{key}-design-prd.html',f'후보 {key} · 디자인 PRD',('E0 Brand Studio — 밝은 기업형 작업 공간' if a else 'E0 Spatial Studio — 디스플레이 중심 작업 공간'),f'''
    <h2>1. Overview · 적용 범위</h2><p>로그인 전 랜딩, 대시보드, 프로젝트 시작, 제작 4단계, 개별 생성 도구, 자산·설정·관리 화면과 내보내기 결과에 적용한다. <a href="{key}-product-prd.html">기능 PRD</a>의 요구사항을 화면과 상태로 구체화한 선택 후보이며, 두 테마를 동시에 서비스하는 요구사항은 아니다.</p>
    <h2>2. Brand Concept</h2><p>{'핵심 키워드: 신뢰·명료함·브랜드 일관성. 밝은 작업지 위에 청록색으로 다음 행동을 안내한다. 기업 워드마크와 제품 결과물이 중심이다.' if a else '핵심 키워드: 공간·몰입·정밀함. 디스플레이의 빛을 어두운 캔버스에서 강조한다. 장식적인 네온보다 결과물과 화면 비율이 중심이다.'}</p><p>회사 로고는 원본 비율을 보존하고 E0 서비스명과 분리한다. 공식 E0 로고가 없어 시안의 “E0”는 임시 텍스트 워드마크다. 공식 eone 로고를 재제작하거나 임의로 E0로 변형하지 않는다. 어두운 배경에서 원본 로고가 묻히면 밝은 보호 패널을 사용한다.</p>
    <h2>3. Design Principles</h2><ol><li>제작 결과물이 장식보다 먼저 보인다.</li><li>한 화면의 주 행동은 한 개를 우선 강조한다.</li><li>작업 단계·저장 상태·생성 상태를 구분한다.</li><li>브랜드색과 오류·경고색의 역할을 분리한다.</li><li>완료·시안·미연동 상태를 문구로 명시한다.</li></ol>
    <h2>4. Color System</h2>{table(['토큰','값','용도'],color_rows)}<p>공식 CSS의 #009481은 관찰값이고 나머지는 앱용 제안값이다. 특히 공식색 위 흰색 작은 글자는 기본 조합으로 사용하지 않는다. A는 CTA를 더 어둡게, B는 밝은 CTA 위 어두운 글자를 적용한다.</p>
    <h2>5. Typography</h2>{table(['용도','데스크톱 / 모바일','굵기·행간'],[('랜딩 타이틀','48 / 32px','700 · 1.2'),('페이지 타이틀','30 / 24px','700 · 1.35'),('섹션','22 / 20px','600 · 1.4'),('본문·입력','16 / 16px','400 · 1.6'),('버튼·라벨','14 / 14px','600 · 1.4'),('보조 메타','13 / 13px','400 · 1.5')])}<p>Pretendard를 앱 기본으로 유지하고 Noto Sans KR·Segoe UI를 대체 폰트로 사용한다. 큰 기울임 영문 장식 제목은 일반 제목으로 전환한다. 숫자는 tabular-nums. 현재 html 18px 전역 확대를 16px 기준으로 전환할 경우 rem 기반 컴포넌트 크기를 전수 확인한다.</p>
    <h2>6. Layout &amp; Spacing</h2><p>8px 중심 간격 체계(4/8/12/16/24/32/48/64), 페이지 패딩 32px·모바일 16px, 헤더 64px, 사이드바 {t['sidebarWidth']}px. 대시보드 본문 최대 1440px. 프로젝트 카드 3열 → 2열 → 1열, 최소 260px. 랜딩은 최대 1200px.</p><p>1280px 이상: {'좌측 내비 + 넓은 프로젝트 목록' if a else '좌측 내비 + 중앙 미리보기 + 320px 속성 패널'}. 768–1279px: {'프로젝트 2열' if a else '속성 패널을 아래 또는 접이식으로 이동'}. 767px 이하: 서랍형 내비와 단일 열, 작업 단계는 현재 단계와 이전/다음 버튼으로 노출. 360px 화면에서 본문 가로 스크롤 없음. 스토리보드 캔버스만 명시적으로 확대·이동 허용.</p>
    <h2>7. Components · 상태 명세</h2>{table(['구성요소','스타일','상태·동작'],[
    ('Primary button',f'높이 48px · 좌우 20px · radius {t["radius"]}px','Default→Hover 토큰, Active inset, Focus 2px+offset 2px. Disabled는 비활성 사유 제공. Loading 문구·스피너·중복 입력 차단.'),
    ('입력','높이 48px, label 상단, 도움말 하단','placeholder는 예시 전용. 오류는 아이콘+본문. 초점 이동 후 입력값 유지.'),
    ('프로젝트 카드',f'패딩 24px · radius {t["radius"]}px · 1px border','썸네일·제목·방향·단계·시간. 선택은 테두리+체크. 클릭 가능한 제목과 별도 작업 메뉴.'),
    ('사이드 메뉴','아이콘 20px · 클릭 영역 44px 이상','활성은 표식+굵기+배경. 색만으로 구별하지 않음.'),
    ('모달','너비 최대 640px, 모바일 좌우 16px','제목·닫기·취소 제공. Focus trap, Esc, 닫은 뒤 호출 버튼으로 포커스 복원.'),
    ('장면 카드','미디어 비율 유지, 내용 패널 분리','선택·생성 중·실패·완료 모두 정의. 생성 실패 시 빈 프레임+재시도.'),
    ('미리보기','contain 기본, 레터박스 허용','원본 전체 표시. 크롭은 사용자 선택에서만 적용. B는 장치 송출 검증 전 표시.'),
    ('빈 화면·로딩','단일 안내/시작 버튼, skeleton','과도한 캐릭터나 회전 장식 없음. 지연 시간 미확인 시 가짜 % 표시 금지.'),
    ('toast·알림','상태 아이콘+명확한 문구','저장 실패는 지속 안내와 재시도. 순간 toast만으로 중요한 실패를 처리하지 않음.')])}
    <h2>8. Icon &amp; Image</h2><p>기존 Lucide 아이콘을 20/24px, 일관된 stroke로 유지한다. 소담이 이미지를 기본 안내자로 사용하지 않는다. 제품·설치 공간 이미지는 출처와 사용 권한을 확보한 자산으로 구성한다. 분석용 공식 이미지는 본 문서에서 참조만 하며 앱 자산으로 자동 편입하지 않는다.</p><p>{'랜딩은 밝은 배경에 제품 결과물 2~3개를 묶어 보여준다. 작업 화면의 배경 사진은 사용하지 않는다.' if a else '랜딩은 큰 공간 비주얼 1개, 작업 화면은 차콜 단색. 디스플레이 프레임은 단순한 직사각형으로 표시하고 실제 기기 모델/크기처럼 제시하지 않는다.'} 프레임 안 문구는 생성 이미지에 의존하지 않고 UI 텍스트로 구분한다. 자동 재생 영상은 기본 무음이며 일시정지를 제공한다.</p>
    <h2>9. Data Visualization</h2><p>서버에서 확인된 장면 완료 수/전체 수를 진행률로 표현한다. 생성·저장·다운로드 상태를 별도 라벨로 표시한다. 크레딧 수량은 실제 값 또는 “데모 값” 표시를 사용한다. 회사의 설치·고객 수를 E0 성과 카드로 사용하지 않는다.</p>
    <h2>10. Accessibility</h2><ul><li>일반 텍스트 대비 4.5:1, 큰 글자와 주요 UI 경계 3:1을 검수 목표로 한다. <code>border</code>는 장식용이며 컨트롤 식별은 <code>inputBorder</code>를 사용한다.</li><li>44×44px 이상 터치 영역, 키보드 포커스 유지, 모든 아이콘 버튼에 accessible name.</li><li>확대 200%에서 주요 동작 유지. 색만으로 상태 전달하지 않음.</li><li>prefers-reduced-motion에서 입장·전환 모션 해제. 기본 전환 150ms, 반복 발광 효과 없음.</li><li>영상 음성 정보는 텍스트 대본으로도 접근 가능하게 제공. 모달·알림의 스크린리더 상태 안내.</li></ul>
    <h2>11. Do &amp; Don't</h2>{table(['권장','피할 것'],[('기업 로고와 서비스 워드마크 역할 분리','eone 로고를 E0로 임의 변형'),('목적·화면 방향에 맞춘 시작 카드','실제로 연결되지 않은 장치·송출 버튼'),('정확한 현재 단계와 상태 표기','소담 행사 혜택·기존 후원 문구 잔존'),('한정된 청록색과 명확한 경고색','성공·실패·경고를 모두 브랜드색으로 처리'),('현실적인 결과 프레임','비율 프리뷰를 실제 설치·색 정확도 보증으로 표현')])}
    <h2>12. Design Tokens · 개발 전달</h2><p><a href="design-tokens.json">전체 A/B 토큰 JSON</a>. 아래는 선택안 토큰이다. 구현 시 CSS 변수와 Tailwind <code>@theme</code>를 연결하고 동명 유틸을 중복 정의하지 않는다. 하드코딩된 blue/zinc/white 배경은 의미 토큰으로 치환한다.</p><pre>{html.escape(json.dumps(t,ensure_ascii=False,indent=2))}</pre>
    <h2>13. Screen Design Checklist · 인수 기준</h2>{table(['화면','필수 구성','검수 포인트'],[
    ('랜딩','워드마크·핵심 가치·시작 CTA·제작 흐름','모바일 줄바꿈·이미지 대비·실제 기능만 설명'),
    ('대시보드','시작 카드·최근 프로젝트·생성 도구','빈/로딩/오류/목록 모두 확인'),
    ('프로젝트 시작','목적 입력' if a else '화면 방향·공간 입력','선택을 바꿔도 사용자 입력 유지, 자동 과금 없음'),
    ('기획·이미지','단계·브리프·레퍼런스·생성 상태','이전 단계 복귀 시 데이터 유지'),
    ('스토리보드·영상','장면·미리보기·출력','세로 결과 무크롭, 인쇄는 흰 배경, 브랜드 파일명'),
    ('자산·설정·관리','기존 기능과 권한 조건','E0 문구, 미확정 요금·운영정보 숨김'),
    ('전체','360/768/1440px·키보드·확대','초점 유실·가로 넘침·잔여 소담 노출 없음')])}<p>상기 체크리스트는 구현 후 검수 조건이다. 이번 문서 생성은 앱의 기능 검증 완료를 의미하지 않는다. <a href="preview.html">방향 검토용 화면 시안 →</a></p>''')

# Two self-contained static dashboard studies with local-only switching.
preview_css='''body{background:#e6ece9}main{max-width:1500px}.switch{display:flex;gap:12px;margin:24px 0}.switch button{font:inherit;padding:12px 24px;border:1px solid #527b6c;background:white;border-radius:8px;cursor:pointer}.switch button[aria-pressed=true]{background:#102d29;color:white}.mock{--bg:#f4f7f6;--panel:#fff;--ink:#172b29;--sub:#536861;--line:#cedbd6;--cta:#007568;--on:#fff;border:1px solid #92a89f;border-radius:14px;overflow:hidden;background:var(--bg);color:var(--ink)}.mock.dark{--bg:#101817;--panel:#192523;--ink:#f1f7f4;--sub:#b0c4bc;--line:#3b544a;--cta:#4ad9bd;--on:#082b24}.bar{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--line);background:var(--panel);gap:12px}.brand{font-size:22px;font-weight:800;letter-spacing:-1px}.brand span{color:var(--cta)}.small{font-size:12px;color:var(--sub)}.shell{display:grid;grid-template-columns:200px 1fr;min-height:660px}.side{padding:24px 16px;background:var(--panel);border-right:1px solid var(--line)}.side div{padding:12px;font-size:14px}.side .active{background:var(--cta);color:var(--on);border-radius:8px}.work{padding:32px}.work h2{margin:0;border:0;padding:0;font-size:28px}.work h3{margin:22px 0 12px}.work p{color:var(--sub);font-size:14px}.mock .cta{display:inline-block;padding:10px 18px;background:var(--cta);color:var(--on);border-radius:8px;font-size:14px;font-weight:700}.row{display:flex;justify-content:space-between;align-items:center;gap:18px}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}.tile{border:1px solid var(--line);background:var(--panel);padding:20px;border-radius:12px}.tile strong{display:block;margin-top:10px}.symbol{font-size:24px;color:var(--cta)}.project{display:grid;grid-template-columns:140px 1fr auto;gap:20px;align-items:center;padding:18px;background:var(--panel);border:1px solid var(--line);border-radius:10px;margin:12px 0}.thumb{aspect-ratio:16/9;background:linear-gradient(125deg,#145348,#91cbb5);display:grid;place-items:center;color:white;font-weight:700}.workspace{display:grid;grid-template-columns:1fr 220px;gap:20px;margin-top:24px}.stage{background:#0a100f;padding:26px;border:1px solid var(--line);border-radius:8px}.screen{aspect-ratio:16/9;border:8px solid #2d3c36;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at 65% 35%,#63ad95,#143d32 65%);box-shadow:0 12px 28px #0006;text-align:center}.screen b{font-size:30px;letter-spacing:2px;color:white}.screen small{color:#d0eee1}.spec{background:var(--panel);padding:18px;border:1px solid var(--line);border-radius:8px}.spec p{border-bottom:1px solid var(--line);padding-bottom:12px}.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.pills span{border:1px solid var(--line);border-radius:6px;padding:6px 12px;font-size:13px}.pills .selected{border-color:var(--cta);color:var(--cta)}[hidden]{display:none!important}button:focus-visible,a:focus-visible{outline:3px solid #008371;outline-offset:3px}@media(max-width:1050px){.workspace{grid-template-columns:1fr}.tiles{grid-template-columns:1fr}.shell{grid-template-columns:160px 1fr}}@media(max-width:700px){.shell{grid-template-columns:1fr}.side{display:none}.work{padding:20px}.row{align-items:flex-start;flex-direction:column}.project{grid-template-columns:80px 1fr}.project>.small{grid-column:2}.bar{padding:16px}.bar>.small{display:none}.screen b{font-size:20px}.switch{flex-wrap:wrap}}'''
body='''<style>'''+preview_css+'''</style><p>아래는 방향 선택을 위한 정적 화면 시안입니다. 후보 전환만 동작하며 제작·저장·로그인은 연결되지 않습니다. 프로젝트명과 콘텐츠는 모두 가상 예시입니다. E0 텍스트 워드마크는 임시안입니다.</p><div class="switch" role="group" aria-label="디자인 후보 선택"><button aria-pressed="true" data-target="mock-a">A · 밝은 기업형</button><button aria-pressed="false" data-target="mock-b">B · 공간·디스플레이형</button></div>
<section id="mock-a" class="mock"><div class="bar"><div class="brand"><span>E0</span> AI STUDIO</div><div class="small">기업 콘텐츠 제작 공간 · 디자인 시안</div><div class="small">데모 사용자</div></div><div class="shell"><aside class="side"><div class="active">내 프로젝트</div><div>이미지 생성</div><div>동영상 생성</div><div>음성 생성</div><div>자산 보관함</div><hr><div>설정 및 도움말</div></aside><div class="work"><div class="small">WORKSPACE / OVERVIEW</div><div class="row"><h2>오늘, 어떤 콘텐츠를<br>만들까요?</h2><span class="cta">＋ 새 프로젝트</span></div><p>제품 이미지와 한 줄 메시지로 브랜드 콘텐츠를 시작하세요.</p><div class="tiles"><div class="tile"><span class="symbol">▧</span><strong>제품 소개</strong><p>제품의 특징을 장면으로 전달하세요.</p></div><div class="tile"><span class="symbol">▤</span><strong>매장 프로모션</strong><p>행사와 혜택을 짧고 명확하게.</p></div><div class="tile"><span class="symbol">◈</span><strong>기업·브랜드 소개</strong><p>우리 브랜드의 이야기를 만들어보세요.</p></div></div><h3>최근 프로젝트 <span class="small">가상 예시</span></h3><div class="project"><div class="thumb">NEW FORM</div><div><b>신제품 소개 영상</b><div class="small">16:9 · 30초 · 스토리보드 검토</div></div><span class="small">샘플 데이터</span></div><div class="project"><div class="thumb" style="background:#416657">AUTUMN</div><div><b>가을 매장 프로모션</b><div class="small">9:16 · 15초 · 기획 단계</div></div><span class="small">샘플 데이터</span></div></div></div></section>
<section id="mock-b" class="mock dark" hidden><div class="bar"><div class="brand"><span>E0</span> SPATIAL STUDIO</div><div class="small">공간 콘텐츠 제작 · 디자인 시안</div><div class="small">데모 사용자</div></div><div class="shell"><aside class="side"><div class="active">내 프로젝트</div><div>이미지 생성</div><div>동영상 생성</div><div>음성 생성</div><div>자산 보관함</div><hr><div>설정 및 도움말</div></aside><div class="work"><div class="small">CONTENT FOR YOUR SPACE</div><div class="row"><h2>어떤 화면을 위한<br>콘텐츠인가요?</h2><span class="cta">＋ 화면 선택하고 시작</span></div><p>화면 방향을 정하고, 공간에 어울리는 장면을 기획하세요.</p><div class="pills"><span class="selected">✓ 가로 화면 16:9</span><span>세로 화면 9:16</span></div><div class="workspace"><div class="stage"><div class="screen"><small>가상 프로모션 콘텐츠</small><b>A NEW<br>PERSPECTIVE</b><small>SPACE · LIGHT · EXPERIENCE</small></div><p class="small">비율 확인용 · 실제 디스플레이 송출 검증 전</p><div class="pills"><span>기획</span><span>이미지</span><span class="selected">스토리보드</span><span>영상</span></div></div><div class="spec"><b>화면 브리프</b><p>사용 공간<br><strong>매장 · 가상 예시</strong></p><p>방향<br><strong>가로 16:9</strong></p><p>검토 방식<br><strong>무음 검토</strong></p><span class="small">확장 해상도·CMS 연결은 후속 검토 항목입니다.</span></div></div><h3>최근 프로젝트 <span class="small">가상 예시</span></h3><div class="project"><div class="thumb">LIGHT / 01</div><div><b>쇼룸 신제품 콘텐츠</b><div class="small">가로 화면 · 검토 필요</div></div><span class="small">샘플 데이터</span></div></div></div></section>
<h2>랜딩에 적용할 메시지</h2><div class="grid"><article class="card"><h3>A · 브랜드의 아이디어를,<br>완성도 있는 영상으로.</h3><p>기획부터 이미지와 영상 제작까지.<br>E0 AI Studio에서 브랜드 콘텐츠를 준비하세요.</p><b>CTA: 콘텐츠 만들기</b><p>화이트 배경 · 기업 워드마크 · 결과물 카드 · 4단계 안내</p></article><article class="card" style="background:#101817;color:#f1f7f4"><h3>B · 공간을 채우는 콘텐츠,<br>화면에서 시작하다.</h3><p>가로·세로 화면에 맞춰 장면을 기획하고,<br>공간에 어울리는 콘텐츠를 만들어보세요.</p><b style="color:#4ad9bd">CTA: 화면 선택하고 시작하기</b><p>차콜 배경 · 공간 비주얼 · 화면 방향 · 프레임 검토</p></article></div><script>document.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-target]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));document.querySelectorAll('.mock').forEach(panel=>panel.hidden=panel.id!==button.dataset.target)}));</script>'''
doc('preview.html','E0 디자인 후보 화면 비교','A · Brand Studio / B · Spatial Studio',body)
print('Generated 6 HTML documents and design-tokens.json')
