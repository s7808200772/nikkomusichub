"""QNAP NAS WebDAV sync settings page."""
import re

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    MUSIC_DIR,
    RCLONE_REMOTE_NAME_DEFAULT,
    RCLONE_REMOTE_PATH_DEFAULT,
    RCLONE_WEBDAV_URL_DEFAULT,
    RCLONE_WEBDAV_VENDOR_DEFAULT,
    SYNC_TIME_DEFAULT,
)
from app.db import audit, get_recent_sync_logs, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services import rclone, sync_manager
from app.services.system import run, safe_path_validate

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/webdav")
async def webdav_page(request: Request):
    get_current_user_or_local(request)
    return RedirectResponse(url="/settings", status_code=303)


@router.get("/api/webdav/settings")
async def webdav_settings(request: Request):
    get_current_user_or_local(request)
    return {
        "remote_name": get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT),
        "url": get_setting("webdav_url", RCLONE_WEBDAV_URL_DEFAULT),
        "vendor": get_setting("webdav_vendor", RCLONE_WEBDAV_VENDOR_DEFAULT),
        "username": get_setting("webdav_username", ""),
        "remote_path": get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT),
        "local_path": get_setting("local_music_path", str(MUSIC_DIR)),
        "sync_mode": get_setting("sync_mode", "sync"),
        "daily_sync_enabled": bool(int(get_setting("daily_sync_enabled", "1"))),
        "sync_time": get_setting("sync_time", SYNC_TIME_DEFAULT),
        "boot_delay_min": int(get_setting("sync_boot_delay_min", "2")),
        "auto_restart_player": bool(int(get_setting("auto_restart_player", "1"))),
        "configured": rclone.get_rclone_config_exists(),
    }


@router.post("/api/webdav/settings")
async def save_webdav_settings(
    request: Request,
    remote_name: str = Form(RCLONE_REMOTE_NAME_DEFAULT),
    url: str = Form(RCLONE_WEBDAV_URL_DEFAULT),
    vendor: str = Form(RCLONE_WEBDAV_VENDOR_DEFAULT),
    username: str = Form(""),
    password: str = Form(""),
    remote_path: str = Form(RCLONE_REMOTE_PATH_DEFAULT),
    local_path: str = Form(str(MUSIC_DIR)),
):
    user = get_current_user_or_local(request)
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    if not safe_path_validate(local_path):
        return {"ok": False, "stderr": "Invalid local path"}
    if not username:
        return {"ok": False, "stderr": "Username is required"}

    # Only rewrite rclone config if a password was provided; otherwise keep existing config
    if password:
        try:
            rclone.write_rclone_config(remote_name, url, vendor, username, password)
        except Exception as e:
            return {"ok": False, "stderr": str(e)}
    elif not rclone.get_rclone_config_exists():
        return {"ok": False, "stderr": "Password is required for first-time WebDAV setup"}

    set_setting("webdav_remote", remote_name)
    set_setting("webdav_url", url)
    set_setting("webdav_vendor", vendor)
    set_setting("webdav_username", username)
    set_setting("webdav_remote_path", remote_path)
    set_setting("local_music_path", local_path)

    audit(user, "save_webdav_settings", {
        "remote": remote_name,
        "url": url,
        "remote_path": remote_path,
    })
    return {"ok": True}


@router.post("/api/webdav/sync-settings")
async def save_sync_settings(
    request: Request,
    sync_mode: str = Form("sync"),
    sync_time: str = Form(SYNC_TIME_DEFAULT),
    boot_delay_min: int = Form(2),
    auto_restart_player: int = Form(1),
    daily_sync_enabled: int = Form(1),
):
    user = get_current_user_or_local(request)

    if not re.match(r"^\d{2}:\d{2}$", sync_time):
        return {"ok": False, "stderr": "Sync time must be HH:MM"}

    set_setting("sync_mode", sync_mode)
    set_setting("daily_sync_enabled", str(daily_sync_enabled))
    set_setting("sync_time", sync_time)
    set_setting("sync_boot_delay_min", str(boot_delay_min))
    set_setting("auto_restart_player", str(auto_restart_player))

    # Update systemd timer
    h, m = sync_time.split(":")
    if daily_sync_enabled:
        timer_content = f"""[Unit]
Description=NikkoMusicHub WebDAV sync timer

[Timer]
OnBootSec={boot_delay_min}min
OnCalendar=*-*-* {h}:{m}:00
Persistent=true

[Install]
WantedBy=timers.target
"""
    else:
        timer_content = f"""[Unit]
Description=NikkoMusicHub WebDAV sync timer (disabled)

[Timer]
# Daily sync disabled; only run once after boot if needed
OnBootSec={boot_delay_min}min
Persistent=false

[Install]
WantedBy=timers.target
"""
    timer_path = "/etc/systemd/system/nikko-music-sync.timer"
    try:
        with open("/tmp/nikko-music-sync.timer", "w", encoding="utf-8") as f:
            f.write(timer_content)
        run(["sudo", "cp", "/tmp/nikko-music-sync.timer", timer_path], timeout=10)
        run(["sudo", "chmod", "644", timer_path], timeout=10)
        run(["sudo", "systemctl", "daemon-reload"], timeout=10)
        run(["sudo", "systemctl", "restart", "nikko-music-sync.timer"], timeout=10)
        if not daily_sync_enabled:
            run(["sudo", "systemctl", "stop", "nikko-music-sync.timer"], timeout=10)
    except Exception as e:
        return {"ok": False, "stderr": str(e)}

    audit(user, "save_sync_settings", {
        "daily_sync": bool(daily_sync_enabled),
        "sync_time": sync_time,
        "boot_delay_min": boot_delay_min,
    })
    return {"ok": True}


@router.post("/api/webdav/test-remote")
async def test_webdav_remote(request: Request):
    user = get_current_user_or_local(request)
    remote = get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT)
    res = rclone.test_remote(remote)
    audit(user, "test_webdav_remote", {"ok": res["ok"]})
    return res


@router.post("/api/webdav/list-music")
async def list_webdav_music(request: Request):
    user = get_current_user_or_local(request)
    remote = get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT)
    remote_path = get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT)
    res = rclone.list_remote_music(remote, remote_path)
    audit(user, "list_webdav_music", {"ok": res["ok"]})
    return res


@router.post("/api/webdav/dry-run")
async def dry_run_sync(request: Request):
    user = get_current_user_or_local(request)
    remote_path = get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))
    res = sync_manager.start_sync(remote_path, local, dry_run=True)
    audit(user, "dry_run_webdav_sync", {"ok": res["ok"]})
    return res


@router.post("/api/webdav/sync")
async def webdav_sync(request: Request):
    user = get_current_user_or_local(request)
    remote_path = get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))
    res = sync_manager.start_sync(remote_path, local)
    audit(user, "webdav_sync", {"ok": res["ok"]})
    return res


@router.get("/api/webdav/sync-progress")
async def sync_progress(request: Request):
    get_current_user_or_local(request)
    return sync_manager.get_progress()


@router.post("/api/webdav/clear-local")
async def clear_local(request: Request):
    user = get_current_user_or_local(request)
    local = get_setting("local_music_path", str(MUSIC_DIR))
    res = rclone.clear_local_music(local)
    audit(user, "clear_local_music", {"ok": res["ok"]})
    return res


@router.get("/api/webdav/sync-logs")
async def sync_logs(request: Request, limit: int = 20):
    get_current_user_or_local(request)
    return {"logs": get_recent_sync_logs(limit)}
