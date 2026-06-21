#!/bin/bash
# Quick audio test for NikkoMusicHub
set -e

SPEAKER_TEST=${SPEAKER_TEST:-/usr/bin/speaker-test}
if [ ! -x "$SPEAKER_TEST" ]; then
  echo "speaker-test not found. Installing alsa-utils..."
  apt-get install -y alsa-utils
fi

echo "Playing 3-second pink noise test on default ALSA device..."
speaker-test -t pink -c 2 -s 1 -l 1
