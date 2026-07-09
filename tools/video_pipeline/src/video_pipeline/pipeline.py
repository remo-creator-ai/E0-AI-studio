"""
Pipeline Orchestrator

Main entry point for the storyboard-to-video pipeline.
Coordinates parsing, image extraction, parallel Kling API calls,
polling, downloading, and final video composition.
"""

import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from . import config
from . import storyboard_parser
from . import kling_client
from . import video_composer
from . import tts_generator
from . import audio_mixer
from .storyboard_parser import Scene, Storyboard


# ---------------------------------------------------------------------------
# Thread-safe progress printer
# ---------------------------------------------------------------------------

_print_lock = threading.Lock()


def _log(scene_idx: int, total: int, label: str, msg: str) -> None:
    """Thread-safe progress log."""
    with _print_lock:
        print(f"  [{scene_idx}/{total}] {label}: {msg}")


# ---------------------------------------------------------------------------
# Per-scene video generation (runs in thread pool)
# ---------------------------------------------------------------------------

def _generate_clip(
    scene: Scene,
    scene_idx: int,
    total: int,
    clips_dir: str,
    mode: str,
    duration: str,
) -> dict[str, Any]:
    """Submit, poll, and download a single scene's video clip.

    Returns a result dict with keys: scene, clip_path, success, error, elapsed.
    """
    label = scene.cut_label.upper()
    result: dict[str, Any] = {
        "scene": scene,
        "clip_path": None,
        "success": False,
        "error": None,
        "elapsed": 0.0,
    }
    t0 = time.time()

    try:
        # Submit
        _log(scene_idx, total, label, "Submitting to Kling API...")
        task_id = kling_client.submit_image2video(
            image_base64=scene.image_base64,
            prompt=scene.video_motion_en,
            mode=mode,
            duration=duration,
        )
        _log(scene_idx, total, label, f"Task submitted (task_id: {task_id})")

        # Poll
        def _poll_progress(attempt: int, max_attempts: int) -> None:
            _log(
                scene_idx, total, label,
                f"Polling... (attempt {attempt}/{max_attempts})",
            )

        video_url = kling_client.poll_task(
            task_id,
            progress_callback=_poll_progress,
        )
        _log(scene_idx, total, label, "Video ready! Downloading...")

        # Download
        clip_path = os.path.join(clips_dir, f"{scene.cut_label}.mp4")
        kling_client.download_video(video_url, clip_path)

        file_size = os.path.getsize(clip_path)
        size_mb = file_size / (1024 * 1024)
        elapsed = time.time() - t0

        _log(
            scene_idx, total, label,
            f"Done ({duration}s clip, {size_mb:.1f}MB, took {elapsed:.0f}s)",
        )

        result["clip_path"] = clip_path
        result["success"] = True
        result["elapsed"] = elapsed

    except Exception as exc:
        elapsed = time.time() - t0
        result["error"] = str(exc)
        result["elapsed"] = elapsed
        _log(scene_idx, total, label, f"FAILED: {exc}")

    return result


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run(
    storyboard_path: str,
    output_dir: str = "output",
    max_concurrent: int = 3,
    mode: str = "std",
    duration: str = "5",
    dry_run: bool = False,
    skip_tts: bool = False,
    tts_voice: str = "Kore",
    bgm_path: str = None,
) -> str | None:
    """Execute the full storyboard-to-video pipeline.

    Steps:
        1. Parse storyboard
        2. Extract images
        3. Submit all Kling jobs (parallel)
        4. Poll and download all clips
        5. Concatenate with crossfade
        6. Add subtitles
        7. Generate TTS narration (optional)
        8. Mix narration with video (optional)
        9. Add BGM (optional)
        10. Print summary

    Args:
        storyboard_path: Path to .storyboard JSON file.
        output_dir: Base output directory.
        max_concurrent: Max parallel Kling API calls.
        mode: Kling quality mode ("std" or "pro").
        duration: Per-clip duration ("5" or "10").
        dry_run: If True, parse and extract images only (no API calls).
        skip_tts: If True, skip TTS narration generation.
        tts_voice: Voice name for TTS (default: Kore).
        bgm_path: Optional path to background music file.

    Returns:
        Path to the final video, or None on dry run / total failure.
    """
    pipeline_start = time.time()

    print("=" * 70)
    print("  REMO AI Studio - Storyboard to Video Pipeline")
    print("=" * 70)
    print()

    # -----------------------------------------------------------------------
    # Step 1: Parse storyboard
    # -----------------------------------------------------------------------
    print("[Step 1/8] Parsing storyboard...")
    storyboard = storyboard_parser.parse(storyboard_path)
    print(f"  Title: {storyboard.title}")
    print(f"  Style: {storyboard.style}")
    print(f"  Duration: {storyboard.duration}s target")
    print(f"  Scenes: {storyboard.scene_count}")
    print()

    # -----------------------------------------------------------------------
    # Step 2: Extract images
    # -----------------------------------------------------------------------
    images_dir = os.path.join(output_dir, config.IMAGES_SUBDIR)
    print(f"[Step 2/8] Extracting {storyboard.scene_count} images to {images_dir}/...")
    image_paths = storyboard_parser.extract_images(storyboard.scenes, images_dir)
    print(f"  Extracted {len(image_paths)} images")
    print()

    # -----------------------------------------------------------------------
    # Print scene details
    # -----------------------------------------------------------------------
    print("-" * 70)
    print("  Scene Details")
    print("-" * 70)
    for scene in storyboard.scenes:
        img_size = ""
        if scene.image_path and os.path.exists(scene.image_path):
            size_kb = os.path.getsize(scene.image_path) / 1024
            img_size = f" ({size_kb:.0f}KB)"
        print(f"  {scene.cut_label.upper()}: {scene.content_kr}")
        print(f"    Motion: {scene.video_motion_en}")
        print(f"    Image:  {scene.image_path}{img_size}")
        print()

    if dry_run:
        print("=" * 70)
        print("  DRY RUN COMPLETE - No API calls made")
        print(f"  Images saved to: {os.path.abspath(images_dir)}")
        elapsed = time.time() - pipeline_start
        print(f"  Time: {elapsed:.1f}s")
        print("=" * 70)
        return None

    # -----------------------------------------------------------------------
    # Step 3 & 4: Submit, poll, and download all clips (parallel)
    # -----------------------------------------------------------------------
    clips_dir = os.path.join(output_dir, config.CLIPS_SUBDIR)
    os.makedirs(clips_dir, exist_ok=True)

    total = storyboard.scene_count
    print(f"[Step 3/8] Generating {total} video clips via Kling API...")
    print(f"  Mode: {mode} | Duration: {duration}s | Concurrent: {max_concurrent}")
    print()

    results: list[dict[str, Any]] = [{}] * total  # placeholder

    with ThreadPoolExecutor(max_workers=max_concurrent) as executor:
        future_to_idx: dict[Any, int] = {}

        for i, scene in enumerate(storyboard.scenes):
            future = executor.submit(
                _generate_clip,
                scene=scene,
                scene_idx=i + 1,
                total=total,
                clips_dir=clips_dir,
                mode=mode,
                duration=duration,
            )
            future_to_idx[future] = i

        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception as exc:
                results[idx] = {
                    "scene": storyboard.scenes[idx],
                    "clip_path": None,
                    "success": False,
                    "error": str(exc),
                    "elapsed": 0.0,
                }

    print()

    # -----------------------------------------------------------------------
    # Collect successful clips in order
    # -----------------------------------------------------------------------
    successful_clips: list[str] = []
    failed_scenes: list[dict[str, Any]] = []

    for r in results:
        if r.get("success") and r.get("clip_path"):
            successful_clips.append(r["clip_path"])
        else:
            failed_scenes.append(r)

    if not successful_clips:
        print("ERROR: All scenes failed. No video generated.")
        _print_failures(failed_scenes)
        return None

    # -----------------------------------------------------------------------
    # Step 4: Concatenate clips with crossfade
    # -----------------------------------------------------------------------
    final_dir = os.path.join(output_dir, config.FINAL_SUBDIR)
    os.makedirs(final_dir, exist_ok=True)
    final_path = os.path.join(final_dir, f"{storyboard.safe_title}_final.mp4")

    print(f"[Step 4/8] Composing final video from {len(successful_clips)} clips...")
    video_composer.concatenate_clips(
        successful_clips,
        final_path,
        crossfade=config.CROSSFADE_DURATION,
    )
    print(f"  Output: {os.path.abspath(final_path)}")
    print()

    # -----------------------------------------------------------------------
    # Optional: Subtitles
    # -----------------------------------------------------------------------
    subtitled_path = os.path.join(
        final_dir, f"{storyboard.safe_title}_subtitled.mp4"
    )
    print("[Step 5/8] Adding Korean subtitles...")
    try:
        # Only include scenes that succeeded (in order)
        successful_scenes = [
            r["scene"] for r in results if r.get("success")
        ]
        video_composer.add_subtitles(
            final_path,
            successful_scenes,
            subtitled_path,
            clip_duration=float(duration),
            crossfade=config.CROSSFADE_DURATION,
        )
        print(f"  Output: {os.path.abspath(subtitled_path)}")
    except Exception as exc:
        print(f"  WARNING: Subtitle generation failed: {exc}")
        print(f"  Video without subtitles is at: {os.path.abspath(final_path)}")
        subtitled_path = final_path
    print()

    # -----------------------------------------------------------------------
    # Optional: TTS Narration
    # -----------------------------------------------------------------------
    narrated_path = subtitled_path
    if not skip_tts:
        audio_dir = os.path.join(output_dir, config.AUDIO_SUBDIR)
        os.makedirs(audio_dir, exist_ok=True)

        print("[Step 6/8] Generating TTS narration...")
        try:
            tts_results = tts_generator.generate_all_tts(
                successful_scenes,
                audio_dir,
                voice=tts_voice,
            )

            # Collect successful audio files
            successful_audio = [
                r["audio_path"] for r in tts_results if r.get("success")
            ]
            failed_tts = [r for r in tts_results if not r.get("success")]

            if successful_audio:
                print(f"  Generated {len(successful_audio)}/{len(successful_scenes)} narration tracks")

                if failed_tts:
                    print(f"  WARNING: {len(failed_tts)} scenes failed TTS generation:")
                    for r in failed_tts:
                        scene = r.get("scene")
                        error = r.get("error", "Unknown error")
                        if scene:
                            print(f"    {scene.cut_label.upper()}: {error}")

                # Mix narration with video
                print("[Step 7/8] Mixing narration with video...")
                narrated_path = os.path.join(
                    final_dir, f"{storyboard.safe_title}_narrated.mp4"
                )
                audio_mixer.mix_narration_with_video(
                    subtitled_path,
                    successful_audio,
                    successful_scenes,
                    narrated_path,
                    clip_duration=float(duration),
                    crossfade=config.CROSSFADE_DURATION,
                )
                print(f"  Output: {os.path.abspath(narrated_path)}")
            else:
                print("  WARNING: All TTS generation failed, skipping narration mix")
                narrated_path = subtitled_path

        except Exception as exc:
            print(f"  WARNING: TTS narration failed: {exc}")
            print(f"  Video without narration is at: {os.path.abspath(subtitled_path)}")
            narrated_path = subtitled_path
        print()
    else:
        print("[Step 6/8] Skipping TTS narration (--no-tts)")
        print("[Step 7/8] Skipping narration mix (--no-tts)")
        print()

    # -----------------------------------------------------------------------
    # Optional: BGM
    # -----------------------------------------------------------------------
    final_output = narrated_path
    if bgm_path and os.path.isfile(bgm_path):
        print("[Step 8/8] Adding background music...")
        try:
            bgm_output = os.path.join(
                final_dir, f"{storyboard.safe_title}_final_bgm.mp4"
            )
            audio_mixer.add_bgm(
                narrated_path,
                bgm_path,
                volume=config.BGM_VOLUME,
                output_path=bgm_output,
            )
            print(f"  Output: {os.path.abspath(bgm_output)}")
            final_output = bgm_output
        except Exception as exc:
            print(f"  WARNING: BGM mixing failed: {exc}")
            print(f"  Video without BGM is at: {os.path.abspath(narrated_path)}")
        print()
    else:
        print("[Step 8/8] Skipping BGM (no --bgm file specified)")
        print()

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    pipeline_elapsed = time.time() - pipeline_start
    final_size_mb = os.path.getsize(final_output) / (1024 * 1024)
    clip_dur = float(duration)
    xf = config.CROSSFADE_DURATION
    estimated_duration = (
        clip_dur * len(successful_clips)
        - xf * max(0, len(successful_clips) - 1)
    )

    # Cost estimate: Kling std ~$0.014/s, pro ~$0.028/s
    cost_per_second = 0.028 if mode == "pro" else 0.014
    estimated_cost = clip_dur * len(successful_clips) * cost_per_second

    print("=" * 70)
    print("  PIPELINE COMPLETE")
    print("=" * 70)
    print(f"  Title:           {storyboard.title}")
    print(f"  Clips generated: {len(successful_clips)}/{total}")
    print(f"  Failed:          {len(failed_scenes)}/{total}")
    print(f"  Estimated video: ~{estimated_duration:.1f}s")
    print(f"  Final file size: {final_size_mb:.1f}MB")
    print(f"  Total time:      {pipeline_elapsed:.0f}s ({pipeline_elapsed / 60:.1f}min)")
    print(f"  Est. API cost:   ~${estimated_cost:.2f}")
    print()
    print(f"  Base video:      {os.path.abspath(final_path)}")
    if subtitled_path != final_path:
        print(f"  With subtitles:  {os.path.abspath(subtitled_path)}")
    if narrated_path != subtitled_path:
        print(f"  With narration:  {os.path.abspath(narrated_path)}")
    if final_output != narrated_path:
        print(f"  With BGM:        {os.path.abspath(final_output)}")
    print()
    print(f"  FINAL OUTPUT:    {os.path.abspath(final_output)}")
    print()

    if failed_scenes:
        _print_failures(failed_scenes)

    print("=" * 70)

    return final_output


def _print_failures(failed: list[dict[str, Any]]) -> None:
    """Print summary of failed scenes."""
    if not failed:
        return

    print("-" * 70)
    print(f"  FAILED SCENES ({len(failed)})")
    print("-" * 70)
    for r in failed:
        scene = r.get("scene")
        if scene:
            print(f"  {scene.cut_label.upper()}: {r.get('error', 'Unknown error')}")
        else:
            print(f"  Unknown scene: {r.get('error', 'Unknown error')}")
    print()
