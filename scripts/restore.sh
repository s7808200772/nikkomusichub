#!/bin/bash
# Restore NikkoMusicHub settings from a backup tar.gz on a new Pi.
# Usage: sudo bash scripts/restore.sh /path/to/nikko-backup-YYYYMMDD-HHMMSS.tar.gz
set -e

BACKUP_FILE="${1:-}"
BASE_DIR="/srv/nikko-music"
DATA_DIR="$BASE_DIR/data"

if [[ -z "$BACKUP_FILE" ]]; then
    echo "Usage: $0 <backup.tar.gz>"
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
    echo "Please run as root (sudo)"
    exit 1
fi

echo "Stopping services..."
systemctl stop nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service || true

echo "Restoring data directory..."
mkdir -p "$DATA_DIR"
rm -rf "$DATA_DIR"/*
tar -xzf "$BACKUP_FILE" -C "$BASE_DIR"

echo "Fixing permissions..."
chown -R pi:pi "$BASE_DIR"
chmod 600 "$DATA_DIR"/nikko.env 2>/dev/null || true
chmod 600 "$DATA_DIR"/rclone.conf 2>/dev/null || true

echo "Reloading systemd and starting services..."
systemctl daemon-reload
systemctl start nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service
systemctl enable nikko-music-hub-web.service nikko-music-player.service nikko-music-mqtt.service

echo "Restore complete. Check status with: sudo systemctl status nikko-music-hub-web.service"
