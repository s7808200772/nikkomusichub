"""Dashboard page and API."""
import asyncio
import threading

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

import app.config as config
from app.config import (
    MUSIC_DIR,
    PLAYER_LOG_PATH,
    PLAYER_SERVICE,
    RCLONE_CONFIG_PATH,
    RCLONE_REMOTE_NAME_DEFAULT,
    RCLONE_REMOTE_PATH_DEFAULT,
    RCLONE_WEBDAV_URL_DEFAULT,
    SYNC_LOG_PATH,
)
from app.db import get_recent_sync_logs, get_setting
from app.routes.auth import get_current_user_or_local
from app.services import mpv
from app.services.system import (
    command_exists,
    count_mp3_files,
    get_cpu_temp,
    get_cpu_usage,
    get_disk_usage,
    get_hostname,
    get_ip_addresses,
    get_mpv_version,
    get_music_folder_size,
    get_os_version,
    get_pi_model,
    get_python_version,
    get_rclone_version,
    get_ram_usage,
    get_uptime_seconds,
    is_tailscale_up,
    service_enabled,
    service_status,
    tail_log,
)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

# Simple event counter for dashboard long-polling. State-changing operations
# call bump_dashboard_version() so open /api/events connections return immediately.
_dashboard_version = 0
_dashboard_event = asyncio.Event()
_dashboard_lock = threading.Lock()


def bump_dashboard_version():
    global _dashboard_version
    with _dashboard_lock:
        _dashboard_version += 1
    _dashboard_event.set()


async def wait_dashboard_version(current: int, timeout: float = 30.0) -> int:
    try:
        await asyncio.wait_for(_dashboard_event.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        pass
    with _dashboard_lock:
        new_version = _dashboard_version
    _dashboard_event.clear()
    return new_version


@router.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    get_current_user_or_local(request)
    # Render status cards server-side to avoid the empty-then-pop layout shift.
    data = dashboard_data(request)
    return templates.TemplateResponse("dashboard.html", {"request": request, "data": data, "config": config})


@router.get("/api/dashboard")
def dashboard_data(request: Request):
    get_current_user_or_local(request)
    ips = get_ip_addresses()
    mpv_status = mpv.get_status()
    rclone_installed = command_exists("rclone")
    mpv_installed = command_exists("mpv")
    player_active = service_status(PLAYER_SERVICE)

    # Report whether WebDAV is configured. Actual reachability is checked
    # separately via /api/health/qnap so the dashboard worker is not blocked.
    webdav_configured = rclone_installed and RCLONE_CONFIG_PATH.exists()

    last_sync = get_setting("last_sync_at")
    last_sync_status = get_setting("last_sync_status", "never")
    last_sync_message = get_setting("last_sync_message", "")

    last_sync_display = last_sync
    if last_sync:
        try:
            from datetime import datetime
            last_sync_display = datetime.fromisoformat(last_sync).strftime("%Y-%m-%d %H:%M")
        except Exception:
            pass

    recent_errors = ""
    for log_path in (SYNC_LOG_PATH, PLAYER_LOG_PATH):
        tail = tail_log(log_path, lines=20)
        if "error" in tail.lower() or "failed" in tail.lower():
            recent_errors = tail
            break

    return {
        "store_name": get_setting("store_name", "未命名店鋪"),
        "store_id": get_setting("store_id", config.MQTT_STORE_ID or ""),
        "hostname": get_hostname(),
        "tailscale_ip": ips["tailscale_ip"],
        "lan_ip": ips["lan_ip"],
        "cpu_percent": get_cpu_usage(),
        "ram": get_ram_usage(),
        "disk": get_disk_usage("/"),
        "uptime_seconds": get_uptime_seconds(),
        "rclone_installed": rclone_installed,
        "mpv_installed": mpv_installed,
        "player_active": player_active,
        "webdav_configured": webdav_configured,
        "webdav_connected": False,
        "last_sync_at": last_sync_display,
        "last_sync_status": last_sync_status,
        "last_sync_message": last_sync_message,
        "webdav_remote": get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT),
        "webdav_url": get_setting("webdav_url", RCLONE_WEBDAV_URL_DEFAULT),
        "webdav_remote_path": get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT),
        "local_music_path": get_setting("local_music_path", str(MUSIC_DIR)),
        "player_status": mpv_status["state"],
        "current_track": mpv_status.get("current"),
        "mp3_count": count_mp3_files(MUSIC_DIR),
        "recent_errors": recent_errors,
        # System status details
        "pi_model": get_pi_model(),
        "os_version": get_os_version(),
        "python_version": get_python_version().split(" ")[0],
        "rclone_version": get_rclone_version(),
        "mpv_version": get_mpv_version(),
        "tailscale_up": is_tailscale_up(),
        "cpu_temp_c": get_cpu_temp(),
        "music_folder_size": get_music_folder_size(MUSIC_DIR),
        "web_service_status": service_status("nikko-music-hub-web.service"),
        "player_service_status": service_status(PLAYER_SERVICE),
        "sync_timer_status": service_status("nikko-music-sync.timer"),
        "mqtt_service_status": service_status("nikko-music-mqtt.service"),
        "player_service_enabled": service_enabled(PLAYER_SERVICE),
        "dashboard_version": _dashboard_version,
    }


@router.get("/api/events")
async def dashboard_events(request: Request, version: int = 0):
    """Long-polling endpoint for dashboard state changes."""
    get_current_user_or_local(request)
    new_version = await wait_dashboard_version(version)
    changed = new_version != version
    return {
        "changed": changed,
        "version": new_version,
        "data": dashboard_data(request) if changed else None,
    }
