#!/bin/bash
# Play a short test tone through mpv (optionally using NIKKO_AUDIO_DEVICE)
set -e

AUDIO_ARGS=""
if [ -n "${NIKKO_AUDIO_DEVICE}" ]; then
  AUDIO_ARGS="--audio-device=${NIKKO_AUDIO_DEVICE}"
fi

mpv --no-video --length=3 ${AUDIO_ARGS} "sine://1000" >/tmp/nikko-test-audio.log 2>&1
