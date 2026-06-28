"""Background sync manager with progress tracking and staging."""
import re
import shutil
import subprocess
import threading
from datetime import datetime
from pathlib import Path

from app.config import BASE_DIR, MUSIC_DIR, MUSIC_OLD_DIR, RCLONE_CONFIG_PATH, RCLONE_REMOTE_PATH_DEFAULT
from app.db import add_sync_log, set_setting
from app.services import mpv
from app.services.system import command_exists, safe_path_validate


_current_sync = {
    "running": False,
    "dry_run": False,
    "started_at": None,
    "finished_at": None,
    "status": "idle",  # idle | running | success | failed
    "message": "",
    "progress": 0,  # 0-100
    "transferred": "",
    "total": "",
    "speed": "",
    "eta": "",
    "stdout": "",
    "stderr": "",
}
_lock = threading.Lock()

# Staging directories for atomic music folder replacement
STAGING_DIR = BASE_DIR / "music.staging"
OLD_DIR = MUSIC_OLD_DIR


def _empty_dir(path: Path):
    if not path.exists():
        return
    for item in path.iterdir():
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()


def _count_mp3(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for p in path.rglob("*") if p.is_file() and p.suffix.lower() == ".mp3")


def _set_progress(**kwargs):
    with _lock:
        _current_sync.update(kwargs)


def get_progress() -> dict:
    with _lock:
        return dict(_current_sync)


def _parse_progress_line(line: str) -> dict:
    """Parse rclone --progress output line like:
    Transferred:   285.712 MiB / 285.712 MiB, 100%, 10.074 MiB/s, ETA 0s
    """
    out = {}
    m = re.search(r"Transferred:\s+([\d\.\s\wB]+)\s*/\s*([\d\.\s\wB]+),\s*(\d+)%", line)
    if m:
        out["transferred"] = m.group(1).strip()
        out["total"] = m.group(2).strip()
        out["progress"] = int(m.group(3))
    speed_m = re.search(r"(\d+(?:\.\d+)?\s*[\wB]+/s)", line)
    if speed_m:
        out["speed"] = speed_m.group(1)
    eta_m = re.search(r"ETA\s+([^,\n]+)", line)
    if eta_m:
        out["eta"] = eta_m.group(1).strip()
    return out


def _atomic_replace_staging(local_path: Path):
    """Replace local_path with STAGING_DIR atomically."""
    local_path = Path(local_path).resolve()
    staging = STAGING_DIR.resolve()
    old = OLD_DIR.resolve()

    # Remove any leftover old dir from a previous swap
    if old.exists():
        shutil.rmtree(old)

    # If local_path doesn't exist yet, just rename staging into place
    if not local_path.exists():
        staging.rename(local_path)
        return

    # Atomic-ish swap: music -> music.old, music.staging -> music
    local_path.rename(old)
    try:
        staging.rename(local_path)
    except Exception:
        # Attempt to roll back if rename fails
        if old.exists():
            old.rename(local_path)
        raise
    finally:
        # Clean up old dir in background (mpv may still hold fds to old files)
        if old.exists():
            try:
                shutil.rmtree(old)
            except Exception:
                pass


