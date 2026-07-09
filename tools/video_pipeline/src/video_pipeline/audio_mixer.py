"""
Audio Mixer

Combines narration audio tracks and mixes with video/BGM using FFmpeg.
"""

import os
import subprocess
from typing import Any


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------

def _run_ffmpeg(cmd: list[str]) -> None:
    """Run FFmpeg command and raise on error.

    Args:
        cmd: FFmpeg command as list of arguments.

    Raises:
        Exception: If FFmpeg fails.
    """
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if result.returncode != 0:
        raise Exception(f"FFmpeg failed: {result.stderr}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def concatenate_audio(
    audio_paths: list[str],
    output_path: str,
    gap: float = 0.3
) -> str:
    """Concatenate audio files with optional gap between them.

    Args:
        audio_paths: List of audio file paths to concatenate.
        output_path: Path to save concatenated audio.
        gap: Silence gap in seconds between audio files.

    Returns:
        Path to the concatenated audio file.

    Raises:
        Exception: If FFmpeg fails.
    """
    if not audio_paths:
        raise ValueError("No audio files to concatenate")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Create filter_complex for concatenation with gaps
    # For each audio: adelay adds silence at the start
    # Calculate cumulative delay for each clip
    filter_parts = []
    inputs = []

    for i, path in enumerate(audio_paths):
        inputs.extend(["-i", path])
        delay_ms = int(gap * 1000 * i)  # Convert to milliseconds
        if delay_ms > 0:
            filter_parts.append(f"[{i}:a]adelay={delay_ms}|{delay_ms}[a{i}]")
        else:
            filter_parts.append(f"[{i}:a]acopy[a{i}]")

    # Concatenate all delayed streams
    concat_inputs = "".join([f"[a{i}]" for i in range(len(audio_paths))])
    filter_parts.append(f"{concat_inputs}concat=n={len(audio_paths)}:v=0:a=1[out]")

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        output_path,
    ]

    _run_ffmpeg(cmd)
    return output_path


def mix_narration_with_video(
    video_path: str,
    audio_paths: list[str],
    scenes: list,
    output_path: str,
    clip_duration: float = 5.0,
    crossfade: float = 0.5
) -> str:
    """Align each narration audio to its corresponding scene timing in the video.

    Args:
        video_path: Path to the input video.
        audio_paths: List of narration audio file paths (one per scene).
        scenes: List of Scene objects (for ordering).
        output_path: Path to save output video with narration.
        clip_duration: Duration of each video clip in seconds.
        crossfade: Crossfade duration between clips in seconds.

    Returns:
        Path to the output video.

    Raises:
        Exception: If FFmpeg fails.
    """
    if not audio_paths:
        raise ValueError("No audio files to mix")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Calculate timing for each scene
    # With crossfade, each clip starts (clip_duration - crossfade) after the previous
    inputs = ["-i", video_path]
    filter_parts = []

    for i, audio_path in enumerate(audio_paths):
        inputs.extend(["-i", audio_path])

        # Calculate start time for this scene
        # First scene starts at 0
        # Each subsequent scene starts at: (clip_duration - crossfade) * scene_index
        start_time = (clip_duration - crossfade) * i
        delay_ms = int(start_time * 1000)

        # Add delay to align with scene timing
        filter_parts.append(f"[{i + 1}:a]adelay={delay_ms}|{delay_ms}[a{i}]")

    # Mix all delayed narrations together
    concat_inputs = "".join([f"[a{i}]" for i in range(len(audio_paths))])
    filter_parts.append(f"{concat_inputs}amix=inputs={len(audio_paths)}:normalize=0[out]")

    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg",
        "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v",  # Copy video from input
        "-map", "[out]",  # Use mixed narration audio
        "-c:v", "copy",  # Copy video codec (no re-encode)
        "-c:a", "aac",  # Encode audio as AAC
        "-b:a", "192k",  # Audio bitrate
        output_path,
    ]

    _run_ffmpeg(cmd)
    return output_path


def add_bgm(
    video_path: str,
    bgm_path: str,
    volume: float = 0.15,
    output_path: str = None
) -> str:
    """Mix BGM at specified volume level with video.

    Args:
        video_path: Path to the input video.
        bgm_path: Path to the background music file.
        volume: BGM volume (0.0 to 1.0, default: 0.15).
        output_path: Path to save output video. If None, uses video_path with _bgm suffix.

    Returns:
        Path to the output video.

    Raises:
        Exception: If FFmpeg fails.
    """
    if not output_path:
        base, ext = os.path.splitext(video_path)
        output_path = f"{base}_bgm{ext}"

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Mix BGM with video audio
    # Loop BGM if it's shorter than video, fade in/out
    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-stream_loop", "-1",  # Loop BGM
        "-i", bgm_path,
        "-filter_complex",
        f"[1:a]volume={volume}[bgm];"
        f"[0:a][bgm]amix=inputs=2:duration=first[out]",
        "-map", "0:v",
        "-map", "[out]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",  # End when video ends
        output_path,
    ]

    _run_ffmpeg(cmd)
    return output_path
