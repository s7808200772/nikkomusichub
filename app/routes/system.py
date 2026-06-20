"""System status and maintenance routes."""
import shutil
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import MUSIC_DIR, PLAYER_LOG_PATH, SYNC_LOG_PATH, SYSTEM_LOG_PATH
from app.db import audit, get_setting
from app.routes.auth import get_current_user_or_local
from app.services import mpv, rclone
from app.services.system import (
    command_exists,
    count_mp3_files,
    get_cpu_temp,
    get_disk_usage,
    get_hostname,
    get_ip_addresses,
    get_mpv_version,
    get_music_folder_size,
    get_os_version,
    get_pi_model,
    get_python_version,
    get_rclone_version,
    get_uptime_seconds,
    is_tailscale_up,
    list_music_files,
    reboot,
    run,
    safe_path_validate,
    service_enabled,
    service_status,
    tail_journal,
    tail_log,
    test_audio,
)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/system", response_class=HTMLResponse)
async def system_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("system.html", {"request": request})


@router.get("/api/system/info")
async def system_info(request: Request):
    get_current_user_or_local(request)
    ips = get_ip_addresses()
    return {
        "pi_model": get_pi_model(),
        "os_version": get_os_version(),
        "python_version": get_python_version(),
        "rclone_version": get_rclone_version(),
        "mpv_version": get_mpv_version(),
        "hostname": get_hostname(),
        "lan_ip": ips["lan_ip"],
        "tailscale_ip": ips["tailscale_ip"],
        "tailscale_up": is_tailscale_up(),
        "cpu_temp_c": get_cpu_temp(),
        "uptime_seconds": get_uptime_seconds(),
        "disk": get_disk_usage("/"),
        "music_folder_size": get_music_folder_size(MUSIC_DIR),
        "mp3_count": count_mp3_files(MUSIC_DIR),
        "web_service_status": service_status("nikko-music-hub-web.service"),
        "player_service_status": service_status("nikko-music-player.service"),
        "sync_timer_status": service_status("nikko-music-sync.timer"),
        "player_service_enabled": service_enabled("nikko-music-player.service"),
    }


@router.get("/api/system/logs")
async def system_logs(request: Request):
    get_current_user_or_local(request)
    return {
        "system_log": tail_journal("nikko-music-hub-web.service", 100),
        "sync_log": tail_log(SYNC_LOG_PATH, 100),
        "player_log": tail_log(PLAYER_LOG_PATH, 100),
    }


@router.post("/api/system/restart-player")
async def restart_player(request: Request):
    user = get_current_user_or_local(request)
    run(["sudo", "systemctl", "restart", "nikko-music-player.service"], timeout=30)
    res = {"ok": True}
    audit(user, "restart_player", {})
    return res


@router.post("/api/system/stop-player")
async def stop_player_service(request: Request):
    user = get_current_user_or_local(request)
    run(["sudo", "systemctl", "stop", "nikko-music-player.service"], timeout=30)
    res = {"ok": True}
    audit(user, "stop_player_service", {})
    return res


@router.post("/api/system/start-player")
async def start_player_service(request: Request):
    user = get_current_user_or_local(request)
    run(["sudo", "systemctl", "start", "nikko-music-player.service"], timeout=30)
    res = {"ok": True}
    audit(user, "start_player_service", {})
    return res


@router.post("/api/system/reboot")
async def system_reboot(request: Request):
    user = get_current_user_or_local(request)
    audit(user, "system_reboot", {})
    return reboot()


@router.post("/api/system/rescan")
async def rescan_music(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.reload_playlist()
    audit(user, "rescan_music", res)
    return res


@router.post("/api/system/test-audio")
async def api_test_audio(request: Request):
    user = get_current_user_or_local(request)
    res = test_audio()
    audit(user, "test_audio", {"ok": res["ok"]})
    return res


@router.post("/api/system/clear-music")
async def clear_music(request: Request, confirm: str = Form(...)):
    user = get_current_user_or_local(request)
    if confirm != "DELETE":
        return {"ok": False, "stderr": "Confirmation mismatch"}
    try:
        deleted = 0
        for item in MUSIC_DIR.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
            deleted += 1
        audit(user, "clear_music", {"ok": True, "deleted": deleted})
        return {"ok": True, "stdout": f"Deleted {deleted} items", "stderr": ""}
    except Exception as e:
        audit(user, "clear_music", {"ok": False, "error": str(e)})
        return {"ok": False, "stdout": "", "stderr": str(e)}
