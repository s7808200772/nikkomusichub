"""Player control routes."""
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import MUSIC_DIR
from app.db import audit
from app.routes.auth import get_current_user_or_local
from app.services import mpv
from app.services.system import list_audio_devices, list_music_files, run, service_enabled
from app.db import set_setting, get_setting
from app.routes.dashboard import bump_dashboard_version

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/player")
async def player_page(request: Request):
    get_current_user_or_local(request)
    return RedirectResponse(url="/", status_code=303)


@router.get("/api/player/status")
def player_status(request: Request):
    get_current_user_or_local(request)
    return mpv.get_status()


@router.post("/api/player/play")
async def player_play(request: Request):
    user = get_current_user_or_local(request)
    status = mpv.get_status()
    if status["state"] == "paused":
        res = mpv.resume()
        audit(user, "player_resume", {"ok": res["ok"]})
        return res
    res = mpv.start_player()
    audit(user, "player_play", {"ok": res["ok"]})
    return res


@router.post("/api/player/pause")
async def player_pause(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.pause()
    audit(user, "player_pause", {})
    return res


@router.post("/api/player/resume")
async def player_resume(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.resume()
    audit(user, "player_resume", {})
    return res


@router.post("/api/player/stop")
async def player_stop(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.stop()
    audit(user, "player_stop", {})
    return res


@router.post("/api/player/next")
async def player_next(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.next_track()
    audit(user, "player_next", {})
    return res


@router.post("/api/player/prev")
async def player_prev(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.prev_track()
    audit(user, "player_prev", {})
    return res


@router.post("/api/player/volume")
async def player_volume(request: Request, volume: int = Form(...)):
    user = get_current_user_or_local(request)
    res = mpv.set_volume(volume)
    audit(user, "player_volume", {"volume": volume})
    return res


@router.post("/api/player/seek")
async def player_seek(request: Request, position: float = Form(...)):
    user = get_current_user_or_local(request)
    res = mpv.seek(position)
    audit(user, "player_seek", {"position": position})
    return res


@router.post("/api/player/mute")
async def player_mute(request: Request, mute: int = Form(...)):
    user = get_current_user_or_local(request)
    res = mpv.set_mute(bool(mute))
    audit(user, "player_mute", {"mute": bool(mute)})
    return res


@router.post("/api/player/mute-toggle")
async def player_mute_toggle(request: Request):
    user = get_current_user_or_local(request)
    status = mpv.get_status()
    new_mute = not status.get("mute", False)
    res = mpv.set_mute(new_mute)
    audit(user, "player_mute_toggle", {"mute": new_mute, "ok": res["ok"]})
    return {
        "ok": res["ok"],
        "mute": new_mute,
        "volume": status.get("volume", 100),
    }


@router.post("/api/player/shuffle")
async def player_shuffle(request: Request, enabled: int = Form(...)):
    user = get_current_user_or_local(request)
    res = mpv.set_shuffle(bool(enabled))
    audit(user, "player_shuffle", {"enabled": bool(enabled)})
    return res


@router.post("/api/player/loop")
async def player_loop(request: Request, enabled: int = Form(...)):
    user = get_current_user_or_local(request)
    res = mpv.set_loop(bool(enabled))
    audit(user, "player_loop", {"enabled": bool(enabled)})
    return res


@router.post("/api/player/reload")
async def player_reload(request: Request):
    user = get_current_user_or_local(request)
    res = mpv.reload_playlist()
    audit(user, "player_reload", res)
    return res


@router.get("/api/player/playlist")
def player_playlist(request: Request):
    get_current_user_or_local(request)
    return {"playlist": mpv.get_playlist()}


@router.get("/api/player/library")
def player_library(request: Request):
    get_current_user_or_local(request)
    return {"files": list_music_files(MUSIC_DIR)}


def _resolve_music_path(path: str) -> str:
    from pathlib import Path
    from app.config import MUSIC_DIR

    p = Path(path)
    if not p.is_absolute():
        p = MUSIC_DIR / p
    return str(p.resolve())


@router.post("/api/player/play-file")
async def player_play_file(request: Request, path: str = Form(...)):
    user = get_current_user_or_local(request)
    from app.services.system import safe_path_validate
    full_path = _resolve_music_path(path)
    if not safe_path_validate(full_path):
        return {"ok": False, "stderr": "Invalid path"}
    res = mpv.load_file(full_path, "replace")
    audit(user, "player_play_file", {"path": path, "ok": res["ok"]})
    return res


@router.post("/api/player/delete-file")
async def player_delete_file(request: Request, path: str = Form(...)):
    user = get_current_user_or_local(request)
    from app.services.system import safe_path_validate
    full_path = _resolve_music_path(path)
    if not safe_path_validate(full_path):
        return {"ok": False, "stderr": "Invalid path"}
    status = mpv.get_status()
    res = mpv.remove_file(full_path)
    if res.get("ok"):
        if status.get("state") != "stopped":
            mpv.stop()
        mpv.reload_playlist()
    audit(user, "player_delete_file", {"path": path, "ok": res["ok"]})
    return res


@router.get("/api/player/service-status")
def player_service_status(request: Request):
    get_current_user_or_local(request)
    return {"enabled": service_enabled("nikko-music-player.service")}


@router.post("/api/player/enable-service")
async def enable_player_service(request: Request):
    user = get_current_user_or_local(request)
    res = run(["sudo", "systemctl", "enable", "nikko-music-player.service"], timeout=30)
    audit(user, "enable_player_service", {"ok": res["ok"]})
    return res


@router.post("/api/player/disable-service")
async def disable_player_service(request: Request):
    user = get_current_user_or_local(request)
    res = run(["sudo", "systemctl", "disable", "nikko-music-player.service"], timeout=30)
    audit(user, "disable_player_service", {"ok": res["ok"]})
    return res


@router.get("/api/audio/devices")
def audio_devices(request: Request):
    get_current_user_or_local(request)
    return {"devices": list_audio_devices(), "current": get_setting("audio_output_device", "")}


@router.post("/api/audio/output")
async def set_audio_output(request: Request, device: str = Form(...)):
    user = get_current_user_or_local(request)
    set_setting("audio_output_device", device)
    res = mpv.set_audio_device(device)
    audit(user, "set_audio_output", {"device": device, "ok": res["ok"]})
    return res
