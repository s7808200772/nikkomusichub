"""mpv IPC control helpers."""
import json
import os
import socket
import subprocess
import time
from pathlib import Path

from app.config import MPV_SOCKET, MUSIC_DIR, PLAYER_LOG_PATH
from app.db import get_setting, set_setting
from app.services.system import command_exists, ensure_local_music_fallback, run


def _ensure_socket():
    Path(MPV_SOCKET).parent.mkdir(parents=True, exist_ok=True)


def _ipc_send(command: dict, timeout: float = 2.0) -> dict:
    _ensure_socket()
    if not Path(MPV_SOCKET).exists():
        return {"ok": False, "error": "mpv socket not found"}

    payload = json.dumps(command) + "\n"
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect(MPV_SOCKET)
            s.sendall(payload.encode())
            data = b""
            try:
                while True:
                    chunk = s.recv(4096)
                    if not chunk:
                        break
                    data += chunk
                    # mpv replies with one JSON line per request
                    if b"\n" in data:
                        break
            except socket.timeout:
                pass
            resp = data.decode().strip().splitlines()
            if resp:
                return {"ok": True, "data": json.loads(resp[0])}
            return {"ok": True, "data": {}}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def mpv_is_running() -> bool:
    if not Path(MPV_SOCKET).exists():
        return False
    res = _ipc_send({"command": ["get_property", "playback-time"]}, timeout=1.0)
    return res["ok"]


def _persisted_bool(key: str) -> bool:
    return get_setting(key, "0") == "1"


def get_status():
    # Persisted settings are the source of truth; live mpv properties override them only when successfully read.
    persisted_shuffle = _persisted_bool("player_shuffle")
    persisted_loop = _persisted_bool("player_loop")

    res = _ipc_send({"command": ["get_property", "playback-time"]})
    if not res["ok"]:
        return {
            "state": "stopped",
            "current": None,
            "position": 0,
            "duration": 0,
            "volume": 100,
            "shuffle": persisted_shuffle,
            "loop": persisted_loop,
            "playlist_count": 0,
        }

    props = {
        "pause": False,
        "playback-time": 0,
        "duration": 0,
        "media-title": "",
        "volume": 100,
        "mute": False,
        "shuffle": persisted_shuffle,
        "loop-playlist": "inf" if persisted_loop else "no",
        "playlist-count": 0,
        "playlist-pos": -1,
    }
    for key in props:
        r = _ipc_send({"command": ["get_property", key]}, timeout=1.5)
        if r["ok"] and "data" in r["data"] and r["data"]["data"] is not None:
            props[key] = r["data"]["data"]

    state = "paused" if props["pause"] else "playing"
    return {
        "state": state,
        "current": props["media-title"] or props.get("filename", "Unknown"),
        "position": round(props["playback-time"], 1) if props["playback-time"] else 0,
        "duration": round(props["duration"], 1) if props["duration"] else 0,
        "volume": int(props["volume"]),
        "mute": bool(props["mute"]),
        "shuffle": bool(props["shuffle"]),
        "loop": props["loop-playlist"] in ("inf", "yes"),
        "playlist_count": props["playlist-count"],
        "playlist_pos": props["playlist-pos"],
    }


def _apply_player_settings():
    """Apply persisted shuffle/loop settings to a running mpv instance."""
    set_shuffle(_persisted_bool("player_shuffle"))
    set_loop(_persisted_bool("player_loop"))


