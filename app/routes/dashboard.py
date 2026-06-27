"""Dashboard page and API."""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    MUSIC_DIR,
    PLAYER_LOG_PATH,
    RCLONE_CONFIG_PATH,
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


@router.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("dashboard.html", {"request": request})


@router.get("/api/dashboard")
def dashboard_data(request: Request):
    get_current_user_or_local(request)
    ips = get_ip_addresses()
    mpv_status = mpv.get_status()
    rclone_installed = command_exists("rclone")
    mpv_installed = command_exists("mpv")
    player_active = service_status("nikko-music-player.service")

    # Report WebDAV status based on whether a config exists.
    # Actual connectivity is tested manually from Settings to avoid blocking
    # the dashboard worker with a synchronous network call every 5 seconds.
    webdav_ok = rclone_installed and RCLONE_CONFIG_PATH.exists()

    last_sync = get_setting("last_sync_at")
    last_sync_status = get_setting("last_sync_status", "never")
    last_sync_message = get_setting("last_sync_message", "")

    recent_errors = ""
    for log_path in (SYNC_LOG_PATH, PLAYER_LOG_PATH):
        tail = tail_log(log_path, lines=20)
        if "error" in tail.lower() or "failed" in tail.lower():
            recent_errors = tail
            break

    return {
        "store_name": get_setting("store_name", "未命名店鋪"),
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
        "webdav_connected": webdav_ok,
        "last_sync_at": last_sync,
        "last_sync_status": last_sync_status,
        "last_sync_message": last_sync_message,
        "webdav_remote": get_setting("webdav_remote", "qnapmusic"),
        "webdav_url": get_setting("webdav_url", "http://100.106.208.65:5005/"),
        "webdav_remote_path": get_setting("webdav_remote_path", "qnapmusic:NikkoMusic"),
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
        "player_service_status": service_status("nikko-music-player.service"),
        "sync_timer_status": service_status("nikko-music-sync.timer"),
        "mqtt_service_status": service_status("nikko-music-mqtt.service"),
        "player_service_enabled": service_enabled("nikko-music-player.service"),
    }
