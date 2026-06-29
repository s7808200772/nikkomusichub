"""Global configuration for NikkoMusicHub."""
import os
import secrets
from pathlib import Path

PROJECT_NAME = "NikkoMusicHub"
PROJECT_SLUG = "nikko-music-hub"

# Base paths
BASE_DIR = Path(os.environ.get("NIKKO_BASE_DIR", "/srv/nikko-music"))
MUSIC_DIR = BASE_DIR / "music"
MUSIC_OLD_DIR = BASE_DIR / "music.old"
LOGS_DIR = BASE_DIR / "logs"
SCRIPTS_DIR = BASE_DIR / "scripts"
DATA_DIR = BASE_DIR / "data"

# Runtime user/group used for file ownership (web service user)
NIKKO_USER = os.environ.get("NIKKO_USER", "pi")
NIKKO_GROUP = os.environ.get("NIKKO_GROUP", "pi")

# Ensure directories exist at import time (for development)
for d in (BASE_DIR, MUSIC_DIR, LOGS_DIR, SCRIPTS_DIR, DATA_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Database
DATABASE_PATH = DATA_DIR / "nikkomusichub.db"

ENV = os.environ.get("NIKKO_ENV", "development").strip().lower()
IS_PRODUCTION = ENV == "production"


# Security
def _load_or_create_secret(filename: str, length: int = 48) -> str:
    path = DATA_DIR / filename
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    value = secrets.token_urlsafe(length)
    path.write_text(value, encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return value


def _load_jwt_secret() -> str:
    secret = os.environ.get("NIKKO_SECRET_KEY", "").strip()
    if secret:
        if len(secret) < 32:
            raise RuntimeError("NIKKO_SECRET_KEY must be at least 32 characters in production")
        return secret
    if IS_PRODUCTION:
        raise RuntimeError(
            "NIKKO_SECRET_KEY environment variable is required in production. "
            "Set it in /srv/nikko-music/data/nikko.env before starting the service."
        )
    # Development fallback: auto-generated file (convenient but not for production).
    return _load_or_create_secret("jwt-secret")


SECRET_KEY = _load_jwt_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # one week
COOKIE_SECURE = os.environ.get("NIKKO_COOKIE_SECURE", "1" if IS_PRODUCTION else "0").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Initial credentials. Override with NIKKO_DEFAULT_PASSWORD for a per-device secret.
DEFAULT_USERNAME = "nikkolh"
DEFAULT_PASSWORD = os.environ.get("NIKKO_DEFAULT_PASSWORD") or "topup30%off"

# mpv IPC
MPV_SOCKET = "/tmp/nikko-mpv.sock"

# rclone / WebDAV
RCLONE_CONFIG_PATH = DATA_DIR / "rclone.conf"
RCLONE_REMOTE_NAME_DEFAULT = "qnapmusic"
RCLONE_WEBDAV_URL_DEFAULT = "http://100.106.208.65:5005/"
RCLONE_WEBDAV_VENDOR_DEFAULT = "other"
RCLONE_REMOTE_PATH_DEFAULT = "qnapmusic:NikkoMusic"

# QNAP NAS (Tailscale)
QNAP_TAILSCALE_IP = "100.106.208.65"
QNAP_WEBDAV_HTTP_PORT = 5005
QNAP_WEBDAV_HTTPS_PORT = 5006

# Service names
WEB_SERVICE = "nikko-music-hub-web.service"
PLAYER_SERVICE = "nikko-music-player.service"
SYNC_SERVICE = "nikko-music-sync.service"
SYNC_TIMER = "nikko-music-sync.timer"
MQTT_SERVICE = "nikko-music-mqtt.service"

# MQTT settings for central cloud management
# Defaults match install.sh: internal broker, plaintext, shared credentials.
MQTT_BROKER = os.environ.get("NIKKO_MQTT_BROKER", "114.55.1.51")
MQTT_PORT = int(os.environ.get("NIKKO_MQTT_PORT", "1883"))
MQTT_USERNAME = os.environ.get("NIKKO_MQTT_USERNAME", "admin")
MQTT_PASSWORD = os.environ.get("NIKKO_MQTT_PASSWORD", "topup30%off")
MQTT_STORE_ID = os.environ.get("NIKKO_MQTT_STORE_ID", "")
MQTT_TOPIC_PREFIX = os.environ.get("NIKKO_MQTT_TOPIC_PREFIX", "nikko")
MQTT_TLS = os.environ.get("NIKKO_MQTT_TLS", "0").strip().lower() not in ("0", "false", "no")
MQTT_TLS_VERIFY = os.environ.get("NIKKO_MQTT_TLS_VERIFY", "0").strip().lower() not in ("0", "false", "no")
MQTT_CA_PATH = os.environ.get("NIKKO_MQTT_CA_PATH", "")
MQTT_COMMAND_SECRET = os.environ.get("NIKKO_MQTT_COMMAND_SECRET", "")
MQTT_COMMAND_MAX_AGE_SECONDS = int(os.environ.get("NIKKO_MQTT_COMMAND_MAX_AGE_SECONDS", "60"))

# Sync schedule defaults
SYNC_TIME_DEFAULT = "03:00"
SYNC_BOOT_DELAY_MIN = 2

# Audit log
AUDIT_LOG_PATH = LOGS_DIR / "audit.log"
PLAYER_LOG_PATH = LOGS_DIR / "player.log"
SYNC_LOG_PATH = LOGS_DIR / "sync.log"
SYSTEM_LOG_PATH = LOGS_DIR / "system.log"
