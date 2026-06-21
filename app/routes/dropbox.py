"""Dropbox sync settings page."""
import re
from datetime import datetime

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    MUSIC_DIR,
    RCLONE_DROPBOX_PATH_DEFAULT,
    RCLONE_REMOTE_NAME_DEFAULT,
    SYNC_TIME_DEFAULT,
)
from app.db import audit, get_recent_sync_logs, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services import rclone
from app.services.system import run, safe_path_validate
from app.config import RCLONE_CONFIG_PATH

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/dropbox", response_class=HTMLResponse)
async def dropbox_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("dropbox.html", {"request": request})


@router.get("/api/dropbox/settings")
async def dropbox_settings(request: Request):
    get_current_user_or_local(request)
    return {
        "remote_name": get_setting("dropbox_remote", RCLONE_REMOTE_NAME_DEFAULT),
        "dropbox_path": get_setting("dropbox_path", RCLONE_DROPBOX_PATH_DEFAULT),
        "local_path": get_setting("local_music_path", str(MUSIC_DIR)),
        "sync_mode": get_setting("sync_mode", "sync"),
        "sync_time": get_setting("sync_time", SYNC_TIME_DEFAULT),
        "boot_delay_min": int(get_setting("sync_boot_delay_min", "2")),
        "auto_restart_player": bool(int(get_setting("auto_restart_player", "1"))),
        "configured": RCLONE_CONFIG_PATH.exists(),
    }


@router.post("/api/dropbox/settings")
async def save_dropbox_settings(
    request: Request,
    remote_name: str = Form(RCLONE_REMOTE_NAME_DEFAULT),
    dropbox_path: str = Form(RCLONE_DROPBOX_PATH_DEFAULT),
    local_path: str = Form(str(MUSIC_DIR)),
    sync_mode: str = Form("sync"),
    sync_time: str = Form(SYNC_TIME_DEFAULT),
    boot_delay_min: int = Form(2),
    auto_restart_player: int = Form(1),
):
    user = get_current_user_or_local(request)
    remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
    dropbox_path = dropbox_path.strip("/")
    if not safe_path_validate(local_path):
        return {"ok": False, "stderr": "Invalid local path"}

    set_setting("dropbox_remote", remote_name)
    set_setting("dropbox_path", dropbox_path)
    set_setting("local_music_path", local_path)
    set_setting("sync_mode", sync_mode)
    set_setting("sync_time", sync_time)
    set_setting("sync_boot_delay_min", str(boot_delay_min))
    set_setting("auto_restart_player", str(auto_restart_player))

    # Update systemd timer
    h, m = sync_time.split(":")
    timer_content = f"""[Unit]
Description=NikkoMusicHub Dropbox sync timer

[Timer]
OnBootSec={boot_delay_min}min
OnCalendar=*-*-* {h}:{m}:00
Persistent=true

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
    except Exception as e:
        return {"ok": False, "stderr": str(e)}

    audit(user, "save_dropbox_settings", {"remote": remote_name, "path": dropbox_path})
    return {"ok": True}


@router.post("/api/dropbox/dry-run")
async def dry_run_sync(request: Request):
    user = get_current_user_or_local(request)
    remote = get_setting("dropbox_remote", "dropbox")
    path = get_setting("dropbox_path", RCLONE_DROPBOX_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))
    res = rclone.sync_music(remote, path, local, dry_run=True)
    audit(user, "dry_run_sync", {"ok": res["ok"]})
    return res


@router.post("/api/dropbox/sync")
async def dropbox_sync(request: Request):
    user = get_current_user_or_local(request)
    remote = get_setting("dropbox_remote", "dropbox")
    path = get_setting("dropbox_path", RCLONE_DROPBOX_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))
    res = rclone.sync_music(remote, path, local)
    audit(user, "dropbox_sync", {"ok": res["ok"]})

    if res["ok"] and bool(int(get_setting("auto_restart_player", "1"))):
        from app.services import mpv
        if mpv.mpv_is_running():
            mpv.reload_playlist()
        else:
            mpv.start_player()
    return res


@router.get("/api/dropbox/sync-logs")
async def sync_logs(request: Request, limit: int = 20):
    get_current_user_or_local(request)
    return {"logs": get_recent_sync_logs(limit)}
