"""Self-test endpoint and runner for the Pi app."""
import os
import socket
import sys
from pathlib import Path

from fastapi import APIRouter, Request

from app.config import (
    BASE_DIR,
    DATABASE_PATH,
    MUSIC_DIR,
    SECRET_KEY,
    MQTT_COMMAND_SECRET,
    RCLONE_CONFIG_PATH,
    RCLONE_REMOTE_NAME_DEFAULT,
)
from app.db import get_setting, get_db
from app.routes.auth import get_current_user_or_local
from app.services import rclone
from app.services.mqtt_auth import ALLOWED_COMMANDS
from app.services.system import (
    command_exists,
    get_disk_usage,
    service_status,
    is_tailscale_up,
)

router = APIRouter()


def _check(name: str, ok: bool, detail: str = "") -> dict:
    return {"name": name, "ok": ok, "detail": detail}


def _can_connect(host: str, port: int, timeout: float = 5.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def run_self_tests() -> list:
    results = []

    # 1. Secret keys
    results.append(_check(
        "01. Secret key 長度",
        bool(SECRET_KEY and len(SECRET_KEY) >= 32),
        f"長度 {len(SECRET_KEY) if SECRET_KEY else 0}",
    ))
    results.append(_check(
        "02. MQTT command secret 長度",
        bool(MQTT_COMMAND_SECRET and len(MQTT_COMMAND_SECRET) >= 32),
        f"長度 {len(MQTT_COMMAND_SECRET) if MQTT_COMMAND_SECRET else 0}",
    ))

    # 2. Database
    try:
        conn = get_db()
        conn.execute("SELECT 1")
        results.append(_check("03. SQLite 連線", True))
    except Exception as e:
        results.append(_check("03. SQLite 連線", False, str(e)))

    # 3. Music folder
    results.append(_check(
        "04. 音樂資料夾存在",
        MUSIC_DIR.exists(),
        str(MUSIC_DIR),
    ))
    mp3_count = sum(1 for _ in MUSIC_DIR.rglob("*.mp3")) if MUSIC_DIR.exists() else 0
    results.append(_check(
        "05. 音樂資料夾有 MP3",
        mp3_count > 0,
        f"{mp3_count} 首",
    ))

    # 4. Binaries
    results.append(_check("06. mpv 已安裝", command_exists("mpv")))
    results.append(_check("07. rclone 已安裝", command_exists("rclone")))
    results.append(_check("08. tailscale 已安裝", command_exists("tailscale")))

    # 5. Rclone config
    results.append(_check("09. rclone.conf 存在", RCLONE_CONFIG_PATH.exists(), str(RCLONE_CONFIG_PATH)))

    # 6. Tailscale
    results.append(_check("10. Tailscale 上線", is_tailscale_up()))

    # 7. WebDAV reachability
    webdav_url = get_setting("webdav_url", "")
    remote = get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT)
    webdav_test = rclone.test_remote(remote) if RCLONE_CONFIG_PATH.exists() else {"ok": False, "stderr": "no config"}
    results.append(_check(
        "11. WebDAV 可連線",
        webdav_test.get("ok", False),
        webdav_url or "未設定",
    ))

    # 8. MQTT broker reachability
    mqtt_broker = os.environ.get("NIKKO_MQTT_BROKER", get_setting("mqtt_broker", ""))
    mqtt_port = int(os.environ.get("NIKKO_MQTT_PORT", get_setting("mqtt_port", "8883")))
    results.append(_check(
        "12. MQTT broker 可連線",
        _can_connect(mqtt_broker, mqtt_port) if mqtt_broker else False,
        f"{mqtt_broker}:{mqtt_port}" if mqtt_broker else "未設定",
    ))

    # 9. Systemd services (Linux only)
    if sys.platform.startswith("linux"):
        for svc in [
            "nikko-music-hub-web.service",
            "nikko-music-player.service",
            "nikko-music-mqtt.service",
        ]:
            status = service_status(svc)
            results.append(_check(f"13. {svc}", status == "active", status))
    else:
        results.append(_check("13. systemd 服務狀態", False, "非 Linux 環境，略過"))

    # 10. Disk space
    disk = get_disk_usage("/")
    results.append(_check(
        "14. 根目錄磁碟空間",
        disk.get("percent", 100) < 90,
        f"{disk.get('percent', '?')}% 已用",
    ))

    # 11. Allowed commands sanity
    results.append(_check(
        "15. MQTT 指令白名單",
        bool(ALLOWED_COMMANDS),
        f"{len(ALLOWED_COMMANDS)} 個指令",
    ))

    return results


@router.get("/api/self-test")
def self_test(request: Request):
    get_current_user_or_local(request)
    results = run_self_tests()
    passed = sum(1 for r in results if r["ok"])
    return {
        "ok": all(r["ok"] for r in results),
        "passed": passed,
        "total": len(results),
        "results": results,
    }
