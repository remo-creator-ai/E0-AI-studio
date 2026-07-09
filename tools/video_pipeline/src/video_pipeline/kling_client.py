"""
Kling AI API Client

Handles JWT authentication, image-to-video task submission, polling,
and video download. Uses only Python stdlib for JWT creation.
"""

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from . import config


# ---------------------------------------------------------------------------
# JWT helper (stdlib only, no PyJWT dependency)
# ---------------------------------------------------------------------------

def _base64url(data: bytes) -> str:
    """Base64url-encode without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def create_jwt(
    access_key_id: str | None = None,
    access_key_secret: str | None = None,
) -> str:
    """Create an HMAC-SHA256 JWT for Kling API authentication.

    Args:
        access_key_id: Kling access key ID (defaults to config value).
        access_key_secret: Kling access key secret (defaults to config value).

    Returns:
        Signed JWT string.
    """
    kid = access_key_id or config.KLING_ACCESS_KEY_ID
    secret = access_key_secret or config.KLING_ACCESS_KEY_SECRET

    header = _base64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = _base64url(
        json.dumps({"iss": kid, "exp": now + 1800, "nbf": now - 5}).encode()
    )
    signing_input = f"{header}.{payload}"
    signature = _base64url(
        hmac.new(
            secret.encode("utf-8"),
            signing_input.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    )
    return f"{signing_input}.{signature}"


# ---------------------------------------------------------------------------
# HTTP helpers (stdlib urllib)
# ---------------------------------------------------------------------------

def _api_request(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    token: str | None = None,
) -> dict[str, Any]:
    """Make an HTTP request to the Kling API.

    Args:
        method: HTTP method (GET / POST).
        path: API path (e.g. /v1/videos/image2video).
        body: JSON body for POST requests.
        token: JWT token (will be created if not provided).

    Returns:
        Parsed JSON response as a dict.

    Raises:
        RuntimeError: On HTTP errors or non-zero API response codes.
    """
    if token is None:
        token = create_jwt()

    url = f"{config.KLING_API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_body = resp.read().decode("utf-8")
            return json.loads(resp_body)
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Kling API HTTP {exc.code}: {err_body}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Kling API connection error: {exc.reason}") from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def submit_image2video(
    image_base64: str,
    prompt: str,
    mode: str | None = None,
    duration: str | None = None,
) -> str:
    """Submit an image-to-video generation task.

    Args:
        image_base64: Raw base64-encoded PNG image data (no data URI prefix).
        prompt: Motion / video prompt in English.
        mode: Quality mode ("std" or "pro"). Defaults to config value.
        duration: Clip duration in seconds ("5" or "10"). Defaults to config value.

    Returns:
        Kling task ID string.

    Raises:
        RuntimeError: On submission failure.
    """
    body = {
        "model_name": config.KLING_MODEL,
        "prompt": prompt,
        "image": image_base64,
        "negative_prompt": config.KLING_NEGATIVE_PROMPT,
        "cfg_scale": config.KLING_CFG_SCALE,
        "mode": mode or config.KLING_MODE,
        "duration": duration or config.KLING_DURATION,
        "aspect_ratio": config.KLING_ASPECT,
    }

    resp = _api_request("POST", "/v1/videos/image2video", body=body)

    if resp.get("code") != 0:
        raise RuntimeError(
            f"Kling submit failed (code {resp.get('code')}): "
            f"{resp.get('message', 'unknown error')}"
        )

    task_id: str = resp["data"]["task_id"]
    return task_id


def poll_task(
    task_id: str,
    poll_interval: int | None = None,
    poll_timeout: int | None = None,
    progress_callback: Any = None,
) -> str:
    """Poll a Kling image2video task until it completes.

    Args:
        task_id: The task ID returned by submit_image2video.
        poll_interval: Seconds between polls (defaults to config).
        poll_timeout: Maximum total seconds to wait (defaults to config).
        progress_callback: Optional callable(attempt, max_attempts) for progress.

    Returns:
        Video download URL.

    Raises:
        RuntimeError: On task failure or timeout.
    """
    interval = poll_interval or config.POLL_INTERVAL
    timeout = poll_timeout or config.POLL_TIMEOUT
    max_attempts = timeout // interval

    for attempt in range(1, max_attempts + 1):
        time.sleep(interval)

        if progress_callback:
            progress_callback(attempt, max_attempts)

        # Refresh JWT each poll (they expire in 30 min, but fresh is safer)
        token = create_jwt()

        try:
            resp = _api_request(
                "GET",
                f"/v1/videos/image2video/{task_id}",
                token=token,
            )
        except RuntimeError:
            # Transient network error, keep polling
            continue

        status = resp.get("data", {}).get("task_status", "")

        if status == "succeed":
            videos = (
                resp.get("data", {})
                .get("task_result", {})
                .get("videos", [])
            )
            if videos and videos[0].get("url"):
                return videos[0]["url"]
            raise RuntimeError(
                f"Task {task_id} succeeded but no video URL in response"
            )

        if status == "failed":
            msg = resp.get("data", {}).get("task_status_msg", "Unknown error")
            raise RuntimeError(f"Kling task {task_id} failed: {msg}")

        # Still "processing" or "submitted" -- keep polling

    raise RuntimeError(
        f"Kling task {task_id} timed out after {timeout}s "
        f"({max_attempts} polls)"
    )


def download_video(url: str, output_path: str) -> str:
    """Download a video file from a URL.

    Args:
        url: Video download URL.
        output_path: Local filesystem path to save the file.

    Returns:
        The output_path on success.

    Raises:
        RuntimeError: On download failure.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(output_path, "wb") as f:
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
    except (urllib.error.URLError, urllib.error.HTTPError) as exc:
        raise RuntimeError(f"Video download failed: {exc}") from exc

    return output_path
