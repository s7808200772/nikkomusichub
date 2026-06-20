"""CLI runner used by systemd timer to perform Dropbox sync."""
import os
import sys

from app.config import MUSIC_DIR, RCLONE_DROPBOX_PATH_DEFAULT
from app.db import init_db
from app.services import mpv, rclone


def main():
    init_db()
    remote = os.environ.get("NIKKO_DROPBOX_REMOTE", "dropbox")
    path = os.environ.get("NIKKO_DROPBOX_PATH", RCLONE_DROPBOX_PATH_DEFAULT)
    local = os.environ.get("NIKKO_LOCAL_PATH", str(MUSIC_DIR))

    result = rclone.sync_music(remote, path, local)

    if result["ok"]:
        auto_restart = os.environ.get("NIKKO_AUTO_RESTART_PLAYER", "1") == "1"
        if auto_restart:
            # Reload playlist if running, otherwise start player
            if mpv.mpv_is_running():
                mpv.reload_playlist()
            else:
                mpv.start_player()
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
