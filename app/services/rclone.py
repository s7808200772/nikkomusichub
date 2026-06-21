"""rclone configuration and sync helpers."""
import json
import re
import os
from datetime import datetime
from pathlib import Path

from app.config import (
    BASE_DIR,
    MUSIC_DIR,
    RCLONE_CONFIG_PATH,
    RCLONE_DROPBOX_PATH_DEFAULT,
    RCLONE_REMOTE_NAME_DEFAULT,
    SYNC_LOG_PATH,
)
from app.services.system import command_exists, run, safe_path_validate


def get_rclone_config_exists() -> bool:
    return RCLONE_CONFIG_PATH.exists()


def write_rclone_config(remote_name: str, token_json: str):
    """Write an rclone config file from Dropbox token JSON.

    Accepts either:
    - A short-lived access token: {"access_token":"...","token_type":"bearer"}
    - Or a refreshable token from rclone config / Dropbox App Console:
      {"access_token":"...","token_type":"bearer","refresh_token":"...","expiry":"..."}

    When a refresh_token is present, rclone will automatically refresh the
    access_token when it expires, so the user does not need to re-enter tokens.
    """
    raw = token_json.strip()
    # Defensive: if the input is itself a JSON-encoded string (e.g. wrapped in
    # quotes and escaped), decode it once first.
    if raw.startswith('"') and raw.endswith('"'):
        raw = json.loads(raw)
    token = json.loads(raw)
    # Validate expected shape: need at least an access_token or a refresh_token
    if "access_token" not in token and "refresh_token" not in token:
        raise ValueError("Token JSON 必須包含 access_token 或 refresh_token")

    # Normalize remote name
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT

    config = f"""[{remote_name}]
type = dropbox
token = {json.dumps(token)}
"""
    RCLONE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    RCLONE_CONFIG_PATH.write_text(config)
    os.chmod(RCLONE_CONFIG_PATH, 0o600)
    return remote_name


def test_dropbox(remote_name: str) -> dict:
    if not command_exists("rclone"):
        return {"ok": False, "stderr": "rclone not installed"}
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    return run(
        ["rclone", "lsf", f"{remote_name}:", "--config", str(RCLONE_CONFIG_PATH), "--max-depth", "1"],
        timeout=60,
    )


def sync_music(remote_name: str, dropbox_path: str, local_path: str, dry_run: bool = False) -> dict:
    if not command_exists("rclone"):
        return {"ok": False, "stderr": "rclone not installed"}

    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    dropbox_path = dropbox_path.strip("/")
    if not dropbox_path:
        dropbox_path = RCLONE_DROPBOX_PATH_DEFAULT
    if ".." in dropbox_path or dropbox_path.startswith("/"):
        return {"ok": False, "stderr": "Invalid Dropbox path"}

    if not safe_path_validate(local_path):
        return {"ok": False, "stderr": "Invalid local path"}

    Path(local_path).mkdir(parents=True, exist_ok=True)

    args = [
        "rclone",
        "sync",
        f"{remote_name}:{dropbox_path}",
        local_path,
        "--config",
        str(RCLONE_CONFIG_PATH),
        "--include",
        "*.mp3",
        "--include",
        "*.MP3",
        "--delete-excluded",
        "-v",
    ]
    if dry_run:
        args.append("--dry-run")

    started_at = datetime.utcnow().isoformat()
    result = run(args, timeout=600)
    finished_at = datetime.utcnow().isoformat()

    status = "success" if result["ok"] else "failed"
    message = "Dry-run completed" if dry_run else ("Sync completed" if result["ok"] else "Sync failed")

    # Append to sync log file
    SYNC_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SYNC_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(f"\n=== {started_at} {status} ===\n")
        f.write(f"CMD: {' '.join(args)}\n")
        f.write(result["stdout"])
        f.write(result["stderr"])

    from app.db import add_sync_log, set_setting
    add_sync_log(started_at, finished_at, status, message, result["stdout"], result["stderr"])
    set_setting("last_sync_at", finished_at)
    set_setting("last_sync_status", status)
    set_setting("last_sync_message", message)

    return result


def install_rclone() -> dict:
    if command_exists("rclone"):
        return {"ok": True, "stdout": "rclone already installed", "stderr": ""}

    script_path = "/tmp/install-rclone.sh"
    with open(script_path, "w", encoding="utf-8") as f:
        f.write('#!/bin/bash\ncurl https://rclone.org/install.sh | sudo bash\n')
    os.chmod(script_path, 0o755)
    return run(["sudo", "bash", script_path], timeout=300)
