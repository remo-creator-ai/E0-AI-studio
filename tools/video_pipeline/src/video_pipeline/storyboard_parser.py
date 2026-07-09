"""
Storyboard Parser

Reads REMO AI Studio `.storyboard` JSON files and extracts scene data
and embedded base64 images into individual PNG files.
"""

import base64
import json
import os
from typing import Any


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class Scene:
    """Parsed scene from a storyboard file."""

    __slots__ = (
        "id",
        "order",
        "seq",
        "image_base64",
        "image_path",
        "script_en",
        "script_kr",
        "content_kr",
        "image_prompt_en",
        "video_motion_en",
    )

    def __init__(self, raw: dict[str, Any], seq: int = 0) -> None:
        self.id: str = raw["id"]
        self.order: int = raw["order"]
        self.seq: int = seq  # 1-based sequential index (unique across all scenes)

        # Store raw base64 (strip data URI prefix if present)
        image_url: str = raw.get("image_url", "")
        if image_url.startswith("data:"):
            # e.g. "data:image/png;base64,iVBOR..."
            self.image_base64 = image_url.split(",", 1)[1]
        else:
            self.image_base64 = image_url

        self.image_path: str | None = None  # set after extraction

        self.script_en: str = raw.get("script_en", "")
        self.script_kr: str = raw.get("script_kr", "")
        self.content_kr: str = raw.get("content_kr", "")
        self.image_prompt_en: str = raw.get("image_prompt_en", "")
        self.video_motion_en: str = raw.get("video_motion_en", "")

    @property
    def cut_number(self) -> int:
        """1-based unique cut number (sequential index)."""
        return self.seq

    @property
    def cut_label(self) -> str:
        """Zero-padded cut label, e.g. 'cut_01'. Uses unique seq index."""
        return f"cut_{self.seq:02d}"

    def __repr__(self) -> str:
        return (
            f"Scene(order={self.order}, "
            f"prompt='{self.video_motion_en[:50]}...')"
        )


class Storyboard:
    """Parsed storyboard with metadata and scenes."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.id: str = data.get("id", "")
        self.title: str = data.get("title", "Untitled").strip()
        self.key_message: str = data.get("key_message", "")
        self.duration: int = data.get("duration", 30)
        self.style: str = data.get("style", "")
        self.idea: str = data.get("idea", "")

        raw_scenes = data.get("scenes", [])
        # Preserve array order from the storyboard file.
        # The 'order' field may be duplicated (e.g. 1-9 repeated twice
        # for 18 scenes), so we assign a unique sequential index (seq)
        # to each scene based on its position in the array.
        self.scenes: list[Scene] = [
            Scene(s, seq=i + 1) for i, s in enumerate(raw_scenes)
        ]

    @property
    def scene_count(self) -> int:
        return len(self.scenes)

    @property
    def safe_title(self) -> str:
        """Filesystem-safe title (spaces replaced with underscores, quotes removed)."""
        title = self.title.replace('"', "").replace("'", "")
        title = title.replace(" ", "_").replace("/", "_")
        return title

    def __repr__(self) -> str:
        return (
            f"Storyboard(title='{self.title}', "
            f"scenes={self.scene_count}, "
            f"style='{self.style}')"
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse(filepath: str) -> Storyboard:
    """Parse a .storyboard JSON file.

    Args:
        filepath: Path to the .storyboard file.

    Returns:
        Storyboard object with metadata and scene list.

    Raises:
        FileNotFoundError: If the file does not exist.
        json.JSONDecodeError: If the file is not valid JSON.
        KeyError: If required fields are missing.
    """
    filepath = os.path.expanduser(filepath)
    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"Storyboard file not found: {filepath}")

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    storyboard = Storyboard(data)

    if storyboard.scene_count == 0:
        raise ValueError("Storyboard contains no scenes")

    return storyboard


def extract_images(
    scenes: list[Scene],
    output_dir: str,
) -> list[str]:
    """Extract base64-encoded images from scenes and save as PNG files.

    Args:
        scenes: List of Scene objects.
        output_dir: Directory to save extracted images.

    Returns:
        List of saved image file paths in scene order.
    """
    os.makedirs(output_dir, exist_ok=True)
    paths: list[str] = []

    for scene in scenes:
        filename = f"{scene.cut_label}.png"
        filepath = os.path.join(output_dir, filename)

        if scene.image_base64:
            image_bytes = base64.b64decode(scene.image_base64)
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            scene.image_path = filepath
            paths.append(filepath)
        else:
            print(f"  WARNING: Scene {scene.cut_label} has no image data")

    return paths
