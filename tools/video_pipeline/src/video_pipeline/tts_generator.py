"""
TTS Generator

Generates Korean narration audio from scene scripts using the Gemini TTS API.
"""

import base64
import json
import os
import struct
import time
import urllib.request
import urllib.error
from typing import Any

from . import config

# Rate limit: Gemini TTS allows ~10 requests/minute
_RATE_LIMIT_DELAY = 7.0  # seconds between requests (safe margin)
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 45.0  # seconds to wait on 429 error


# ---------------------------------------------------------------------------
# WAV Header
# ---------------------------------------------------------------------------

def _wrap_pcm_as_wav(
    pcm_data: bytes,
    sample_rate: int = 24000,
    num_channels: int = 1,
    bits_per_sample: int = 16,
) -> bytes:
    """Wrap raw PCM data in a WAV file header."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_data)
    file_size = 36 + data_size

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        file_size,
        b"WAVE",
        b"fmt ",
        16,  # chunk size
        1,   # PCM format
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        data_size,
    )
    return header + pcm_data


# ---------------------------------------------------------------------------
# Gemini TTS API
# ---------------------------------------------------------------------------

def _call_gemini_tts(text: str, voice: str = "Kore") -> bytes:
    """Call Gemini TTS API and return audio bytes.

    Args:
        text: Text to convert to speech.
        voice: Voice name (default: Kore for Korean).

    Returns:
        Audio bytes in WAV format.

    Raises:
        Exception: If API call fails.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_TTS_MODEL}:generateContent"

    request_data = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "response_modalities": ["AUDIO"],
            "speech_config": {
                "voice_config": {
                    "prebuilt_voice_config": {
                        "voice_name": voice
                    }
                }
            }
        }
    }

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": config.GEMINI_API_KEY,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(request_data).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            response_data = json.loads(response.read().decode("utf-8"))

        # Extract base64 audio from response
        if "candidates" not in response_data:
            raise Exception(f"Unexpected API response: {response_data}")

        candidate = response_data["candidates"][0]
        parts = candidate.get("content", {}).get("parts", [])

        if not parts:
            raise Exception("No audio data in response")

        inline_data = parts[0].get("inlineData", {})
        audio_b64 = inline_data.get("data", "")

        if not audio_b64:
            raise Exception("No base64 audio data found")

        # Decode base64 to raw PCM bytes
        pcm_bytes = base64.b64decode(audio_b64)

        # Wrap raw PCM in WAV container (Gemini returns raw 24kHz 16-bit mono PCM)
        wav_bytes = _wrap_pcm_as_wav(pcm_bytes)
        return wav_bytes

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise Exception(f"Gemini TTS API error {e.code}: {error_body}")
    except Exception as e:
        raise Exception(f"TTS generation failed: {e}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_tts(text: str, output_path: str, voice: str = "Kore") -> str:
    """Generate TTS audio for a single text.

    Args:
        text: Text to convert to speech.
        output_path: Path to save audio file (should end in .wav).
        voice: Voice name (default: Kore).

    Returns:
        Path to the saved audio file.

    Raises:
        Exception: If TTS generation fails.
    """
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Call API
    audio_bytes = _call_gemini_tts(text, voice)

    # Save to file
    with open(output_path, "wb") as f:
        f.write(audio_bytes)

    return output_path


def generate_all_tts(
    scenes: list,
    output_dir: str,
    voice: str = "Kore"
) -> list[dict[str, Any]]:
    """Generate TTS for all scenes.

    Args:
        scenes: List of Scene objects with script_kr attribute.
        output_dir: Directory to save audio files.
        voice: Voice name (default: Kore).

    Returns:
        List of dicts with keys: scene, audio_path, success, error.
    """
    os.makedirs(output_dir, exist_ok=True)
    results: list[dict[str, Any]] = []

    for idx, scene in enumerate(scenes):
        result = {
            "scene": scene,
            "audio_path": None,
            "success": False,
            "error": None,
        }

        # Skip if no Korean script
        if not scene.script_kr or not scene.script_kr.strip():
            result["error"] = "No Korean script"
            results.append(result)
            continue

        audio_path = os.path.join(output_dir, f"{scene.cut_label}.wav")

        # Skip if already exists and valid (>1KB)
        if os.path.isfile(audio_path) and os.path.getsize(audio_path) > 1024:
            print(f"    {scene.cut_label}: Using cached audio")
            result["audio_path"] = audio_path
            result["success"] = True
            results.append(result)
            continue

        # Generate audio with retry on rate limit
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                # Rate limit delay (skip on first request)
                if idx > 0 or attempt > 1:
                    delay = _RATE_LIMIT_DELAY if attempt == 1 else _RETRY_BASE_DELAY
                    print(f"    {scene.cut_label}: Waiting {delay:.0f}s (rate limit)...")
                    time.sleep(delay)

                generate_tts(scene.script_kr, audio_path, voice)
                result["audio_path"] = audio_path
                result["success"] = True
                print(f"    {scene.cut_label}: TTS generated")
                break

            except Exception as e:
                error_str = str(e)
                if "429" in error_str and attempt < _MAX_RETRIES:
                    print(f"    {scene.cut_label}: Rate limited, retry {attempt}/{_MAX_RETRIES}...")
                    continue
                result["error"] = error_str

        results.append(result)

    return results
