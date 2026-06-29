"""Health check endpoint."""
from fastapi import APIRouter, Request

from app.config import DATABASE_PATH, MUSIC_DIR, RCLONE_REMOTE_NAME_DEFAULT
from app.db import get_db
from app.routes.auth import get_current_user_or_local
from app.services import rclone
from app.services.system import (
    command_exists,
    get_disk_usage,
    get_ip_addresses,
    is_tailscale_up,
    service_status,
    tailscale_ping,
    webdav_connectivity_check,
)

router = APIRouter()


@router.get("/health")
def health_check(request: Request):
    """Public-ish health endpoint for monitoring and watchdog."""
    # Database check
    db_ok = False
    try:
        conn = get_db()
        conn.execute("SELECT 1").fetchone()
        db_ok = True
    except Exception:
        db_ok = False

    # Directory checks
    dirs_ok = MUSIC_DIR.exists() and DATABASE_PATH.parent.exists()

    # Service checks
    services = {
        "web": "running",  # we are serving this request
        "player": service_status("nikko-music-player.service"),
        "mqtt": service_status("nikko-music-mqtt.service"),
        "sync_timer": service_status("nikko-music-sync.timer"),
    }

    # Dependency checks
    rclone_ok = command_exists("rclone")
    webdav_ok = False
    if rclone_ok:
        try:
            from app.db import get_setting
            remote = get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT)
            webdav_ok = rclone.test_remote(remote).get("ok", False)
        except Exception:
            webdav_ok = False

    disk = get_disk_usage("/")
    disk_ok = disk.get("percent", 0) < 90

    overall = (
        db_ok
        and dirs_ok
        and services["mqtt"] == "active"
        and services["player"] in ("active", "inactive")
        and disk_ok
    )

    return {
        "ok": overall,
        "checks": {
            "database": db_ok,
            "directories": dirs_ok,
            "services": services,
            "rclone_installed": rclone_ok,
            "webdav_connected": webdav_ok,
            "tailscale_up": is_tailscale_up(),
            "disk": disk,
            "disk_ok": disk_ok,
        },
    }


@router.get("/api/health/qnap")
def webdav_health(request: Request):
    """Check WebDAV reachability via Tailscale."""
    get_current_user_or_local(request)
    from app.db import get_setting
    url = get_setting("webdav_url", "")
    result = webdav_connectivity_check(url)
    return result


@router.get("/api/health/tailscale")
def tailscale_health(request: Request):
    """Check Tailscale status and whether the WebDAV host is pingable."""
    get_current_user_or_local(request)
    from app.db import get_setting
    url = get_setting("webdav_url", "")
    host = ""
    try:
        from app.services.system import _extract_host_from_url
        host = _extract_host_from_url(url)
    except Exception:
        pass
    ping_res = tailscale_ping(host) if host else {"ok": False, "stderr": "no host"}
    ips = get_ip_addresses()
    return {
        "up": is_tailscale_up(),
        "ip": ips.get("tailscale_ip", ""),
        "webdav_host": host,
        "webdav_ping_ok": ping_res.get("ok", False),
    }


@router.get("/api/health")
def api_health_check(request: Request):
    """Authenticated health check (same data, but requires login)."""
    get_current_user_or_local(request)
    return health_check(request)
