#!/bin/bash
# NikkoMusicHub One-Line Installer for Raspberry Pi OS
set -e

REPO_URL="https://github.com/s7808200772/nikkomusichub.git"
INSTALL_DIR="/srv/nikko-music"
APP_DIR="${INSTALL_DIR}/app"
USER_NAME="${SUDO_USER:-$USER}"

log() { echo "[NikkoMusicHub] $*"; }

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo: bash install.sh"
  exit 1
fi

log "Installing system dependencies..."
apt-get update
apt-get install -y python3 python3-venv python3-pip git curl alsa-utils rsync

log "Creating directories..."
mkdir -p "${INSTALL_DIR}"/{app,logs,scripts,data}
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}"

# Determine source directory
if [ -f "$(dirname "$0")/app/main.py" ]; then
  SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
  log "Using local source: ${SOURCE_DIR}"
else
  SOURCE_DIR="/tmp/nikkomusichub"
  rm -rf "${SOURCE_DIR}"
  log "Cloning repository..."
  git clone --depth 1 --branch main "${REPO_URL}" "${SOURCE_DIR}"
  cd "${SOURCE_DIR}"
  log "Installed from commit: $(git rev-parse HEAD 2>/dev/null || echo unknown)"
fi

log "Copying application files..."
rsync -a --delete --exclude='.git' --exclude='venv' "${SOURCE_DIR}/" "${APP_DIR}/"

# Sanity check: mqtt client must exist after copy
if [ ! -f "${APP_DIR}/mqtt_client.py" ]; then
  log "ERROR: mqtt_client.py not found after copy. Source dir may be incomplete."
  exit 1
fi

log "Setting up Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install -r "${APP_DIR}/requirements.txt"

log "Installing scripts..."
chmod +x "${APP_DIR}/scripts/"*.sh
ln -sf "${APP_DIR}/scripts/nikko-test-audio.sh" "${INSTALL_DIR}/scripts/nikko-test-audio.sh"

chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}/data"

# Generate a default MQTT store ID based on hostname
MQTT_STORE_ID=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')
if [ -z "${MQTT_STORE_ID}" ]; then
  MQTT_STORE_ID="store-$(openssl rand -hex 4)"
fi

log "Installing systemd services..."
for unit in nikko-music-hub-web.service nikko-music-player.service nikko-music-sync.service nikko-music-sync.timer nikko-music-mqtt.service; do
  if [ ! -f "${APP_DIR}/systemd/${unit}" ]; then
    log "ERROR: systemd unit ${unit} missing in ${APP_DIR}/systemd/"
    exit 1
  fi
  cp "${APP_DIR}/systemd/${unit}" "/etc/systemd/system/${unit}"
  # Replace placeholder user with actual user
  sed -i "s/^User=.*/User=${USER_NAME}/" "/etc/systemd/system/${unit}"
  sed -i "s/^Group=.*/Group=${USER_NAME}/" "/etc/systemd/system/${unit}"
  sed -i "s|/home/pi|/home/${USER_NAME}|g" "/etc/systemd/system/${unit}"
done

systemctl daemon-reload
systemctl enable nikko-music-hub-web.service
systemctl enable nikko-music-sync.timer
systemctl enable nikko-music-mqtt.service

log "Starting services..."
systemctl restart nikko-music-hub-web.service
systemctl restart nikko-music-mqtt.service

# Get IP addresses for display
IP_LINE=""
LAN_IP=$(hostname -I | awk '{print $1}')
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
if [ -n "${TAILSCALE_IP}" ]; then
  IP_LINE="Tailscale: http://${TAILSCALE_IP}:8080"
else
  IP_LINE="LAN: http://${LAN_IP}:8080"
fi

cat <<EOF

====================================================
  NikkoMusicHub 安裝完成
====================================================

登入網址：${IP_LINE}
預設帳號：nikkolh
預設密碼：topup30%off

資料目錄：${INSTALL_DIR}
MQTT Store ID：${MQTT_STORE_ID}
Web 服務：systemctl status nikko-music-hub-web.service
MQTT 服務：systemctl status nikko-music-mqtt.service
播放服務：systemctl status nikko-music-player.service
同步排程：systemctl status nikko-music-sync.timer

後續操作：
1. 用瀏覽器開啟上述網址並登入。
2. 進入 Setup Wizard 安裝 rclone 與 mpv。
3. 進入 NAS WebDAV Sync 設定 QNAP WebDAV 帳號密碼並測試連線。
4. 同步音樂後即可播放。

為了安全，請登入後立即到 Settings 修改預設密碼。

====================================================
EOF
