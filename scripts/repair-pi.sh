#!/bin/bash
# Pi repair script for NikkoMusicHub
set -e

INSTALL_DIR="/srv/nikko-music"
APP_DIR="${INSTALL_DIR}/app"
ENV_FILE="${INSTALL_DIR}/data/nikko.env"
PASSWORD_FILE="${INSTALL_DIR}/data/initial-admin-password"
DEFAULT_PASS="topup30%off"
USER_NAME="${SUDO_USER:-$USER}"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo: sudo bash repair-pi.sh"
  exit 1
fi

echo "==== NikkoMusicHub Pi Repair ===="

# Ensure directories exist
mkdir -p "${INSTALL_DIR}"/{app,logs,scripts,data}

# Ensure env file has default password
if [ -f "${ENV_FILE}" ]; then
  if ! grep -qE '^NIKKO_DEFAULT_PASSWORD=' "${ENV_FILE}"; then
    echo "Adding NIKKO_DEFAULT_PASSWORD to nikko.env"
    echo "NIKKO_DEFAULT_PASSWORD=${DEFAULT_PASS}" >> "${ENV_FILE}"
  fi
else
  echo "WARNING: ${ENV_FILE} is missing. Run install.sh to recreate it."
fi

# Ensure initial password file exists
if [ ! -f "${PASSWORD_FILE}" ]; then
  echo "Creating ${PASSWORD_FILE}"
  umask 077
  echo "${DEFAULT_PASS}" > "${PASSWORD_FILE}"
  chmod 600 "${PASSWORD_FILE}"
fi

# Fix ownership
chown -R "${USER_NAME}:${USER_NAME}" "${INSTALL_DIR}/data"

# Reinstall systemd units if they exist in the app package
SYSTEMD_SRC_DIR="${APP_DIR}/app/systemd"
if [ -d "${SYSTEMD_SRC_DIR}" ]; then
  echo "Reinstalling systemd units from ${SYSTEMD_SRC_DIR}"
  for unit in nikko-music-hub-web.service nikko-music-player.service nikko-music-sync.service nikko-music-sync.timer nikko-music-mqtt.service nikko-music-boot-sync.service nikko-music-watchdog.service nikko-music-watchdog.timer; do
    if [ -f "${SYSTEMD_SRC_DIR}/${unit}" ]; then
      cp "${SYSTEMD_SRC_DIR}/${unit}" "/etc/systemd/system/${unit}"
      sed -i "s/^User=.*/User=${USER_NAME}/" "/etc/systemd/system/${unit}"
      sed -i "s/^Group=.*/Group=${USER_NAME}/" "/etc/systemd/system/${unit}"
      sed -i "s|/home/pi|/home/${USER_NAME}|g" "/etc/systemd/system/${unit}"
      USER_UID=$(id -u "${USER_NAME}")
      sed -i "s|/run/user/1000|/run/user/${USER_UID}|g" "/etc/systemd/system/${unit}"
      if ! grep -q "^Environment=\"NIKKO_USER=" "/etc/systemd/system/${unit}"; then
        sed -i "/^\[Service\]/a Environment=\"NIKKO_USER=${USER_NAME}\"" "/etc/systemd/system/${unit}"
        sed -i "/^Environment=\"NIKKO_USER=${USER_NAME}\"/a Environment=\"NIKKO_GROUP=${USER_NAME}\"" "/etc/systemd/system/${unit}"
      fi
    fi
  done
  systemctl daemon-reload
  systemctl enable nikko-music-hub-web.service nikko-music-sync.timer nikko-music-mqtt.service nikko-music-boot-sync.service nikko-music-watchdog.timer
fi

# Restart core services
echo "Restarting services..."
systemctl restart nikko-music-hub-web.service || true
systemctl restart nikko-music-mqtt.service || true

sleep 2

echo
if systemctl is-active --quiet nikko-music-hub-web.service; then
  echo "Web service is active."
else
  echo "ERROR: Web service is not active. Recent log:"
  journalctl -u nikko-music-hub-web.service --no-pager -n 30 || true
fi

echo
LAN_IP=$(hostname -I | awk '{print $1}')
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || true)
if [ -n "${TAILSCALE_IP}" ]; then
  echo "Try: http://${TAILSCALE_IP}:8080"
else
  echo "Try: http://${LAN_IP}:8080"
fi
echo "Default login: nikkolh / ${DEFAULT_PASS}"
echo "==== End repair ===="
