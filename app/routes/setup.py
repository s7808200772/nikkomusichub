"""Setup wizard routes."""
import re
from datetime import datetime

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    BASE_DIR,
    LOGS_DIR,
    MUSIC_DIR,
    RCLONE_REMOTE_NAME_DEFAULT,
    SCRIPTS_DIR,
)
from app.db import audit, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services import mpv, rclone
from app.services.system import run, safe_path_validate
from app.services.watchdog import install_watchdog

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def _log(action: str, result: dict, user: str):
    audit(user, action, {"ok": result.get("ok"), "returncode": result.get("returncode")})


@router.get("/setup")
async def setup_page(request: Request):
    get_current_user_or_local(request)
    return RedirectResponse(url="/settings", status_code=303)


def _humanize_apt(res: dict) -> dict:
    if res.get("ok"):
        res["message"] = "系統更新完成：套件清單已更新，所有套件已升級到最新版本。"
        return res
    err = (res.get("stderr") or "").lower()
    if "a terminal is required" in err or "password" in err:
        res["message"] = "系統更新失敗：需要 sudo 密碼。請在 Pi 本機執行一次 `sudo apt update && sudo apt upgrade -y`，或在 /etc/sudoers 加入免密權限。"
    else:
        res["message"] = "系統更新失敗：" + (res.get("stderr") or "未知錯誤")
    return res


@router.post("/api/setup/apt-update")
async def apt_update(request: Request):
    user = get_current_user_or_local(request)
    res = run(["sudo", "apt", "update"], timeout=300)
    if res["ok"]:
        upg = run(["sudo", "apt", "upgrade", "-y"], timeout=600)
        res["stdout"] += "\n" + upg.get("stdout", "")
        res["stderr"] += "\n" + upg.get("stderr", "")
        res["ok"] = upg["ok"]
    _log("apt_update", res, user)
    return _humanize_apt(res)


def _humanize_rclone(stdout: str) -> str:
    lines = [l for l in (stdout or "").splitlines() if l.strip()]
    if not lines:
        return "rclone 已安裝（無法取得版本資訊）"
    first = lines[0]
    if "already installed" in first.lower():
        return "rclone 已經安裝完成，無需再次安裝。"
    # Extract version line like "rclone v1.60.1-DEV"
    ver = first
    return f"rclone 安裝完成，目前版本：{ver}。"


@router.post("/api/setup/install-rclone")
async def install_rclone(request: Request):
    user = get_current_user_or_local(request)
    res = rclone.install_rclone()
    if res["ok"]:
        res2 = run(["rclone", "version"], timeout=10)
        combined = (res.get("stdout", "") + "\n" + res2.get("stdout", "")).strip()
        res["stdout"] = _humanize_rclone(combined)
    else:
        res["stdout"] = "rclone 安裝失敗：" + (res.get("stderr") or "未知錯誤")
    _log("install_rclone", res, user)
    return res


def _humanize_mpv(stdout: str) -> str:
    lines = [l for l in (stdout or "").splitlines() if l.strip()]
    if not lines:
        return "mpv 已安裝（無法取得版本資訊）"
    first = lines[0]
    if "already installed" in first.lower():
        return "mpv 已經安裝完成，無需再次安裝。"
    ver = first
    return f"mpv 安裝完成，目前版本：{ver}。"


@router.post("/api/setup/install-mpv")
async def install_mpv(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.install_mpv()
    if res["ok"]:
        res2 = run(["mpv", "--version"], timeout=10)
        combined = (res.get("stdout", "") + "\n" + res2.get("stdout", "")).strip()
        res["stdout"] = _humanize_mpv(combined)
    else:
        res["stdout"] = "mpv 安裝失敗：" + (res.get("stderr") or "未知錯誤")
    _log("install_mpv", res, user)
    return res


@router.post("/api/setup/create-folders")
async def create_folders(request: Request):
    user = get_current_user_or_local(request)
    try:
        for d in (BASE_DIR, MUSIC_DIR, LOGS_DIR, SCRIPTS_DIR):
            d.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "stdout": f"音樂與紀錄資料夾已建立於 {BASE_DIR}", "stderr": ""}
    except Exception as e:
        return {"ok": False, "stdout": "", "stderr": str(e)}


@router.post("/api/setup/install-service")
async def install_service(request: Request):
    user = get_current_user_or_local(request)
    # Services are installed by install.sh; this endpoint reloads systemd just in case.
    res = run(["sudo", "systemctl", "daemon-reload"], timeout=30)
    if res.get("ok"):
        res["stdout"] = "systemd 設定已重新載入，所有服務檔案已更新。"
    else:
        res["stdout"] = "重新載入 systemd 失敗：" + (res.get("stderr") or "未知錯誤")
    _log("install_service", res, user)
    return res


@router.post("/api/setup/install-watchdog")
async def install_watchdog_route(
    request: Request,
    target: str = Form("8.8.8.8"),
    interval: int = Form(300),
    retries: int = Form(5),
):
    user = get_current_user_or_local(request)
    from app.services.watchdog import install_watchdog
    res = install_watchdog(target=target, interval=interval, retries=retries)
    _log("install_watchdog", res, user)
    return res


@router.post("/api/setup/enable-player")
async def enable_player(request: Request):
    user = get_current_user_or_local(request)
    res = run(["sudo", "systemctl", "enable", "nikko-music-player.service"], timeout=30)
    _log("enable_player", res, user)
    return res


@router.post("/api/setup/disable-player")
async def disable_player(request: Request):
    user = get_current_user_or_local(request)
    res = run(["sudo", "systemctl", "disable", "nikko-music-player.service"], timeout=30)
    _log("disable_player", res, user)
    return res
