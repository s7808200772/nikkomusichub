#!/bin/bash
# NikkoMusicHub One-Line Installer for Raspberry Pi OS
set -e

REPO_URL="https://github.com/s7808200772/nikkomusichub.git"
INSTALL_DIR="/srv/nikko-music"
APP_DIR="${INSTALL_DIR}/app"
USER_NAME="${SUDO_USER:-$USER}"
DEFAULT_BRANCH="security-final"

log() { echo "[NikkoMusicHub] $*"; }

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo: bash install.sh"
  exit 1
fi

log "Installing system dependencies..."
apt-get update
apt-get install -y python3 python3-venv python3-pip git curl alsa-utils rsync mpv rclone

log "Creating directories..."
mkdir -p "${INSTALL_DIR}"/{app,logs,scripts,data}
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}"

# Determine source directory
# Allow callers (e.g. repair-pi.sh) to pass SOURCE_DIR explicitly.
if [ -z "${SOURCE_DIR}" ]; then
  if [ -f "$(dirname "$0")/app/main.py" ]; then
    SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
    log "Using local source: ${SOURCE_DIR}"
  else
    SOURCE_DIR="/tmp/nikkomusichub"
    rm -rf "${SOURCE_DIR}"
    log "Cloning repository..."
    git clone --depth 1 --branch "${DEFAULT_BRANCH}" "${REPO_URL}" "${SOURCE_DIR}"
    cd "${SOURCE_DIR}"
    log "Installed from commit: $(git rev-parse HEAD 2>/dev/null || echo unknown)"
  fi
else
  log "Using caller-provided source: ${SOURCE_DIR}"
fi

log "Copying application files..."
rsync -a --delete --exclude='.git' --exclude='venv' --exclude='cloud-vercel' --exclude='node_modules' "${SOURCE_DIR}/" "${APP_DIR}/"

# Sanity check: mqtt client must exist after copy (inside app package)
if [ ! -f "${APP_DIR}/app/mqtt_client.py" ]; then
  log "ERROR: app/mqtt_client.py not found after copy. Source dir may be incomplete."
  exit 1
fi

log "Setting up Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install -r "${APP_DIR}/requirements.txt"

ENV_FILE="${INSTALL_DIR}/data/nikko.env"
if [ ! -f "${ENV_FILE}" ]; then
  log "Generating device security secrets..."
  JWT_SECRET=$("${INSTALL_DIR}/venv/bin/python" -c "import secrets; print(secrets.token_urlsafe(48))")
  MQTT_COMMAND_SECRET=$("${INSTALL_DIR}/venv/bin/python" -c "import secrets; print(secrets.token_urlsafe(48))")
  MQTT_TOPIC_PREFIX="nikko-$("${INSTALL_DIR}/venv/bin/python" -c "import secrets; print(secrets.token_hex(12))")"
  umask 077
  cat > "${ENV_FILE}" <<EOF
NIKKO_ENV=production
NIKKO_SECRET_KEY=${JWT_SECRET}
NIKKO_COOKIE_SECURE=0
NIKKO_DEFAULT_PASSWORD=topup30%off
NIKKO_MQTT_COMMAND_SECRET=${MQTT_COMMAND_SECRET}
NIKKO_MQTT_TOPIC_PREFIX=${MQTT_TOPIC_PREFIX}
NIKKO_MQTT_TLS=1
NIKKO_MQTT_TLS_VERIFY=1
NIKKO_MQTT_PORT=8883
NIKKO_MQTT_BROKER=broker.hivemq.com
EOF
  chmod 600 "${ENV_FILE}"
fi

# Ensure the default password is present in both env file and initial password file.
# This guarantees a fresh install (or an old install without the env variable) can
# log in with the documented default credentials.
DEFAULT_PASS="topup30%off"
PASSWORD_ENV_WAS_MISSING=0
if ! grep -qE '^NIKKO_DEFAULT_PASSWORD=' "${ENV_FILE}" 2>/dev/null; then
  umask 077
  echo "NIKKO_DEFAULT_PASSWORD=${DEFAULT_PASS}" >> "${ENV_FILE}"
  PASSWORD_ENV_WAS_MISSING=1
