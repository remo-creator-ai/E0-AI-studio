"""
REMO AI Studio - Video Pipeline Configuration

All configurable settings for the storyboard-to-video pipeline.
API keys, video specs, FFmpeg settings, and output paths.
"""

import os

# ---------------------------------------------------------------------------
# Kling AI API
# ---------------------------------------------------------------------------
KLING_ACCESS_KEY_ID: str = os.getenv(
    "KLING_ACCESS_KEY_ID", "AJhrfJp8JFGRBL4HMQyFAybYeyFAEMRY"
)
KLING_ACCESS_KEY_SECRET: str = os.getenv(
    "KLING_ACCESS_KEY_SECRET", "gQpEY8bnkbKTKmDKfpmMTaFCgpyfhE9H"
)
KLING_API_BASE: str = "https://api.klingai.com"
KLING_MODEL: str = "kling-v1"
KLING_MODE: str = "std"          # "std" or "pro"
KLING_DURATION: str = "5"        # seconds per clip ("5" or "10")
KLING_ASPECT: str = "16:9"
KLING_CFG_SCALE: float = 0.5
KLING_NEGATIVE_PROMPT: str = ""

# ---------------------------------------------------------------------------
# Pipeline behaviour
# ---------------------------------------------------------------------------
OUTPUT_DIR: str = "output"
MAX_CONCURRENT: int = 3          # parallel API calls
POLL_INTERVAL: int = 5           # seconds between polls
POLL_TIMEOUT: int = 300          # 5 minutes max per task
MAX_RETRIES: int = 3             # retries on transient errors
RETRY_DELAY: int = 10            # seconds between retries

# ---------------------------------------------------------------------------
# FFmpeg / video composition
# ---------------------------------------------------------------------------
CROSSFADE_DURATION: float = 0.5  # seconds of xfade between clips
VIDEO_FPS: int = 30
VIDEO_RESOLUTION: str = "1920x1080"
VIDEO_CODEC: str = "libx264"
VIDEO_CRF: int = 18              # quality (lower = better, 18 is visually lossless)
AUDIO_CODEC: str = "aac"

# ---------------------------------------------------------------------------
# Sub-directory names under OUTPUT_DIR
# ---------------------------------------------------------------------------
IMAGES_SUBDIR: str = "images"
CLIPS_SUBDIR: str = "clips"
FINAL_SUBDIR: str = "final"
AUDIO_SUBDIR: str = "audio"

# ---------------------------------------------------------------------------
# TTS Settings (Gemini API)
# ---------------------------------------------------------------------------
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_TTS_MODEL: str = "gemini-2.5-flash-preview-tts"
GEMINI_TTS_VOICE: str = "Kore"  # Korean voice
TTS_SAMPLE_RATE: int = 24000

# ---------------------------------------------------------------------------
# Audio Mixing Settings
# ---------------------------------------------------------------------------
BGM_VOLUME: float = 0.15
NARRATION_GAP: float = 0.3  # seconds between narrations
