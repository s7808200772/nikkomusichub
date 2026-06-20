#!/bin/bash
# NikkoMusicHub Cloud Platform Installer
set -e

INSTALL_DIR="/opt/nikko-cloud"
APP_DIR="${INSTALL_DIR}/cloud"
USER_NAME="${SUDO_USER:-$USER}"

log() { echo "[NikkoCloud] $*"; }

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo: bash cloud/install.sh"
  exit 1
fi

log "Installing dependencies..."
apt-get update
apt-get install -y python3 python3-venv python3-pip rsync

log "Creating directories..."
mkdir -p "${INSTALL_DIR}"

# Determine source
if [ -f "$(dirname "$0")/app/main.py" ]; then
  SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
else
  echo "Cannot find cloud/app/main.py"
  exit 1
fi

log "Copying application files..."
rsync -a --delete --exclude='.git' --exclude='venv' "${SOURCE_DIR}/" "${APP_DIR}/"
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}"

log "Setting up Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/venv"
"${INSTALL_DIR}/venv/bin/pip" install --upgrade pip
"${INSTALL_DIR}/venv/bin/pip" install -r "${APP_DIR}/requirements.txt"

log "Installing systemd service..."
cp "${APP_DIR}/systemd/nikko-music-hub-cloud.service" "/etc/systemd/system/"
sed -i "s/^User=.*/User=${USER_NAME}/" "/etc/systemd/system/nikko-music-hub-cloud.service"
sed -i "s/^Group=.*/Group=${USER_NAME}/" "/etc/systemd/system/nikko-music-hub-cloud.service"

systemctl daemon-reload
systemctl enable nikko-music-hub-cloud.service
systemctl restart nikko-music-hub-cloud.service

cat <<EOF

====================================================
  NikkoMusicHub Cloud 安裝完成
====================================================

預設帳號：nikkolh
預設密碼：topup30%off

服務狀態：systemctl status nikko-music-hub-cloud.service

資料庫：${INSTALL_DIR}/cloud/data/nikko-cloud.db

登入後請立即修改預設密碼，並到 Stores 頁面新增店點。

====================================================
EOF
