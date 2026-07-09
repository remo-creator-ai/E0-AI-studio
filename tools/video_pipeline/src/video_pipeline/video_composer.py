"""
Video Composer

FFmpeg-based video composition: concatenation with crossfade transitions,
subtitle overlay, and clip trimming.
"""

import os
import subprocess
import shutil
from typing import Sequence

from . import config
from .storyboard_parser import Scene


def _check_ffmpeg() -> str:
    """Return ffmpeg binary path or raise."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "ffmpeg not found in PATH. Install it: sudo apt install ffmpeg"
        )
    return ffmpeg


def _run_ffmpeg(args: list[str], description: str = "") -> None:
    """Run an ffmpeg command and raise on failure."""
    ffmpeg = _check_ffmpeg()
    cmd = [ffmpeg, "-y"] + args  # -y to overwrite without asking
    desc = description or " ".join(cmd[:6])
    print(f"  [ffmpeg] {desc}")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10 minute timeout for large operations
    )

    if result.returncode != 0:
        stderr_tail = result.stderr[-2000:] if result.stderr else "(no stderr)"
        raise RuntimeError(
            f"ffmpeg failed (exit {result.returncode}): {stderr_tail}"
        )


def trim_clip(
    input_path: str,
    duration: float,
    output_path: str,
) -> str:
    """Trim a video clip to a specific duration.

    Args:
        input_path: Path to input video file.
        duration: Target duration in seconds.
        output_path: Path for the trimmed output file.

    Returns:
        The output_path.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    _run_ffmpeg(
        [
            "-i", input_path,
            "-t", str(duration),
            "-c", "copy",
            output_path,
        ],
        description=f"Trimming to {duration}s: {os.path.basename(input_path)}",
    )
    return output_path


def concatenate_clips(
    clip_paths: Sequence[str],
    output_path: str,
    crossfade: float | None = None,
) -> str:
    """Concatenate video clips with crossfade transitions.

    Uses FFmpeg xfade filter for smooth transitions between clips.
    Falls back to simple concat demuxer if only one clip or crossfade=0.

    Args:
        clip_paths: Ordered list of clip file paths.
        output_path: Path for the final concatenated video.
        crossfade: Crossfade duration in seconds (None uses config default).

    Returns:
        The output_path.

    Raises:
        ValueError: If no clips provided.
        RuntimeError: If ffmpeg fails.
    """
    if not clip_paths:
        raise ValueError("No clips to concatenate")

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    xfade = crossfade if crossfade is not None else config.CROSSFADE_DURATION

    # Single clip: just copy
    if len(clip_paths) == 1:
        _run_ffmpeg(
            ["-i", clip_paths[0], "-c", "copy", output_path],
            description="Copying single clip",
        )
        return output_path

    # No crossfade: use concat demuxer (faster)
    if xfade <= 0:
        return _concat_demuxer(clip_paths, output_path)

    # Multiple clips with crossfade: use xfade filter chain
    return _concat_xfade(clip_paths, output_path, xfade)


def _concat_demuxer(clip_paths: Sequence[str], output_path: str) -> str:
    """Concatenate clips using FFmpeg concat demuxer (no transitions)."""
    # Write concat list file
    list_path = output_path + ".concat.txt"
    with open(list_path, "w") as f:
        for path in clip_paths:
            # Escape single quotes in path for ffmpeg
            escaped = os.path.abspath(path).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    try:
        _run_ffmpeg(
            [
                "-f", "concat",
                "-safe", "0",
                "-i", list_path,
                "-c", "copy",
                output_path,
            ],
            description=f"Concatenating {len(clip_paths)} clips (no crossfade)",
        )
    finally:
        if os.path.exists(list_path):
            os.remove(list_path)

    return output_path


