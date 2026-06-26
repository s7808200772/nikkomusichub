"""rclone configuration and sync helpers for QNAP WebDAV."""
import os
import re
from datetime import datetime
from pathlib import Path

import pwd

from app.config import (
    BASE_DIR,
    MUSIC_DIR,
    NIKKO_GROUP,
    NIKKO_USER,
    RCLONE_CONFIG_PATH,
    RCLONE_REMOTE_NAME_DEFAULT,
    RCLONE_REMOTE_PATH_DEFAULT,
    RCLONE_WEBDAV_URL_DEFAULT,
    RCLONE_WEBDAV_VENDOR_DEFAULT,
    SYNC_LOG_PATH,
)
from app.services.system import command_exists, run, safe_path_validate


def _get_uid_gid(user: str, group: str):
    try:
        uid = pwd.getpwnam(user).pw_uid
        gid = pwd.getpwnam(group).pw_gid if group else pwd.getpwnam(user).pw_gid
        return uid, gid
    except Exception:
        return None, None


def get_rclone_config_exists() -> bool:
    return RCLONE_CONFIG_PATH.exists()


def _obscure_password(password: str) -> str:
    """Obscure a password using rclone obscure."""
    if not command_exists("rclone"):
        raise RuntimeError("rclone is required to obscure the password")
    res = run(["rclone", "obscure", password], timeout=30)
    if not res["ok"]:
        raise RuntimeError(f"Failed to obscure password: {res['stderr']}")
    return res["stdout"].strip()


def write_rclone_config(
    remote_name: str,
    url: str,
    vendor: str,
    username: str,
    password: str,
):
    """Write an rclone config file for a WebDAV remote (QNAP NAS)."""
    if not username:
        raise ValueError("Username is required")
    if not password:
        raise ValueError("Password is required")

    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    vendor = vendor.strip() or RCLONE_WEBDAV_VENDOR_DEFAULT
    obscured = _obscure_password(password)

    config = f"""[{remote_name}]
type = webdav
url = {url.strip()}
vendor = {vendor}
user = {username}
pass = {obscured}
"""
    RCLONE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    RCLONE_CONFIG_PATH.write_text(config)
    os.chmod(RCLONE_CONFIG_PATH, 0o600)
    uid, gid = _get_uid_gid(NIKKO_USER, NIKKO_GROUP)
    if uid is not None and gid is not None:
        try:
            os.chown(RCLONE_CONFIG_PATH, uid, gid)
            os.chown(RCLONE_CONFIG_PATH.parent, uid, gid)
        except Exception:
            pass
    return remote_name


def test_remote(remote_name: str) -> dict:
    """Test listing the root of a remote."""
    if not command_exists("rclone"):
        return {"ok": False, "stderr": "rclone not installed"}
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    return run(
        ["rclone", "lsd", f"{remote_name}:", "--config", str(RCLONE_CONFIG_PATH)],
        timeout=60,
    )


def list_remote_music(remote_name: str, remote_path: str) -> dict:
    """List MP3 files under a remote path."""
    if not command_exists("rclone"):
        return {"ok": False, "stderr": "rclone not installed"}
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    path = remote_path.replace(f"{remote_name}:", "").strip("/")
    return run(
        [
            "rclone", "lsf", f"{remote_name}:{path}",
            "--config", str(RCLONE_CONFIG_PATH),
            "--include", "*.mp3",
            "--include", "*.MP3",
        ],
        timeout=60,
    )


def sync_music(remote_path: str, local_path: str, dry_run: bool = False) -> dict:
    """Sync music from a WebDAV remote path to local path."""
    if not command_exists("rclone"):
        return {"ok": False, "stderr": "rclone not installed"}

    if not remote_path or ":" not in remote_path:
        remote_path = RCLONE_REMOTE_PATH_DEFAULT
    remote_name, _, remote_dir = remote_path.partition(":")
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    remote_dir = remote_dir.strip("/")

    if not safe_path_validate(local_path):
        return {"ok": False, "stderr": "Invalid local path"}

    Path(local_path).mkdir(parents=True, exist_ok=True)

    args = [
        "rclone",
        "sync",
        f"{remote_name}:{remote_dir}",
        local_path,
        "--config",
        str(RCLONE_CONFIG_PATH),
        "--include",
        "*.mp3",
        "--include",
        "*.MP3",
        "--exclude",
        "*",
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

    # Append to sync log file (sanitise password)
    SYNC_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    log_cmd = " ".join(args)
    safe_log_cmd = re.sub(r"pass\s*=\s*\S+", "pass=***", log_cmd)
    with open(SYNC_LOG_PATH, "a", encoding="utf-8") as f:
        f.write(f"\n=== {started_at} {status} ===\n")
        f.write(f"CMD: {safe_log_cmd}\n")
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


def clear_local_music(local_path: str) -> dict:
    """Remove all MP3 files from the local music directory."""
    if not safe_path_validate(local_path):
        return {"ok": False, "stderr": "Invalid local path"}
    target = Path(local_path)
    if not target.exists():
        return {"ok": True, "stdout": "Local music directory does not exist", "stderr": ""}
    return run(["find", str(target), "-type", "f", "-name", "*.mp3", "-delete"], timeout=60)
