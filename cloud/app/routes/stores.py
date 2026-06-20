"""Store management routes."""
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from cloud.app.config import BASE_DIR

from cloud.app.db import (
    audit,
    create_store,
    delete_store,
    get_store,
    list_stores,
    update_store,
)
from cloud.app.routes.auth import get_current_user

router = APIRouter()
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))


@router.get("/stores", response_class=HTMLResponse)
async def stores_page(request: Request):
    get_current_user(request)
    return templates.TemplateResponse("stores.html", {"request": request})


@router.get("/api/stores")
async def api_list_stores(request: Request):
    get_current_user(request)
    stores = list_stores()
    # Do not expose private keys in list API
    for s in stores:
        s["ssh_private_key"] = "***"
        s["local_api_key"] = "***"
    return {"stores": stores}


@router.get("/api/stores/{store_id}")
async def api_get_store(request: Request, store_id: str):
    get_current_user(request)
    store = get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store["ssh_private_key"] = "***"
    store["local_api_key"] = "***"
    return store


@router.post("/api/stores")
async def api_create_store(
    request: Request,
    store_id: str = Form(...),
    store_name: str = Form(...),
    tailscale_ip: str = Form(...),
    ssh_private_key: str = Form(...),
    local_api_key: str = Form(...),
    ssh_username: str = Form("pi"),
    ssh_port: int = Form(22),
    device_id: str = Form(""),
    hostname: str = Form(""),
    location_note: str = Form(""),
    music_profile: str = Form(""),
):
    user = get_current_user(request)
    if get_store(store_id):
        raise HTTPException(status_code=400, detail="store_id already exists")
    store = create_store(
        {
            "store_id": store_id,
            "store_name": store_name,
            "tailscale_ip": tailscale_ip,
            "ssh_private_key": ssh_private_key,
            "local_api_key": local_api_key,
            "ssh_username": ssh_username,
            "ssh_port": ssh_port,
            "device_id": device_id,
            "hostname": hostname,
            "location_note": location_note,
            "music_profile": music_profile,
        }
    )
    audit(user, store_id, "create_store", {"name": store_name})
    store["ssh_private_key"] = "***"
    store["local_api_key"] = "***"
    return store


@router.post("/api/stores/{store_id}")
async def api_update_store(
    request: Request,
    store_id: str,
    store_name: str = Form(None),
    tailscale_ip: str = Form(None),
    ssh_private_key: str = Form(None),
    local_api_key: str = Form(None),
    ssh_username: str = Form(None),
    ssh_port: int = Form(None),
    device_id: str = Form(None),
    hostname: str = Form(None),
    location_note: str = Form(None),
    music_profile: str = Form(None),
):
    user = get_current_user(request)
    data = {}
    for key, value in [
        ("store_name", store_name),
        ("tailscale_ip", tailscale_ip),
        ("ssh_private_key", ssh_private_key),
        ("local_api_key", local_api_key),
        ("ssh_username", ssh_username),
        ("ssh_port", ssh_port),
        ("device_id", device_id),
        ("hostname", hostname),
        ("location_note", location_note),
        ("music_profile", music_profile),
    ]:
        if value is not None:
            data[key] = value
    store = update_store(store_id, data)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    audit(user, store_id, "update_store", data)
    store["ssh_private_key"] = "***"
    store["local_api_key"] = "***"
    return store


@router.post("/api/stores/{store_id}/delete")
async def api_delete_store(request: Request, store_id: str):
    user = get_current_user(request)
    if not get_store(store_id):
        raise HTTPException(status_code=404, detail="Store not found")
    delete_store(store_id)
    audit(user, store_id, "delete_store", {})
    return {"ok": True}
