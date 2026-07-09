# Video Pipeline (운영진용 CLI 도구)

REMO AI Studio에서 export한 `.storyboard` JSON 파일을 받아서 Kling AI image-to-video API로 영상을 자동 생성하는 도구입니다.

웹 앱의 `production-attachments` 버킷에 쌓이는 의뢰서를 받아 운영진이 영상으로 만들 때 사용합니다.

## 의존성 설치

```bash
pip install requests google-genai
# FFmpeg는 시스템에 설치되어 있어야 합니다 (영상 합성 + 자막 + 오디오 믹싱)
```

## 환경변수

- `KLING_ACCESS_KEY_ID`, `KLING_ACCESS_KEY_SECRET` — Kling API 자격
- `GEMINI_API_KEY` — TTS 내레이션용 (선택)

## 기본 사용법

```bash
# Dry run (JSON 파싱 + 이미지 추출만, API 호출 없음)
python run.py storyboard.storyboard --dry-run

# 기본 옵션으로 영상 생성 (std 모드, 5초 클립, 3개 병렬, TTS 포함)
python run.py storyboard.storyboard

# pro 모드, 10초 클립, 5개 동시 처리
python run.py storyboard.storyboard --mode pro --duration 10 -c 5

# TTS 내레이션 생략
python run.py storyboard.storyboard --no-tts

# 배경음악 추가
python run.py storyboard.storyboard --bgm music.mp3
```

## 추가 도구

- `compose_only.py` — 이미 생성된 클립들로 합성만 다시 실행
- `tts_only.py` — TTS 내레이션 생성만 단독 실행

## 출력 구조

```
output/
├── images/      # 추출된 scene 이미지
├── clips/       # Kling 생성 개별 영상
├── audio/       # TTS 오디오
└── final/       # 합성 결과
```

## Vercel 배포 영향

이 폴더(`tools/`)는 `.vercelignore`에 등록되어 Vercel 빌드에 포함되지 않습니다. 로컬 운영용 도구입니다.
