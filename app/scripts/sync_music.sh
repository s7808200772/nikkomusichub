#!/bin/bash
# NikkoMusicHub NAS WebDAV sync script
set -e

BASE_DIR="/srv/nikko-music"
LOG_FILE="${BASE_DIR}/logs/sync.log"
REMOTE_PATH="${NIKKO_WEBDAV_REMOTE_PATH:-qnapmusic:NikkoMusic}"
LOCAL_PATH="${NIKKO_LOCAL_PATH:-/srv/nikko-music/music}"
AUTO_RESTART="${NIKKO_AUTO_RESTART_PLAYER:-1}"

mkdir -p "$(dirname "$LOG_FILE")" "${LOCAL_PATH}"

echo "$(date '+%Y-%m-%d %H:%M:%S') Starting WebDAV sync: ${REMOTE_PATH} -> ${LOCAL_PATH}" | tee -a "${LOG_FILE}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "ERROR: rclone not installed" | tee -a "${LOG_FILE}"
  exit 1
fi

rclone sync "${REMOTE_PATH}" "${LOCAL_PATH}" \
  --config /srv/nikko-music/data/rclone.conf \
  --include "*.mp3" \
  --include "*.MP3" \
  --exclude "*" \
  --log-file "${LOG_FILE}" \
  --log-level INFO \
  -v

if [ "${AUTO_RESTART}" = "1" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') Restarting player" | tee -a "${LOG_FILE}"
  systemctl restart nikko-music-player.service || true
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') Sync completed" | tee -a "${LOG_FILE}"
