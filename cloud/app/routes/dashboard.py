"""Central dashboard routes."""
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from cloud.app.config import BASE_DIR

from cloud.app.db import list_stores
from cloud.app.routes.auth import get_current_user

router = APIRouter()
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))


@router.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    get_current_user(request)
    return templates.TemplateResponse("dashboard.html", {"request": request})


@router.get("/api/dashboard/stores")
async def api_dashboard_stores(request: Request):
    get_current_user(request)
    stores = list_stores()
    # Sanitize keys for frontend list
    for s in stores:
        s["ssh_private_key"] = "***"
        s["local_api_key"] = "***"
    return {"stores": stores}
