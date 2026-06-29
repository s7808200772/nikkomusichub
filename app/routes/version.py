"""Version and OTA endpoints."""
import json
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.config import DATA_DIR
from app.db import audit, get_setting
from app.routes.auth import get_current_user_or_local
from app.services.system import get_git_version, run

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

CHANGELOG = [
    {
        "version": "v2026.06.30",
        "date": "2026-06-30",
        "items": [
            "儀表板狀態卡片整併：元件與版本、服務與同步、系統資源與資訊，移除播放器狀態卡片，讓資訊更集中",
            "播放控制台新增單鍵靜音切換，音量滑桿在靜音時同步歸零、恢復時回到原音量，並移除重複的圖示按鈕",
            "新增網路設定卡片：可儲存 WiFi 帳號密碼與乙太網路 / WiFi 優先順序，並透過 nmcli 自動套用",
            "MQTT 設定改為預填白值（114.55.1.51:1883 / admin / topup30%off），開箱即可直接儲存",
            "WebDAV 設定移除廠商欄位，Remote Music Path 改為 /NikkoMusic 顯示，後端自動轉為 qnapmusic:NikkoMusic",
            "設定頁按鈕加入固定最小寬度與提示文字，避免儲存時文字縮水；登出連結改為中文「登出系統」",
            "網路設定新增「測試連線」按鈕，先驗證 WiFi / 優先順序再儲存，並將 nmcli 錯誤明確顯示在畫面上",
            "網路優先順序套用失敗時不再靜默忽略，會回傳警告讓使用者知道哪個連線設定失敗",
            "修改密碼頁面的前端驗證改為與後端一致：至少 12 個字元且包含大小寫英文與數字",
            "install.sh 新增 sudoers 規則，讓服務帳號可免密執行必要的 systemctl 指令",
            "install.sh 會一併安裝並啟用 backup service / timer",
            ".env.example 更新為與 install.sh 一致的預設值（broker 114.55.1.51:1883、TLS 關閉、預設帳密與 topic prefix）",
        ],
    },
    {
        "version": "v2026.06.29",
        "date": "2026-06-29",
        "items": [
            "MQTT 預設值改為 114.55.1.51:1883 / admin / topup30%off，並移除 Topic Prefix、Command Secret 欄位",
            "WebDAV 設定移除 Remote Name，Remote Music Path 改為顯示形式",
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
    {
        "version": "v2026.05.10",
        "date": "2026-05-10",
        "items": [
            "完成 install.sh 一鍵安裝腳本，自動建立目錄、安裝相依、設定 systemd 服務與定時同步",
            "建立 FastAPI 本機管理後台，提供登入、儀表板、系統設定與日誌頁面",
            "整合 mpv IPC 播放控制：播放、暫停、停止、上一首 / 下一首、音量、隨機、循環、播放清單重載",
            "整合 rclone WebDAV 同步：從 QNAP NAS 拉取音樂，支援 dry-run、排程同步與進度顯示",
            "加入系統監控：CPU / RAM / 磁碟 / 溫度、服務狀態、Tailscale 連線、QNAP 連線檢查",
        ],
    },
]


def _get_installed_git_version() -> dict:
    path = Path(DATA_DIR) / "git-version.json"
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {
                    "commit": data.get("commit") or "unknown",
                    "branch": data.get("branch") or "unknown",
                }
        except Exception:
            pass
    return {"commit": "unknown", "branch": "unknown"}


def get_git_version_info() -> dict:
    """Return git commit/branch, falling back to the version recorded at install time."""
    live = get_git_version()
    if live.get("commit") and live.get("commit") != "unknown":
        return live
    return _get_installed_git_version()


@router.get("/version", response_class=HTMLResponse)
async def version_page(request: Request):
    get_current_user_or_local(request)
    git = get_git_version_info()
    return templates.TemplateResponse("version.html", {
        "request": request,
        "version": {
            "commit": git.get("commit", "unknown"),
            "branch": git.get("branch", "unknown"),
            "store_id": get_setting("store_id", ""),
            "store_name": get_setting("store_name", "未命名店鋪"),
        },
        "changelog": CHANGELOG,
    })


@router.get("/api/version")
def version(request: Request):
    get_current_user_or_local(request)
    git = get_git_version_info()
    return {
        "commit": git.get("commit", "unknown"),
        "branch": git.get("branch", "unknown"),
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
