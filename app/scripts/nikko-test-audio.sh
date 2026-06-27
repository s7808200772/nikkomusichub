#!/bin/bash
# Quick audio test for NikkoMusicHub
set -e

if ! command -v mpv >/dev/null 2>&1; then
  echo "mpv not found. Installing mpv..."
  apt-get install -y mpv
fi

# Ensure XDG_RUNTIME_DIR is set for PipeWire/PulseAudio
if [ -z "$XDG_RUNTIME_DIR" ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id - u)"
fi

echo "Playing 3-second 1kHz test tone through mpv..."
mpv --no-video --length=3 "lavfi://sine=frequency=1000:duration=3"
echo "Audio test finished."
