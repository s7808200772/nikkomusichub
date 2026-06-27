"""Player control routes."""
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import MUSIC_DIR
from app.db import audit
from app.routes.auth import get_current_user_or_local
from app.services import mpv
from app.services.system import list_music_files, run, service_enabled

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/player")
async def player_page(request: Request):
    get_current_user_or_local(request)
    return RedirectResponse(url="/", status_code=303)


@router.get("/api/player/status")
async def player_status(request: Request):
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


@router.post("/api/player/mute")
async def player_mute(request: Request, mute: int = Form(...)):
    user = get_current_user_or_local(request)
    res = mpv.set_mute(bool(mute))
    audit(user, "player_mute", {"mute": bool(mute)})
    return res


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
async def player_playlist(request: Request):
    get_current_user_or_local(request)
    return {"playlist": mpv.get_playlist()}


@router.get("/api/player/library")
async def player_library(request: Request):
    get_current_user_or_local(request)
    return {"files": list_music_files(MUSIC_DIR)}


@router.get("/api/player/service-status")
async def player_service_status(request: Request):
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
