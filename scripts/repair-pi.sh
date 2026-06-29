#!/bin/bash
# Pi repair script for NikkoMusicHub
# Pulls the latest security-final code and re-runs install.sh.
set -e

REPO_URL="https://github.com/s7808200772/nikkomusichub.git"
DEFAULT_BRANCH="security-final"
INSTALL_DIR="/srv/nikko-music"
SOURCE_DIR="/tmp/nikkomusichub-repair"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo: sudo bash repair-pi.sh"
  exit 1
fi

echo "==== NikkoMusicHub Pi Repair ===="

# Remove any stale temporary clone and fetch the latest code.
rm -rf "${SOURCE_DIR}"
echo "Pulling latest code from ${REPO_URL}#${DEFAULT_BRANCH}..."
git clone --depth 1 --branch "${DEFAULT_BRANCH}" "${REPO_URL}" "${SOURCE_DIR}"
cd "${SOURCE_DIR}"
echo "Repair will use commit: $(git rev-parse HEAD 2>/dev/null || echo unknown)"

# Re-run the installer using the freshly pulled source.
SOURCE_DIR="${SOURCE_DIR}" bash "${SOURCE_DIR}/install.sh"

echo "==== End repair ===="
