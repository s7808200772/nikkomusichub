"""CLI runner used by systemd timer to perform NAS WebDAV sync."""
import os
import sys

from app.config import MUSIC_DIR, RCLONE_REMOTE_PATH_DEFAULT
from app.db import init_db
from app.services import mpv, rclone


def main():
    init_db()
    remote_path = os.environ.get("NIKKO_WEBDAV_REMOTE_PATH", RCLONE_REMOTE_PATH_DEFAULT)
    local = os.environ.get("NIKKO_LOCAL_PATH", str(MUSIC_DIR))

    result = rclone.sync_music(remote_path, local)

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