def _run_sync(remote_path: str, local_path: str, dry_run: bool, use_staging: bool = True):
    started_at = datetime.utcnow().isoformat()
    _set_progress(
        running=True,
        dry_run=dry_run,
        started_at=started_at,
        finished_at=None,
        status="running",
        message="Dry-run 進行中…" if dry_run else "同步進行中…",
        progress=0,
        transferred="",
        total="",
        speed="",
        eta="",
        stdout="",
        stderr="",
    )

    if not command_exists("rclone"):
        finished_at = datetime.utcnow().isoformat()
        _set_progress(running=False, finished_at=finished_at, status="failed", message="rclone 未安裝")
        add_sync_log(started_at, finished_at, "failed", "rclone 未安裝", "", "")
        return

    if not remote_path or ":" not in remote_path:
        remote_path = RCLONE_REMOTE_PATH_DEFAULT
    remote_name, _, remote_dir = remote_path.partition(":")
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or "qnapmusic"
    remote_dir = remote_dir.strip("/")

    if not safe_path_validate(local_path):
        finished_at = datetime.utcnow().isoformat()
        _set_progress(running=False, finished_at=finished_at, status="failed", message="本地路徑無效")
        add_sync_log(started_at, finished_at, "failed", "本地路徑無效", "", "")
        return

    local_path_obj = Path(local_path)
    target_path = STAGING_DIR if (use_staging and not dry_run) else local_path_obj

    if not safe_path_validate(str(target_path)):
        finished_at = datetime.utcnow().isoformat()
        _set_progress(running=False, finished_at=finished_at, status="failed", message="暫存路徑無效")
        add_sync_log(started_at, finished_at, "failed", "暫存路徑無效", "", "")
        return

    if use_staging and not dry_run:
        _empty_dir(STAGING_DIR)
    target_path.mkdir(parents=True, exist_ok=True)

    args = [
        "rclone",
        "sync",
        f"{remote_name}:{remote_dir}",
        str(target_path),
        "--config", str(RCLONE_CONFIG_PATH),
        "--filter", "+ *.mp3",
        "--filter", "+ *.MP3",
        "--filter", "- *",
        "--delete-excluded",
        "--progress",
        "--stats-one-line",
        "--stats-one-line-date",
        "--stats", "1s",
        "--contimeout", "30s",
        "--timeout", "60s",
    ]
    if dry_run:
        args.append("--dry-run")

    stdout_lines = []
    stderr_lines = []

    try:
        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        for line in proc.stdout:
            line = line.rstrip()
            stdout_lines.append(line)
            parsed = _parse_progress_line(line)
            if parsed:
                _set_progress(**parsed)
        proc.wait(timeout=600)
        ok = proc.returncode == 0
    except Exception as e:
        ok = False
        stderr_lines.append(str(e))

    # Failure protection: do NOT touch the live music folder on error
    if not ok and use_staging and not dry_run:
        _empty_dir(STAGING_DIR)

    # Atomic swap only after successful rclone run
    swap_ok = True
    if ok and use_staging and not dry_run:
        try:
            _atomic_replace_staging(local_path_obj)
            # Fallback: if the new folder is empty but the old folder had music,
            # roll back so playback never stops.
            new_count = _count_mp3(local_path_obj)
            if new_count == 0 and OLD_DIR.exists() and _count_mp3(OLD_DIR) > 0:
                shutil.rmtree(local_path_obj)
                OLD_DIR.rename(local_path_obj)
                stderr_lines.append("Staging folder was empty; rolled back to previous music")
                swap_ok = False
                ok = False
        except Exception as e:
            ok = False
            swap_ok = False
            stderr_lines.append(f"Staging swap failed: {e}")

    stdout = "\n".join(stdout_lines)
    stderr = "\n".join(stderr_lines)
    finished_at = datetime.utcnow().isoformat()

    status = "success" if ok else "failed"
    if dry_run:
        message = "Dry-run 完成" if ok else "Dry-run 失敗"
    else:
        if ok:
            message = "同步完成"
        elif not swap_ok:
            message = "同步暫存區替換失敗，已保留原始音樂"
        else:
            message = "同步失敗，已保留原始音樂"

    _set_progress(
        running=False,
        finished_at=finished_at,
        status=status,
        message=message,
        stdout=stdout,
        stderr=stderr,
    )

    add_sync_log(started_at, finished_at, status, message, stdout, stderr)
    set_setting("last_sync_at", finished_at)
    set_setting("last_sync_status", status)
    set_setting("last_sync_message", message)

    if ok and not dry_run:
        if mpv.mpv_is_running():
            mpv.reload_playlist()

    # Notify any open dashboard long-polling connections that sync finished.
    try:
        from app.routes.dashboard import bump_dashboard_version
        bump_dashboard_version()
    except Exception:
        pass


def start_sync(remote_path: str, local_path: str, dry_run: bool = False, use_staging: bool = True) -> dict:
    with _lock:
        if _current_sync["running"]:
            return {"ok": False, "stderr": "已有同步任務正在進行"}

    thread = threading.Thread(
        target=_run_sync,
        args=(remote_path, local_path, dry_run, use_staging),
        daemon=True,
    )
    thread.start()
    return {"ok": True, "message": "Dry-run 已啟動" if dry_run else "同步已啟動"}


def run_sync_sync(remote_path: str, local_path: str, dry_run: bool = False, use_staging: bool = True) -> dict:
    """Synchronous wrapper used by the systemd timer."""
    start_sync(remote_path, local_path, dry_run, use_staging)
    # Wait for completion
    import time
    for _ in range(720):
        progress = get_progress()
        if not progress["running"]:
            break
        time.sleep(5)
    return get_progress()
