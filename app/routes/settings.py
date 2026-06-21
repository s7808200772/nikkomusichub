"""Settings routes (store/device info)."""
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import MUSIC_DIR
from app.db import audit, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services.system import get_hostname, get_ip_addresses

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


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
    set_setting("store_name", store_name)
    set_setting("store_id", store_id.strip().lower())
    audit(user, "save_device_settings", {"store_name": store_name, "store_id": store_id})
    return {"ok": True}
