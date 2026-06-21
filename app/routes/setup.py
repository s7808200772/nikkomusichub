"""Setup wizard routes."""
import re
from datetime import datetime

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    BASE_DIR,
    LOGS_DIR,
    MUSIC_DIR,
    RCLONE_DROPBOX_PATH_DEFAULT,
    RCLONE_REMOTE_NAME_DEFAULT,
    SCRIPTS_DIR,
)
from app.db import audit, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services import mpv, rclone
from app.services.system import run, safe_path_validate

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def _log(action: str, result: dict, user: str):
    audit(user, action, {"ok": result.get("ok"), "returncode": result.get("returncode")})


@router.get("/setup", response_class=HTMLResponse)
async def setup_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("setup.html", {"request": request})


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
    return res


@router.post("/api/setup/install-rclone")
async def install_rclone(request: Request):
    user = get_current_user_or_local(request)
    res = rclone.install_rclone()
    if res["ok"]:
        res2 = run(["rclone", "version"], timeout=10)
        res["stdout"] = (res.get("stdout", "") + "\n" + res2.get("stdout", "")).strip()
    _log("install_rclone", res, user)
    return res


@router.post("/api/setup/install-mpv")
async def install_mpv(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.install_mpv()
    if res["ok"]:
        res2 = run(["mpv", "--version"], timeout=10)
        res["stdout"] = (res.get("stdout", "") + "\n" + res2.get("stdout", "")).strip()
    _log("install_mpv", res, user)
    return res


@router.post("/api/setup/create-folders")
async def create_folders(request: Request):
    user = get_current_user_or_local(request)
    try:
        for d in (BASE_DIR, MUSIC_DIR, LOGS_DIR, SCRIPTS_DIR):
            d.mkdir(parents=True, exist_ok=True)
        return {"ok": True, "stdout": f"Folders created under {BASE_DIR}", "stderr": ""}
    except Exception as e:
        return {"ok": False, "stdout": "", "stderr": str(e)}


@router.post("/api/setup/dropbox")
async def setup_dropbox(
    request: Request,
    remote_name: str = Form(RCLONE_REMOTE_NAME_DEFAULT),
    token_json: str = Form(...),
    dropbox_path: str = Form(RCLONE_DROPBOX_PATH_DEFAULT),
    local_path: str = Form(str(MUSIC_DIR)),
):
    user = get_current_user_or_local(request)
    try:
        remote_name = re.sub(r"[^a-zA-Z0-9_-]", "", remote_name) or RCLONE_REMOTE_NAME_DEFAULT
        if not safe_path_validate(local_path):
            raise ValueError("Invalid local path")
        # Only update rclone config if a token was provided; otherwise keep existing config
        if token_json and token_json.strip():
            remote = rclone.write_rclone_config(remote_name, token_json)
            set_setting("dropbox_remote", remote)
        set_setting("dropbox_path", dropbox_path.strip("/"))
        set_setting("local_music_path", local_path)
        audit(user, "setup_dropbox", {"remote": remote_name, "dropbox_path": dropbox_path, "local_path": local_path})
        return {"ok": True, "stdout": f"Dropbox remote '{remote_name}' settings saved", "stderr": ""}
    except Exception as e:
        return {"ok": False, "stdout": "", "stderr": str(e)}


@router.post("/api/setup/test-dropbox")
async def test_dropbox(request: Request):
    user = get_current_user_or_local(request)
    remote = get_setting("dropbox_remote", "dropbox")
    res = rclone.test_dropbox(remote)
    _log("test_dropbox", res, user)
    return res


@router.post("/api/setup/sync")
async def manual_sync(request: Request):
    user = get_current_user_or_local(request)
    remote = get_setting("dropbox_remote", "dropbox")
    path = get_setting("dropbox_path", RCLONE_DROPBOX_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))
    res = rclone.sync_music(remote, path, local)
    _log("manual_sync", res, user)
    return res


@router.post("/api/setup/install-service")
async def install_service(request: Request):
    user = get_current_user_or_local(request)
    # Services are installed by install.sh; this endpoint reloads systemd just in case.
    res = run(["sudo", "systemctl", "daemon-reload"], timeout=30)
    _log("install_service", res, user)
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