def _get_clip_duration(clip_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        # Fall back to configured duration
        return float(config.KLING_DURATION)

    result = subprocess.run(
        [
            ffprobe, "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            clip_path,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode == 0 and result.stdout.strip():
        try:
            return float(result.stdout.strip())
        except ValueError:
            pass

    return float(config.KLING_DURATION)


def _concat_xfade(
    clip_paths: Sequence[str],
    output_path: str,
    xfade_duration: float,
) -> str:
    """Concatenate clips using xfade filter for crossfade transitions.

    Normalizes all clips to 1280x720 first (scale + pad), then builds
    a filter_complex chain like:
        [0]scale=1280:720:...,setsar=1[s0];
        [1]scale=1280:720:...,setsar=1[s1];
        [s0][s1]xfade=transition=fade:duration=0.5:offset=4.5[v01];
        [v01][s2]xfade=transition=fade:duration=0.5:offset=9.0[v02];
        ...
    """
    n = len(clip_paths)

    # Get durations for offset calculation
    durations = [_get_clip_duration(p) for p in clip_paths]

    # Build input args
    input_args: list[str] = []
    for path in clip_paths:
        input_args.extend(["-i", path])

    # Build filter chain: first normalize all inputs to 1280x720
    filter_parts: list[str] = []
    for i in range(n):
        filter_parts.append(
            f"[{i}]scale=1280:720:force_original_aspect_ratio=decrease,"
            f"pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[s{i}]"
        )

    # Build xfade filter chain using normalized streams [s0], [s1], ...
    cumulative_duration = durations[0]

    for i in range(1, n):
        offset = cumulative_duration - xfade_duration
        if offset < 0:
            offset = 0

        if i == 1:
            src = f"[s0][s1]"
        else:
            src = f"[v{i - 2:02d}][s{i}]"

        if i == n - 1:
            dst = "[vfinal]"
        else:
            dst = f"[v{i - 1:02d}]"

        filter_parts.append(
            f"{src}xfade=transition=fade:duration={xfade_duration}:offset={offset}{dst}"
        )

        cumulative_duration = offset + durations[i]

    filter_complex = ";".join(filter_parts)

    _run_ffmpeg(
        input_args + [
            "-filter_complex", filter_complex,
            "-map", "[vfinal]",
            "-c:v", config.VIDEO_CODEC,
            "-crf", str(config.VIDEO_CRF),
            "-preset", "medium",
            "-r", str(config.VIDEO_FPS),
            "-pix_fmt", "yuv420p",
            output_path,
        ],
        description=f"Concatenating {n} clips with {xfade_duration}s crossfade",
    )

    return output_path


def add_subtitles(
    video_path: str,
    scenes: Sequence[Scene],
    output_path: str,
    clip_duration: float | None = None,
    crossfade: float | None = None,
) -> str:
    """Burn Korean subtitles into the video.

    Creates an SRT subtitle file from scene scripts, then uses FFmpeg
    to burn them into the video.

    Args:
        video_path: Input video file path.
        scenes: List of Scene objects with script_kr text.
        output_path: Path for the subtitled video.
        clip_duration: Duration of each clip in seconds (defaults to config).
        crossfade: Crossfade duration in seconds (defaults to config).

    Returns:
        The output_path.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    dur = clip_duration or float(config.KLING_DURATION)
    xf = crossfade if crossfade is not None else config.CROSSFADE_DURATION

    # Generate SRT file
    srt_path = output_path + ".srt"
    with open(srt_path, "w", encoding="utf-8") as f:
        offset = 0.0
        for i, scene in enumerate(scenes):
            if not scene.script_kr.strip():
                offset += dur - (xf if i < len(scenes) - 1 else 0)
                continue

            start = offset
            end = offset + dur - (xf if i < len(scenes) - 1 else 0)
            # Clamp subtitle to visible time
            end = min(end, start + dur)

            f.write(f"{i + 1}\n")
            f.write(f"{_srt_time(start)} --> {_srt_time(end)}\n")
            f.write(f"{scene.script_kr.strip()}\n\n")

            offset = end

    try:
        # Escape SRT path for FFmpeg subtitle filter
        # On Linux, colons in paths need escaping, backslashes need doubling
        escaped_srt = srt_path.replace("\\", "\\\\").replace(":", "\\:")
        escaped_srt = escaped_srt.replace("'", "\\'")

        _run_ffmpeg(
            [
                "-i", video_path,
                "-vf", f"subtitles='{escaped_srt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,BorderStyle=3,BackColour=&H80000000,Alignment=2,MarginV=30'",
                "-c:v", config.VIDEO_CODEC,
                "-crf", str(config.VIDEO_CRF),
                "-preset", "medium",
                "-c:a", "copy",
                output_path,
            ],
            description="Burning Korean subtitles",
        )
    finally:
        if os.path.exists(srt_path):
            os.remove(srt_path)

    return output_path


def _srt_time(seconds: float) -> str:
    """Convert seconds to SRT timestamp format HH:MM:SS,mmm."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
