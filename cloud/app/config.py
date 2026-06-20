"""Central management platform configuration."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = DATA_DIR / "nikko-cloud.db"

SECRET_KEY = os.environ.get("NIKKO_CLOUD_SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DEFAULT_USERNAME = "nikkolh"
DEFAULT_PASSWORD = "topup30%off"

# SSH connection defaults
SSH_PORT_DEFAULT = 22
SSH_TIMEOUT = 15

# Allowed remote commands on Pi (whitelist)
REMOTE_COMMANDS = {
    "status_dashboard": {
        "label": "取得 Dashboard 狀態",
        "cmd": "curl http://localhost:8080/api/dashboard",
    },
    "status_system": {
        "label": "取得系統資訊",
        "cmd": "curl http://localhost:8080/api/system/info",
    },
    "status_player": {
        "label": "取得播放狀態",
        "cmd": "curl http://localhost:8080/api/player/status",
    },
    "player_play": {
        "label": "開始播放",
        "cmd": "curl -X POST http://localhost:8080/api/player/play",
    },
    "player_pause": {
        "label": "暫停",
        "cmd": "curl -X POST http://localhost:8080/api/player/pause",
    },
    "player_resume": {
        "label": "繼續",
        "cmd": "curl -X POST http://localhost:8080/api/player/resume",
    },
    "player_next": {
        "label": "下一首",
        "cmd": "curl -X POST http://localhost:8080/api/player/next",
    },
    "sync": {
        "label": "手動同步 Dropbox",
        "cmd": "curl -X POST http://localhost:8080/api/dropbox/sync",
    },
    "rescan": {
        "label": "重新掃描音樂",
        "cmd": "curl -X POST http://localhost:8080/api/system/rescan",
    },
    "restart_player": {
        "label": "重啟播放服務",
        "cmd": "sudo systemctl restart nikko-music-player.service",
    },
    "reboot": {
        "label": "重開機 Raspberry Pi",
        "cmd": "sudo reboot",
    },
}
