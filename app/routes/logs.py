"""Logs viewer route."""
import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from app.config import AUDIT_LOG_PATH, PLAYER_LOG_PATH, SYNC_LOG_PATH
from app.db import get_db, get_recent_audit_logs
from app.routes.auth import get_current_user_or_local, user_uses_initial_password
from app.services.system import tail_log

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/logs", response_class=HTMLResponse)
async def logs_page(request: Request):
    user = get_current_user_or_local(request)
    if user != "local" and user_uses_initial_password(user):
        return RedirectResponse(url="/settings?force_password=1", status_code=303)
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


@router.get("/api/logs/stats")
async def logs_stats(request: Request):
    get_current_user_or_local(request)
    entries = (await all_logs(request))["entries"]
    today = datetime.now(timezone.utc).date().isoformat()
    total = len(entries)
    today_count = sum(1 for e in entries if (e.get("timestamp") or "").startswith(today))
    errors = sum(1 for e in entries if "error" in (e.get("message") or "").lower() or "failed" in (e.get("message") or "").lower())
    player = sum(1 for e in entries if e.get("type") == "player")
    audit = sum(1 for e in entries if e.get("type") == "audit")
    sync = sum(1 for e in entries if e.get("type") == "sync")
    return {
        "total": total,
        "today": today_count,
        "errors": errors,
        "player": player,
        "audit": audit,
        "sync": sync,
    }


@router.get("/api/logs/export")
async def export_logs(request: Request):
    get_current_user_or_local(request)
    entries = (await all_logs(request))["entries"]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "type", "message", "details"])
    for e in entries:
        writer.writerow([
            e.get("timestamp", ""),
            e.get("type", ""),
            e.get("message", ""),
            e.get("details", e.get("raw", "")),
        ])
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=nikkomusichub-logs-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"},
    )
