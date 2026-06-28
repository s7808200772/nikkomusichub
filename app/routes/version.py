"""Version and OTA endpoints."""
from fastapi import APIRouter, Request

from app.db import audit, get_setting
from app.routes.auth import get_current_user_or_local
from app.services.system import get_git_version, run

router = APIRouter()


@router.get("/api/version")
def version(request: Request):
    get_current_user_or_local(request)
    return {
        "git": get_git_version(),
        "store_id": get_setting("store_id", ""),
        "store_name": get_setting("store_name", "未命名店鋪"),
    }


@router.post("/api/system/update")
async def update_system(request: Request):
    """Trigger a git pull + dependency install + service restart.

    Returns immediately with the spawned process info; actual update runs
    in the background so the HTTP response is not blocked.
    """
    user = get_current_user_or_local(request)
    audit(user, "ota_update_start", {})

    # Tag the current commit so we can roll back if needed.
    tag_result = run(["git", "tag", "-f", "rollback-before-ota"], timeout=15)

    proc = run(
        [
            "bash",
            "-c",
            "git pull && pip install -r requirements.txt && sudo systemctl restart nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service",
        ],
        timeout=300,
    )

    audit(user, "ota_update_finish", {"ok": proc["ok"], "returncode": proc["returncode"]})
    return {
        "ok": proc["ok"],
        "stdout": proc["stdout"],
        "stderr": proc["stderr"],
        "tag_ok": tag_result["ok"],
    }


@router.post("/api/system/rollback")
async def rollback_system(request: Request):
    """Roll back to the commit tagged before the last OTA."""
    user = get_current_user_or_local(request)
    audit(user, "ota_rollback_start", {})
    checkout = run(["git", "checkout", "rollback-before-ota"], timeout=30)
    if not checkout["ok"]:
        return {"ok": False, "stderr": checkout["stderr"]}
    restart = run(
        [
            "sudo",
            "systemctl",
            "restart",
            "nikko-music-hub-web.service",
            "nikko-music-player.service",
            "nikko-music-mqtt.service",
        ],
        timeout=60,
    )
    audit(user, "ota_rollback_finish", {"ok": restart["ok"]})
    return {"ok": restart["ok"], "stderr": restart["stderr"]}
