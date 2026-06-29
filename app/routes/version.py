"""Version and OTA endpoints."""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.db import audit, get_setting
from app.routes.auth import get_current_user_or_local
from app.services.system import get_git_version, run

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

CHANGELOG = [
    {
        "version": "v2026.06.29",
        "date": "2026-06-29",
        "items": [
            "MQTT 預設值改為 114.55.1.51:1883 / admin / topup30%off，並移除 Topic Prefix、Command Secret 欄位",
            "WebDAV 設定移除 Remote Name，Remote Music Path 改為 \\NikkoMusic 形式顯示",
            "店家資訊簡化為店名 + store- 前綴 Store ID",
            "首頁狀態卡片改為無閃爍更新，綠燈加入脈衝動畫",
            "播放控制台改為 lucide 風格圖示按鈕",
            "側邊欄對齊，新增版本更新入口，版權年份改為 2026",
            "Cloud 端修復 MQTT 預設帳密顯示、OTA/Library 店點卡片排版、音樂庫 NAS 設定與清單持久化",
        ],
    },
    {
        "version": "v2026.06.19",
        "date": "2026-06-19",
        "items": [
            "新增 MQTT 指令簽章、DANGEROUS_KEYS 確認機制與 replay 防護",
            "Cloud 新增總覽控制台、OTA、音樂庫、店點管理",
            "Pi 新增 WebDAV 同步、播放器控制、系統監控與日誌",
        ],
    },
]


@router.get("/version", response_class=HTMLResponse)
async def version_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("version.html", {
        "request": request,
        "version": {
            "git": get_git_version(),
            "store_id": get_setting("store_id", ""),
            "store_name": get_setting("store_name", "未命名店鋪"),
        },
        "changelog": CHANGELOG,
    })


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
