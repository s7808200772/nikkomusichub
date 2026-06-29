"""Settings routes (store/device info)."""
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from pathlib import Path
import re

from app.config import (
    DATA_DIR,
    MQTT_BROKER,
    MQTT_COMMAND_SECRET,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_TLS,
    MQTT_TOPIC_PREFIX,
    MQTT_USERNAME,
    MUSIC_DIR,
    RCLONE_REMOTE_NAME_DEFAULT,
    RCLONE_REMOTE_PATH_DEFAULT,
    RCLONE_WEBDAV_URL_DEFAULT,
    RCLONE_WEBDAV_VENDOR_DEFAULT,
    SYNC_TIME_DEFAULT,
)
from app.db import audit, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services import rclone
from app.services.system import get_hostname, get_ip_addresses, run

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    get_current_user_or_local(request)
    store_id = get_setting("store_id", "")
    store_id_suffix = store_id.replace("store-", "") if store_id.startswith("store-") else store_id
    remote_path = get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT)
    remote_path_raw = get_setting("webdav_remote_path_raw", "")
    if not remote_path_raw:
        remote_path_raw = "/" + remote_path.split(":", 1)[-1].lstrip("/")
    mqtt_settings = await get_mqtt_settings(request)
    settings = {
        "store_name": get_setting("store_name", "未命名店鋪"),
        "store_id": store_id,
        "store_id_suffix": store_id_suffix,
        "url": get_setting("webdav_url", RCLONE_WEBDAV_URL_DEFAULT),
        "username": get_setting("webdav_username", ""),
        "remote_path": remote_path,
        "remote_path_display": "/" + remote_path.split(":", 1)[-1].lstrip("/"),
        "remote_path_raw": remote_path_raw,
        "local_path": get_setting("local_music_path", str(MUSIC_DIR)),
        "sync_mode": get_setting("sync_mode", "sync"),
        "daily_sync_enabled": bool(int(get_setting("daily_sync_enabled", "1"))),
        "sync_time": get_setting("sync_time", SYNC_TIME_DEFAULT),
        "boot_delay_min": int(get_setting("sync_boot_delay_min", "2")),
        "auto_restart_player": bool(int(get_setting("auto_restart_player", "1"))),
        "configured": rclone.get_rclone_config_exists(),
        "webdav_password": get_setting("webdav_password", ""),
        "mqtt": mqtt_settings,
        "wifi_ssid": get_setting("wifi_ssid", ""),
        "wifi_password": get_setting("wifi_password", ""),
        "network_priority": get_setting("network_priority", "ethernet"),
    }
    return templates.TemplateResponse("settings.html", {"request": request, "settings": settings})


@router.get("/api/settings/device")
async def get_device_settings(request: Request):
    get_current_user_or_local(request)
    return {
        "store_name": get_setting("store_name", "未命名店鋪"),
        "store_id": get_setting("store_id", ""),
        "hostname": get_hostname(),
        "tailscale_ip": get_ip_addresses()["tailscale_ip"],
    }


@router.post("/api/settings/device")
async def save_device_settings(
    request: Request,
    store_name: str = Form(...),
    store_id: str = Form(""),
):
    user = get_current_user_or_local(request)
    old_store_id = get_setting("store_id", "")
    raw = store_id.strip().lower()
    new_store_id = raw if raw.startswith("store-") else (f"store-{raw}" if raw else "")
    set_setting("store_name", store_name)
    set_setting("store_id", new_store_id)
    audit(user, "save_device_settings", {
        "store_name": store_name,
        "store_id": new_store_id,
    })
    # Restart MQTT agent so the new store ID takes effect immediately
    restart_result = {"ok": True}
    if old_store_id != new_store_id:
        restart_result = run(["sudo", "-n", "systemctl", "restart", "nikko-music-mqtt.service"], timeout=30)
        audit(user, "restart_mqtt_for_store_id_change", {"old": old_store_id, "new": new_store_id, "ok": restart_result.get("ok"), "stderr": restart_result.get("stderr")})
        if not restart_result.get("ok"):
            return {
                "ok": True,
                "warning": f"Store ID 已儲存，但 MQTT 服務重啟失敗：{restart_result.get('stderr', '未知錯誤')}。請手動執行 sudo systemctl restart nikko-music-mqtt.service。",
            }
    return {"ok": True}