fi
# Only rewrite the initial password file if the env variable was missing, which
# indicates this is either a fresh install or an upgrade from a version that did
# not use the documented default password. This avoids resetting a password the
# user already changed through the Settings UI.
# Always make sure the initial password file exists. If the user has already
# changed their password through the Settings UI, this file will just be
# overwritten with the documented default again — which is acceptable during an
# install/repair run. The application still prefers NIKKO_DEFAULT_PASSWORD from
# nikko.env when available.
if [ "${PASSWORD_ENV_WAS_MISSING}" -eq 1 ] || [ ! -f "${INSTALL_DIR}/data/initial-admin-password" ]; then
  echo "${DEFAULT_PASS}" > "${INSTALL_DIR}/data/initial-admin-password"
  chmod 600 "${INSTALL_DIR}/data/initial-admin-password"
fi

log "Installing scripts..."
chmod +x "${APP_DIR}/scripts/"*.sh
ln -sf "${APP_DIR}/scripts/nikko-test-audio.sh" "${INSTALL_DIR}/scripts/nikko-test-audio.sh"

chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}/data"

# Generate a default MQTT store ID based on hostname
MQTT_STORE_ID=$(hostname | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')
if [ -z "${MQTT_STORE_ID}" ]; then
  MQTT_STORE_ID="store-$(openssl rand -hex 4)"
fi

SYSTEMD_SRC_DIR="${APP_DIR}/app/systemd"
log "Installing systemd services from ${SYSTEMD_SRC_DIR}..."
for unit in nikko-music-hub-web.service nikko-music-player.service nikko-music-sync.service nikko-music-sync.timer nikko-music-mqtt.service nikko-music-boot-sync.service nikko-music-watchdog.service nikko-music-watchdog.timer; do
  if [ ! -f "${SYSTEMD_SRC_DIR}/${unit}" ]; then
    log "ERROR: systemd unit ${unit} missing in ${SYSTEMD_SRC_DIR}/"
    exit 1
  fi
  cp "${SYSTEMD_SRC_DIR}/${unit}" "/etc/systemd/system/${unit}"
  # Replace placeholder user with actual user
  sed -i "s/^User=.*/User=${USER_NAME}/" "/etc/systemd/system/${unit}"
  sed -i "s/^Group=.*/Group=${USER_NAME}/" "/etc/systemd/system/${unit}"
  sed -i "s|/home/pi|/home/${USER_NAME}|g" "/etc/systemd/system/${unit}"
  # Ensure XDG_RUNTIME_DIR points to the correct user's runtime directory
  USER_UID=$(id -u "${USER_NAME}")
  sed -i "s|/run/user/1000|/run/user/${USER_UID}|g" "/etc/systemd/system/${unit}"
  # Ensure runtime user is known to Python for file ownership
  if ! grep -q "^Environment=\"NIKKO_USER=" "/etc/systemd/system/${unit}"; then
    sed -i "/^\[Service\]/a Environment=\"NIKKO_USER=${USER_NAME}\"" "/etc/systemd/system/${unit}"
    sed -i "/^Environment=\"NIKKO_USER=${USER_NAME}\"/a Environment=\"NIKKO_GROUP=${USER_NAME}\"" "/etc/systemd/system/${unit}"
  fi
done

systemctl daemon-reload
systemctl enable nikko-music-hub-web.service
systemctl enable nikko-music-sync.timer
systemctl enable nikko-music-mqtt.service
systemctl enable nikko-music-boot-sync.service
systemctl enable nikko-music-watchdog.timer

log "Starting services..."
systemctl restart nikko-music-hub-web.service
systemctl restart nikko-music-mqtt.service

# Verify web service came up
sleep 2
if ! systemctl is-active --quiet nikko-music-hub-web.service; then
  log "ERROR: nikko-music-hub-web.service did not start. Recent log:"
  journalctl -u nikko-music-hub-web.service --no-pager -n 30 || true
  log "You can retry after fixing the issue above."
  exit 1
fi

# Ensure data ownership is correct for files created after chown
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}/data"

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
初始密碼：$(cat "${INSTALL_DIR}/data/initial-admin-password" 2>/dev/null || echo "請查看 ${INSTALL_DIR}/data/initial-admin-password")

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

為了安全，請登入後立即到 Settings 修改初始密碼。

====================================================
EOF