def start_player() -> dict:
    if mpv_is_running():
        return {"ok": True, "stdout": "mpv already running", "stderr": ""}

    # Make sure we never start with an empty music folder if a backup exists.
    ensure_local_music_fallback()

    # Build playlist file to avoid shell glob issues
    _ensure_socket()
    files = sorted({p.resolve(): p for p in (list(MUSIC_DIR.rglob("*.mp3")) + list(MUSIC_DIR.rglob("*.MP3")))}.values())
    playlist = MUSIC_DIR.parent / "playlist.m3u"
    with open(playlist, "w", encoding="utf-8") as f:
        for file in files:
            f.write(str(file) + "\n")

    if not files:
        return {"ok": False, "stderr": "No MP3 files found"}

    PLAYER_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    if "XDG_RUNTIME_DIR" not in env:
        import pwd
        uid = pwd.getpwuid(os.getuid()).pw_uid
        env["XDG_RUNTIME_DIR"] = f"/run/user/{uid}"
        env["PULSE_RUNTIME_PATH"] = f"/run/user/{uid}/pulse"

    shuffle_enabled = _persisted_bool("player_shuffle")
    loop_enabled = _persisted_bool("player_loop")

    cmd = [
        "mpv",
        "--no-video",
        f"--input-ipc-server={MPV_SOCKET}",
        "--playlist=" + str(playlist),
        f"--log-file={PLAYER_LOG_PATH}",
    ]
    if shuffle_enabled:
        cmd.append("--shuffle")
    if loop_enabled:
        cmd.append("--loop-playlist=inf")
    audio_device = get_setting("audio_output_device", "").strip()
    if audio_device:
        cmd.append(f"--audio-device={audio_device}")


    with open(PLAYER_LOG_PATH, "a") as log:
        proc = subprocess.Popen(
            cmd,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=env,
        )
    # Give mpv a moment to start
    time.sleep(1.5)
    if mpv_is_running():
        _apply_player_settings()
        return {"ok": True, "stdout": f"mpv started PID {proc.pid}", "stderr": ""}
    return {"ok": False, "stderr": "mpv failed to start, check player log"}


def pause():
    return _ipc_send({"command": ["set_property", "pause", True]})


def resume():
    return _ipc_send({"command": ["set_property", "pause", False]})


def stop():
    return _ipc_send({"command": ["stop"]})


def next_track():
    return _ipc_send({"command": ["playlist-next"]})


def prev_track():
    return _ipc_send({"command": ["playlist-prev"]})


def set_volume(vol: int):
    vol = max(0, min(150, int(vol)))
    return _ipc_send({"command": ["set_property", "volume", vol]})


def set_mute(mute: bool):
    return _ipc_send({"command": ["set_property", "mute", bool(mute)]})


def set_audio_device(device: str):
    return _ipc_send({"command": ["set_property", "audio-device", device]})


def set_shuffle(enabled: bool):
    return _ipc_send({"command": ["set_property", "shuffle", bool(enabled)]})


def set_loop(enabled: bool):
    val = "inf" if enabled else "no"
    return _ipc_send({"command": ["set_property", "loop-playlist", val]})


def seek(position: float):
    return _ipc_send({"command": ["seek", position, "absolute"]})


def load_file(path: str, mode: str = "replace"):
    res = _ipc_send({"command": ["loadfile", path, mode]})
    if res.get("ok") and mpv_is_running():
        _apply_player_settings()
    return res


def remove_file(path: str):
    try:
        Path(path).unlink()
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def reload_playlist():
    files = sorted({p.resolve(): p for p in (list(MUSIC_DIR.rglob("*.mp3")) + list(MUSIC_DIR.rglob("*.MP3")))}.values())
    playlist = MUSIC_DIR.parent / "playlist.m3u"
    with open(playlist, "w", encoding="utf-8") as f:
        for file in files:
            f.write(str(file) + "\n")
    _ipc_send({"command": ["loadlist", str(playlist), "replace"]})
    if mpv_is_running():
        _apply_player_settings()
    return {"ok": True, "count": len(files)}


def get_playlist():
    res = _ipc_send({"command": ["get_property", "playlist"]})
    if res["ok"] and "data" in res["data"]:
        return res["data"]["data"]
    return []


def install_mpv() -> dict:
    if command_exists("mpv"):
        return {"ok": True, "stdout": "mpv already installed", "stderr": ""}
    return run(["sudo", "apt", "install", "-y", "mpv"], timeout=300)
