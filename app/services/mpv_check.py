"""Pre-start check for mpv service.

Builds the playlist file so mpv starts cleanly even when no MP3s exist.
"""
import sys
from pathlib import Path

from app.config import MUSIC_DIR


def main():
    playlist = MUSIC_DIR.parent / "playlist.m3u"
    files = sorted(MUSIC_DIR.rglob("*.mp3")) + sorted(MUSIC_DIR.rglob("*.MP3"))
    with open(playlist, "w", encoding="utf-8") as f:
        for file in files:
            f.write(str(file) + "\n")
    if not files:
        print("No MP3 files found. Player service will not start to avoid log spam.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
