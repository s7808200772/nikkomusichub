"""Logs viewer route."""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import AUDIT_LOG_PATH, PLAYER_LOG_PATH, SYNC_LOG_PATH
from app.db import get_recent_audit_logs
from app.routes.auth import get_current_user_or_local
from app.services.system import tail_log

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/logs", response_class=HTMLResponse)
async def logs_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("logs.html", {"request": request})


@router.get("/api/logs/all")
async def all_logs(request: Request):
    get_current_user_or_local(request)
    return {
        "sync_log": tail_log(SYNC_LOG_PATH, 200),
        "player_log": tail_log(PLAYER_LOG_PATH, 200),
        "audit_log": tail_log(AUDIT_LOG_PATH, 200),
        "audit_entries": get_recent_audit_logs(100),
    }
