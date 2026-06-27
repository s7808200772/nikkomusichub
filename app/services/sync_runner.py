"""CLI runner used by systemd timer to perform NAS WebDAV sync."""
import os
import sys

from app.config import MUSIC_DIR, RCLONE_REMOTE_PATH_DEFAULT
from app.db import init_db
from app.services import mpv, sync_manager


def main():
    init_db()
    from app.db import get_setting

    remote_path = get_setting("webdav_remote_path", RCLONE_REMOTE_PATH_DEFAULT)
    local = get_setting("local_music_path", str(MUSIC_DIR))

    result = sync_manager.start_sync(remote_path, local)
    if not result["ok"]:
        return 1

    # Wait for the background sync to finish
    import time
    for _ in range(720):  # wait up to 60 minutes
        progress = sync_manager.get_progress()
        if not progress["running"]:
            break
        time.sleep(5)

    progress = sync_manager.get_progress()
    if progress["status"] == "success":
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
