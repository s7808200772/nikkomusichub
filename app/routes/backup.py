"""Backup and restore endpoints."""
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.config import BASE_DIR, DATA_DIR, MUSIC_DIR
from app.db import audit
from app.routes.auth import get_current_user_or_local
from app.services.system import run, safe_path_validate

router = APIRouter()

BACKUP_DIR = BASE_DIR / "backups"


def _backup_filename() -> str:
    return f"nikko-backup-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"


@router.post("/api/backup/create")
async def create_backup(request: Request):
    user = get_current_user_or_local(request)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    name = _backup_filename()
    archive_path = BACKUP_DIR / name
    try:
        shutil.make_archive(
            base_name=str(archive_path),
            format="gztar",
            root_dir=str(BASE_DIR),
            base_dir="data",
        )
        audit(user, "create_backup", {"filename": f"{name}.tar.gz", "ok": True})
        return {"ok": True, "filename": f"{name}.tar.gz", "size": (archive_path.with_suffix(".tar.gz")).stat().st_size}
    except Exception as e:
        audit(user, "create_backup", {"filename": f"{name}.tar.gz", "ok": False, "error": str(e)})
        return {"ok": False, "stderr": str(e)}


@router.get("/api/backup/download")
async def download_backup(request: Request, filename: str):
    get_current_user_or_local(request)
    target = (BACKUP_DIR / filename).resolve()
    if not safe_path_validate(str(target)) or not target.exists():
        return {"ok": False, "stderr": "Invalid or missing backup file"}
    return FileResponse(target, filename=filename, media_type="application/gzip")


@router.get("/api/backup/list")
def list_backups(request: Request):
    get_current_user_or_local(request)
    if not BACKUP_DIR.exists():
        return {"backups": []}
    backups = sorted(
        [
            {"name": f.name, "size": f.stat().st_size, "mtime": f.stat().st_mtime}
            for f in BACKUP_DIR.glob("*.tar.gz")
        ],
        key=lambda x: x["mtime"],
        reverse=True,
    )
    return {"backups": backups}
