"""CLI runner used by systemd timer to perform NAS WebDAV sync."""
import os
import sys

from app.config import MUSIC_DIR, RCLONE_REMOTE_PATH_DEFAULT
from app.db import get_setting, init_db
from app.services import mpv, sync_manager


def main():
    init_db()
    remote_path = get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))

    result = sync_manager.run_sync_sync(remote_path, local)

    if result["status"] == "success":
        auto_restart = os.environ.get("NIKKO_AUTO_RESTART_PLAYER", "1") == "1"
        if auto_restart:
            if mpv.mpv_is_running():
                mpv.reload_playlist()
            else:
                mpv.start_player()
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
