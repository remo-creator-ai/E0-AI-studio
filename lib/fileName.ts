// 다운로드 파일명에 쓸 프로젝트 제목 슬러그.
//
// 제목을 그대로 파일명에 넣으면 두 가지가 터진다.
// 1) 길이 — Windows 는 전체 경로 260자 제한이 있어, 긴 제목의 zip 을 탐색기에서
//    풀면 `다운로드\SODAM_Assets_<긴제목>\assets\Cut_01.png` 가 한도를 넘어
//    "압축이 안 열린다" 로 보인다. 그래서 40자에서 자른다.
// 2) 문자 — `< > : " / \ | ? *` 는 Windows 파일명 금지 문자. 기본 제목의 끝 `...`
//    도 폴더명으로는 불량이라(Windows 가 끝 점을 잘라 버림) 끝 점·하이픈을 정리한다.

/** 프로젝트 제목 → 파일명 안전 슬러그 */
export function slugifyForFile(title: string, fallback = 'sodam'): string {
  const s = title.trim()
    .replace(/[<>:"/\|?*]+/g, '')  // 파일명 금지 문자
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/[.\-\s]+$/g, '');     // 잘린 뒤 끝에 남는 점/하이픈 (`제목...` → `제목`)
  return s || fallback;
}
