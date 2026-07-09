#!/usr/bin/env python3
"""
Re-run only the composition steps (4-8) using existing clips.
Skips Kling API calls - uses clips already in output/clips/.
"""

import os
import sys
import time
import glob

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))

from src.video_pipeline import config, storyboard_parser, video_composer, tts_generator, audio_mixer

STORYBOARD = "/mnt/d/claude-bae/P2-REMOAIStudio/REMO/오이도미팅/REMO___역전의_비밀__ (1).storyboard"
OUTPUT_DIR = "/mnt/d/claude-bae/P2-REMOAIStudio/REMO-AI-Studio-v2/output"
DURATION = "5"
SKIP_TTS = False
TTS_VOICE = "Kore"

def main():
    t0 = time.time()

    # Parse storyboard for scene metadata
    print("[1] Parsing storyboard...")
    storyboard = storyboard_parser.parse(STORYBOARD)
    print(f"  {storyboard.scene_count} scenes")

    # Collect existing clips in order
    clips_dir = os.path.join(OUTPUT_DIR, config.CLIPS_SUBDIR)
    clip_paths = []
    for scene in storyboard.scenes:
        p = os.path.join(clips_dir, f"{scene.cut_label}.mp4")
        if os.path.isfile(p):
            clip_paths.append(p)
        else:
            print(f"  WARNING: Missing clip {p}")

    print(f"  Found {len(clip_paths)}/{storyboard.scene_count} clips")

    if not clip_paths:
        print("ERROR: No clips found")
        return 1

    # Step 4: Concatenate with crossfade
    final_dir = os.path.join(OUTPUT_DIR, config.FINAL_SUBDIR)
    os.makedirs(final_dir, exist_ok=True)
    final_path = os.path.join(final_dir, f"{storyboard.safe_title}_final.mp4")

    print(f"\n[2] Composing {len(clip_paths)} clips with crossfade...")
    video_composer.concatenate_clips(
        clip_paths,
        final_path,
        crossfade=config.CROSSFADE_DURATION,
    )
    print(f"  Output: {os.path.abspath(final_path)}")

    # Step 5: Subtitles
    subtitled_path = os.path.join(final_dir, f"{storyboard.safe_title}_subtitled.mp4")
    print(f"\n[3] Adding Korean subtitles...")
    try:
        video_composer.add_subtitles(
            final_path,
            storyboard.scenes[:len(clip_paths)],
            subtitled_path,
            clip_duration=float(DURATION),
            crossfade=config.CROSSFADE_DURATION,
        )
        print(f"  Output: {os.path.abspath(subtitled_path)}")
    except Exception as exc:
        print(f"  WARNING: Subtitles failed: {exc}")
        subtitled_path = final_path

    # Step 6-7: TTS + Narration mix
    narrated_path = subtitled_path
    if not SKIP_TTS:
        audio_dir = os.path.join(OUTPUT_DIR, config.AUDIO_SUBDIR)
        os.makedirs(audio_dir, exist_ok=True)

        print(f"\n[4] Generating TTS narration...")
        try:
            scenes_for_tts = storyboard.scenes[:len(clip_paths)]
            tts_results = tts_generator.generate_all_tts(
                scenes_for_tts,
                audio_dir,
                voice=TTS_VOICE,
            )
            successful_audio = [r["audio_path"] for r in tts_results if r.get("success")]
            failed_tts = [r for r in tts_results if not r.get("success")]

            if successful_audio:
                print(f"  Generated {len(successful_audio)}/{len(scenes_for_tts)} tracks")
                if failed_tts:
                    for r in failed_tts:
                        scene = r.get("scene")
                        if scene:
                            print(f"  FAILED: {scene.cut_label}: {r.get('error')}")

                print(f"\n[5] Mixing narration with video...")
                narrated_path = os.path.join(
                    final_dir, f"{storyboard.safe_title}_narrated.mp4"
                )
                audio_mixer.mix_narration_with_video(
                    subtitled_path,
                    successful_audio,
                    scenes_for_tts,
                    narrated_path,
                    clip_duration=float(DURATION),
                    crossfade=config.CROSSFADE_DURATION,
                )
                print(f"  Output: {os.path.abspath(narrated_path)}")
            else:
                print("  WARNING: All TTS failed, skipping narration")
        except Exception as exc:
            print(f"  WARNING: TTS failed: {exc}")
            narrated_path = subtitled_path

    elapsed = time.time() - t0
    final_size = os.path.getsize(narrated_path) / (1024 * 1024)
    print(f"\n{'='*60}")
    print(f"  DONE in {elapsed:.0f}s")
    print(f"  Final: {os.path.abspath(narrated_path)} ({final_size:.1f}MB)")
    print(f"{'='*60}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
