#!/usr/bin/env python3
"""
Re-run only the TTS + narration mix steps.
Uses existing subtitled video + generates fresh TTS audio.
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from src.video_pipeline import config, storyboard_parser, tts_generator, audio_mixer

STORYBOARD = "/mnt/d/claude-bae/P2-REMOAIStudio/REMO/오이도미팅/REMO___역전의_비밀__ (1).storyboard"
OUTPUT_DIR = "/mnt/d/claude-bae/P2-REMOAIStudio/REMO-AI-Studio-v2/output"
DURATION = "5"
TTS_VOICE = "Kore"


def main():
    t0 = time.time()

    # Parse storyboard
    print("[1] Parsing storyboard...")
    storyboard = storyboard_parser.parse(STORYBOARD)
    print(f"  {storyboard.scene_count} scenes")

    # Check subtitled video exists
    final_dir = os.path.join(OUTPUT_DIR, config.FINAL_SUBDIR)
    subtitled_path = os.path.join(final_dir, f"{storyboard.safe_title}_subtitled.mp4")
    if not os.path.isfile(subtitled_path):
        print(f"ERROR: Subtitled video not found: {subtitled_path}")
        return 1
    print(f"  Using video: {subtitled_path}")

    # Collect clip paths to determine which scenes succeeded
    clips_dir = os.path.join(OUTPUT_DIR, config.CLIPS_SUBDIR)
    successful_scenes = []
    for scene in storyboard.scenes:
        p = os.path.join(clips_dir, f"{scene.cut_label}.mp4")
        if os.path.isfile(p):
            successful_scenes.append(scene)
    print(f"  Scenes with clips: {len(successful_scenes)}")

    # Generate TTS
    audio_dir = os.path.join(OUTPUT_DIR, config.AUDIO_SUBDIR)
    os.makedirs(audio_dir, exist_ok=True)

    print(f"\n[2] Generating TTS narration (rate-limited)...")
    tts_results = tts_generator.generate_all_tts(
        successful_scenes,
        audio_dir,
        voice=TTS_VOICE,
    )

    successful_audio = [r["audio_path"] for r in tts_results if r.get("success")]
    failed_tts = [r for r in tts_results if not r.get("success")]

    print(f"\n  Results: {len(successful_audio)}/{len(successful_scenes)} success")
    if failed_tts:
        for r in failed_tts:
            scene = r.get("scene")
            if scene:
                print(f"  FAILED: {scene.cut_label}: {r.get('error', 'Unknown')}")

    if not successful_audio:
        print("ERROR: All TTS failed, cannot mix narration")
        return 1

    # Mix narration with video
    print(f"\n[3] Mixing narration with video...")
    narrated_path = os.path.join(final_dir, f"{storyboard.safe_title}_narrated.mp4")
    try:
        audio_mixer.mix_narration_with_video(
            subtitled_path,
            successful_audio,
            successful_scenes,
            narrated_path,
            clip_duration=float(DURATION),
            crossfade=config.CROSSFADE_DURATION,
        )
        print(f"  Output: {os.path.abspath(narrated_path)}")
    except Exception as exc:
        print(f"  ERROR mixing: {exc}")
        return 1

    elapsed = time.time() - t0
    final_size = os.path.getsize(narrated_path) / (1024 * 1024)
    print(f"\n{'='*60}")
    print(f"  DONE in {elapsed:.0f}s")
    print(f"  Final: {os.path.abspath(narrated_path)} ({final_size:.1f}MB)")
    print(f"{'='*60}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
