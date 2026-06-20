"""Global configuration for NikkoMusicHub."""
import os
from pathlib import Path

PROJECT_NAME = "NikkoMusicHub"
PROJECT_SLUG = "nikko-music-hub"

# Base paths
BASE_DIR = Path("/srv/nikko-music")
MUSIC_DIR = BASE_DIR / "music"
LOGS_DIR = BASE_DIR / "logs"
SCRIPTS_DIR = BASE_DIR / "scripts"
DATA_DIR = BASE_DIR / "data"

# Ensure directories exist at import time (for development)
for d in (BASE_DIR, MUSIC_DIR, LOGS_DIR, SCRIPTS_DIR, DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_PATH = DATA_DIR / "nikkomusichub.db"

# Security
SECRET_KEY = os.environ.get("NIKKO_SECRET_KEY", "change-me-on-first-login-via-web-ui")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # one week

# Default credentials (changed on first-run wizard)
DEFAULT_USERNAME = "nikkolh"
DEFAULT_PASSWORD = "topup30%off"

# mpv IPC
MPV_SOCKET = "/tmp/nikko-mpv.sock"

# rclone
RCLONE_CONFIG_PATH = DATA_DIR / "rclone.conf"
RCLONE_REMOTE_NAME_DEFAULT = "dropbox"
RCLONE_DROPBOX_PATH_DEFAULT = "NikkoMusic"

# Service names
WEB_SERVICE = "nikko-music-hub-web.service"
PLAYER_SERVICE = "nikko-music-player.service"
SYNC_SERVICE = "nikko-music-sync.service"
SYNC_TIMER = "nikko-music-sync.timer"

# Sync schedule defaults
SYNC_TIME_DEFAULT = "03:00"
SYNC_BOOT_DELAY_MIN = 2

# Audit log
AUDIT_LOG_PATH = LOGS_DIR / "audit.log"
PLAYER_LOG_PATH = LOGS_DIR / "player.log"
SYNC_LOG_PATH = LOGS_DIR / "sync.log"
SYSTEM_LOG_PATH = LOGS_DIR / "system.log"
