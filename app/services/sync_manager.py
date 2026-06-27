"""Background sync manager with progress tracking."""
import re
import subprocess
import threading
from datetime import datetime

from app.config import MUSIC_DIR, RCLONE_CONFIG_PATH, RCLONE_REMOTE_PATH_DEFAULT
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


def _run_sync(remote_path: str, local_path: str, dry_run: bool):
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

    from pathlib import Path
    Path(local_path).mkdir(parents=True, exist_ok=True)

    args = [
        "rclone",
        "sync",
        f"{remote_name}:{remote_dir}",
        local_path,
        "--config", str(RCLONE_CONFIG_PATH),
        "--include", "*.mp3",
        "--include", "*.MP3",
        "--exclude", "*",
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

    stdout = "\n".join(stdout_lines)
    stderr = "\n".join(stderr_lines)
    finished_at = datetime.utcnow().isoformat()

    status = "success" if ok else "failed"
    if dry_run:
        message = "Dry-run 完成" if ok else "Dry-run 失敗"
    else:
        message = "同步完成" if ok else "同步失敗"

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
        auto_restart = True  # controlled by caller/settings
        if mpv.mpv_is_running():
            mpv.reload_playlist()
        # Do not auto-start player here to avoid surprising the user


def start_sync(remote_path: str, local_path: str, dry_run: bool = False) -> dict:
    with _lock:
        if _current_sync["running"]:
            return {"ok": False, "stderr": "已有同步任務正在進行"}

    thread = threading.Thread(
        target=_run_sync,
        args=(remote_path, local_path, dry_run),
        daemon=True,
    )
    thread.start()
    return {"ok": True, "message": "Dry-run 已啟動" if dry_run else "同步已啟動"}
