"""Logs viewer route."""
from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

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


def _parse_log_lines(text: str, log_type: str):
    entries = []
    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # Try to extract a timestamp at the beginning
        ts = ""
        msg = line
        if line.startswith("20") and " " in line:
            parts = line.split(" ", 2)
            if len(parts) >= 2 and parts[1].count(":") >= 2:
                ts = f"{parts[0]} {parts[1]}"
                msg = parts[2] if len(parts) > 2 else ""
        entries.append({
            "type": log_type,
            "timestamp": ts,
            "message": msg,
            "raw": line,
        })
    return entries


@router.get("/api/logs/all")
async def all_logs(request: Request):
    get_current_user_or_local(request)
    entries = []

    # Audit entries from database (most structured)
    for row in get_recent_audit_logs(100):
        entries.append({
            "type": "audit",
            "timestamp": row.get("created_at", ""),
            "message": f"{row.get('username', 'system')} - {row.get('action', '')}",
            "details": row.get("details", ""),
        })

    # Sync log lines
    entries.extend(_parse_log_lines(tail_log(SYNC_LOG_PATH, 200), "sync"))

    # Player log lines
    entries.extend(_parse_log_lines(tail_log(PLAYER_LOG_PATH, 200), "player"))

    # Audit log file (fallback, lines)
    entries.extend(_parse_log_lines(tail_log(AUDIT_LOG_PATH, 200), "audit-file"))

    # Sort by timestamp desc; entries without timestamp go to bottom
    def sort_key(e):
        ts = e.get("timestamp") or ""
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).isoformat()
        except Exception:
            return "1970-01-01T00:00:00"

    entries.sort(key=sort_key, reverse=True)
    return {"entries": entries}
