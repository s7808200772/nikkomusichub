"""Remote command execution routes."""
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from cloud.app.config import BASE_DIR

from cloud.app.config import REMOTE_COMMANDS
from cloud.app.db import audit, get_store, update_store_status
from cloud.app.routes.auth import get_current_user
from cloud.app.ssh import fetch_status, run_ssh_command

router = APIRouter()
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))


@router.get("/commands", response_class=HTMLResponse)
async def commands_page(request: Request):
    get_current_user(request)
    return templates.TemplateResponse("commands.html", {"request": request})


@router.get("/api/commands/allowed")
async def api_allowed_commands(request: Request):
    get_current_user(request)
    return {
        "commands": [
            {"key": k, "label": v["label"]} for k, v in REMOTE_COMMANDS.items()
        ]
    }


@router.post("/api/stores/{store_id}/commands/{command_key}")
async def api_run_command(request: Request, store_id: str, command_key: str):
    user = get_current_user(request)
    store = get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if command_key not in REMOTE_COMMANDS:
        raise HTTPException(status_code=400, detail="Command not allowed")

    result = run_ssh_command(store_id, command_key)
    audit(user, store_id, f"cmd:{command_key}", {"ok": result.get("ok")})

    # Update store status if fetching status
    if command_key == "status_dashboard" and result.get("parsed"):
        parsed = result["parsed"]
        update_store_status(
            store_id,
            {
                "last_seen": parsed.get("last_sync_at") or parsed.get("uptime_seconds"),
                "last_sync_at": parsed.get("last_sync_at"),
                "last_error": parsed.get("recent_errors", "")[:500],
                "status": "online" if result["ok"] else "error",
            },
        )

    return result


@router.post("/api/stores/{store_id}/status")
async def api_store_status(request: Request, store_id: str):
    get_current_user(request)
    store = get_store(store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    result = fetch_status(store_id)
    if result.get("parsed"):
        parsed = result["parsed"]
        update_store_status(
            store_id,
            {
                "last_seen": parsed.get("last_sync_at") or parsed.get("uptime_seconds"),
                "last_sync_at": parsed.get("last_sync_at"),
                "last_error": parsed.get("recent_errors", "")[:500],
                "status": "online" if result["ok"] else "error",
            },
        )
    return result
