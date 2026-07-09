#!/usr/bin/env python3
"""
REMO AI Studio - Storyboard to Video Pipeline

Reads a .storyboard JSON file exported from REMO AI Studio and generates
a continuous video using the Kling AI image-to-video API.

Usage:
    python3 run.py path/to/file.storyboard
    python3 run.py path/to/file.storyboard --dry-run
    python3 run.py path/to/file.storyboard -o output/ -c 3 --mode std --duration 5
"""

import argparse
import sys
import os


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate video from REMO AI Studio storyboard",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry run (parse only, no API calls):
  python3 run.py storyboard.storyboard --dry-run

  # Generate with defaults (std mode, 5s clips, 3 concurrent, with TTS):
  python3 run.py storyboard.storyboard

  # Pro mode, 10s clips, 5 concurrent workers:
  python3 run.py storyboard.storyboard --mode pro --duration 10 -c 5

  # Skip TTS narration:
  python3 run.py storyboard.storyboard --no-tts

  # With background music:
  python3 run.py storyboard.storyboard --bgm music.mp3

  # Custom output directory:
  python3 run.py storyboard.storyboard -o /path/to/output
        """,
    )
    parser.add_argument(
        "storyboard",
        help="Path to .storyboard JSON file",
    )
    parser.add_argument(
        "-o", "--output",
        default="output",
        help="Output directory (default: output/)",
    )
    parser.add_argument(
        "-c", "--concurrent",
        type=int,
        default=3,
        help="Max concurrent Kling API calls (default: 3)",
    )
    parser.add_argument(
        "--mode",
        choices=["std", "pro"],
        default="std",
        help="Kling quality mode (default: std)",
    )
    parser.add_argument(
        "--duration",
        choices=["5", "10"],
        default="5",
        help="Clip duration in seconds (default: 5)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse storyboard and extract images only, skip API calls",
    )
    parser.add_argument(
        "--no-tts",
        action="store_true",
        help="Skip TTS narration generation",
    )
    parser.add_argument(
        "--voice",
        default="Kore",
        help="TTS voice name (default: Kore for Korean)",
    )
    parser.add_argument(
        "--bgm",
        help="Path to background music file (optional)",
    )

    args = parser.parse_args()

    # Validate storyboard file exists
    if not os.path.isfile(args.storyboard):
        print(f"Error: Storyboard file not found: {args.storyboard}")
        return 1

    # Import pipeline (deferred to avoid import errors on --help)
    from src.video_pipeline.pipeline import run

    try:
        result = run(
            storyboard_path=args.storyboard,
            output_dir=args.output,
            max_concurrent=args.concurrent,
            mode=args.mode,
            duration=args.duration,
            dry_run=args.dry_run,
            skip_tts=args.no_tts,
            tts_voice=args.voice,
            bgm_path=args.bgm,
        )

        if args.dry_run:
            return 0

        if result:
            return 0
        else:
            print("Pipeline completed with errors. Check output above.")
            return 1

    except KeyboardInterrupt:
        print("\n\nPipeline interrupted by user.")
        return 130
    except Exception as exc:
        print(f"\nFATAL ERROR: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
