#!/bin/bash
# Pi diagnostic script for NikkoMusicHub
set -e

INSTALL_DIR="/srv/nikko-music"
ENV_FILE="${INSTALL_DIR}/data/nikko.env"
PASSWORD_FILE="${INSTALL_DIR}/data/initial-admin-password"

echo "==== NikkoMusicHub Pi Diagnostic ===="
echo

echo "-- Directory listing --"
if [ -d "${INSTALL_DIR}" ]; then
  ls -la "${INSTALL_DIR}" || true
  echo
  echo "-- data dir --"
  ls -la "${INSTALL_DIR}/data" 2>/dev/null || true
  echo
  echo "-- app dir --"
  ls -la "${INSTALL_DIR}/app" 2>/dev/null | head -20 || true
else
  echo "${INSTALL_DIR} does not exist"
fi
echo

echo "-- nikko.env --"
if [ -f "${ENV_FILE}" ]; then
  echo "exists, permissions: $(stat -c '%a %U:%G' "${ENV_FILE}")"
  grep -E '^(NIKKO_ENV|NIKKO_DEFAULT_PASSWORD|NIKKO_MQTT_TLS|NIKKO_PORT)=' "${ENV_FILE}" | sed 's/=.*/=***/' || true
else
  echo "missing"
fi
echo

echo "-- initial-admin-password --"
if [ -f "${PASSWORD_FILE}" ]; then
  echo "exists, permissions: $(stat -c '%a %U:%G' "${PASSWORD_FILE}")"
else
  echo "missing"
fi
echo

echo "-- systemd units --"
for unit in nikko-music-hub-web.service nikko-music-mqtt.service nikko-music-player.service; do
  if [ -f "/etc/systemd/system/${unit}" ]; then
    echo "${unit}: $(systemctl is-active "${unit}" 2>/dev/null || echo inactive)"
  else
    echo "${unit}: unit file missing"
  fi
done
echo

echo "-- listening ports --"
ss -tlnp 2>/dev/null | grep -E ':(8080|8883)\b' || echo "no 8080/8883 listeners"
echo

echo "-- web service log (last 40 lines) --"
journalctl -u nikko-music-hub-web.service --no-pager -n 40 2>/dev/null || echo "cannot read journalctl"
echo

echo "-- network addresses --"
echo "hostname: $(hostname)"
echo "all IPs: $(hostname -I 2>/dev/null || true)"
echo "tailscale IP: $(tailscale ip -4 2>/dev/null || true)"
echo

echo "==== End diagnostic ===="
