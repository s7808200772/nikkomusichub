#!/bin/bash
# Create a local backup of NikkoMusicHub settings.
set -e
BASE_DIR="/srv/nikko-music"
BACKUP_DIR="$BASE_DIR/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$BACKUP_DIR/nikko-backup-$TIMESTAMP"

mkdir -p "$BACKUP_DIR"
cd "$BASE_DIR" || exit 1
tar -czf "${ARCHIVE}.tar.gz" data

# Keep only the last 14 backups.
ls -t "$BACKUP_DIR"/nikko-backup-*.tar.gz | tail -n +15 | xargs -r rm -f

echo "Backup created: ${ARCHIVE}.tar.gz"
