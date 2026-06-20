"""NikkoMusicHub Central Management Platform."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from cloud.app.config import BASE_DIR
from cloud.app.db import init_db
from cloud.app.routes import auth, commands, dashboard, stores
from cloud.app.routes.auth import init_default_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_default_user()
    yield


app = FastAPI(title="NikkoMusicHub Cloud", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(stores.router)
app.include_router(commands.router)


@app.exception_handler(401)
async def unauthorized_handler(request: Request, exc):
    return RedirectResponse(url="/login", status_code=303)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("NIKKO_CLOUD_PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