ENV_FILE_PATH = DATA_DIR / "nikko.env"

DEFAULT_MQTT_BROKER = "114.55.1.51"
DEFAULT_MQTT_PORT = "1883"
DEFAULT_MQTT_USERNAME = "admin"
DEFAULT_MQTT_PASSWORD = "topup30%off"


def _read_env_lines() -> list[str]:
    if not ENV_FILE_PATH.exists():
        return []
    return ENV_FILE_PATH.read_text(encoding="utf-8").splitlines()


def _read_env_key(key: str, default: str = "") -> str:
    for line in _read_env_lines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1]
    return default


def _write_env_key(key: str, value: str) -> None:
    lines = _read_env_lines()
    out = []
    found = False
    for line in lines:
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    ENV_FILE_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")


def _valid_env_value(value: str) -> bool:
    return "\n" not in value and "\r" not in value


@router.get("/api/settings/mqtt")
async def get_mqtt_settings(request: Request):
    get_current_user_or_local(request)
    broker = _read_env_key("NIKKO_MQTT_BROKER", DEFAULT_MQTT_BROKER)
    port_str = _read_env_key("NIKKO_MQTT_PORT", DEFAULT_MQTT_PORT)
    tls_str = _read_env_key("NIKKO_MQTT_TLS", "0")
    username = _read_env_key("NIKKO_MQTT_USERNAME", DEFAULT_MQTT_USERNAME)
    password = _read_env_key("NIKKO_MQTT_PASSWORD", DEFAULT_MQTT_PASSWORD)
    return {
        "broker": broker,
        "port": int(port_str) if port_str.isdigit() else int(DEFAULT_MQTT_PORT),
        "tls": tls_str == "1",
        "username": username,
        "password": password,
        "password_set": bool(password),
    }


@router.post("/api/settings/mqtt")
async def save_mqtt_settings(
    request: Request,
    broker: str = Form(...),
    port: int = Form(...),
    tls: int = Form(0),
    username: str = Form(""),
    password: str = Form(""),
):
    user = get_current_user_or_local(request)
    broker = broker.strip()
    username = username.strip() or DEFAULT_MQTT_USERNAME
    password = password.strip() or DEFAULT_MQTT_PASSWORD

    if not re.fullmatch(r"[A-Za-z0-9.-]+", broker):
        return {"ok": False, "stderr": "Broker 格式不正確"}
    if not 1 <= int(port) <= 65535:
        return {"ok": False, "stderr": "Port 必須介於 1 到 65535"}
    if any(not _valid_env_value(value) for value in (username, password)):
        return {"ok": False, "stderr": "MQTT 設定不可包含換行字元"}

    _write_env_key("NIKKO_MQTT_BROKER", broker)
    _write_env_key("NIKKO_MQTT_PORT", str(int(port)))
    _write_env_key("NIKKO_MQTT_TLS", "1" if tls else "0")
    _write_env_key("NIKKO_MQTT_USERNAME", username)
    _write_env_key("NIKKO_MQTT_PASSWORD", password)

    restart_result = run(["sudo", "-n", "systemctl", "restart", "nikko-music-mqtt.service"], timeout=30)
    audit(
        user,
        "save_mqtt_settings",
        {
            "broker": broker,
            "port": int(port),
            "tls": bool(tls),
            "restart_ok": restart_result.get("ok"),
        },
    )
    if not restart_result.get("ok"):
        return {
            "ok": True,
            "warning": f"設定已寫入 nikko.env，但 MQTT 服務重啟失敗：{restart_result.get('stderr', '未知錯誤')}。請手動執行 sudo systemctl restart nikko-music-mqtt.service。",
        }
    return {"ok": True}
