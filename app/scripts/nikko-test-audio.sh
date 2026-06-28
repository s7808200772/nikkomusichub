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
AUDIO_DEVICE_ARG=""
if [ -n "$NIKKO_AUDIO_DEVICE" ]; then
  AUDIO_DEVICE_ARG="--audio-device=$NIKKO_AUDIO_DEVICE"
fi
mpv --no-video --length=3 $AUDIO_DEVICE_ARG "lavfi://sine=frequency=1000:duration=3"
echo "Audio test finished."
