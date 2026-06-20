#!/bin/bash
# Play a short test tone through mpv
set -e
mpv --no-video --ao=alsa --length=3 "sine://1000" >/tmp/nikko-test-audio.log 2>&1
