"""NikkoMusicHub FastAPI application."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.config import BASE_DIR, DATA_DIR, LOGS_DIR, MUSIC_DIR, SCRIPTS_DIR
from app.db import init_db
from app.routes import auth, dashboard, logs, player, settings, setup, system, webdav
from app.routes.auth import init_default_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    for d in (BASE_DIR, MUSIC_DIR, LOGS_DIR, SCRIPTS_DIR, DATA_DIR):
        d.mkdir(parents=True, exist_ok=True)
    init_db()
    init_default_user()
    yield
    # Shutdown


app = FastAPI(title="NikkoMusicHub", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(setup.router)
app.include_router(webdav.router)
app.include_router(player.router)
app.include_router(system.router)
app.include_router(logs.router)
app.include_router(settings.router)


@app.exception_handler(401)
async def unauthorized_handler(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return RedirectResponse(url="/login", status_code=303)
    return RedirectResponse(url="/login", status_code=303)


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    auth.get_current_user(request)
    return templates.TemplateResponse("settings.html", {"request": request})


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("NIKKO_PORT", "8080"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
