"""Authentication routes for central platform."""
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import APIRouter, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from cloud.app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    BASE_DIR,
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
    SECRET_KEY,
)
from cloud.app.db import audit, create_or_update_user, get_user

router = APIRouter()
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None


def get_current_user(request: Request) -> str:
    token = request.cookies.get("nikko_cloud_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload.get("sub")


def init_default_user():
    user = get_user(DEFAULT_USERNAME)
    if not user:
        create_or_update_user(DEFAULT_USERNAME, hash_password(DEFAULT_PASSWORD), is_default=1)


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/login")
async def login_post(response: Response, username: str = Form(...), password: str = Form(...)):
    user = get_user(username)
    if not user or not verify_password(password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token({"sub": username})
    resp = RedirectResponse(url="/", status_code=303)
    resp.set_cookie("nikko_cloud_token", token, httponly=True, max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return resp


@router.get("/logout")
async def logout():
    resp = RedirectResponse(url="/login", status_code=303)
    resp.delete_cookie("nikko_cloud_token")
    return resp


@router.get("/api/me")
async def me(request: Request):
    user = get_current_user(request)
    row = get_user(user)
    return {"username": row["username"], "is_default": bool(row["is_default"])}


@router.post("/api/change-password")
async def change_password(request: Request, current: str = Form(...), new_password: str = Form(...)):
    user = get_current_user(request)
    row = get_user(user)
    if not row or not verify_password(current, row["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    create_or_update_user(user, hash_password(new_password), is_default=0)
    audit(user, None, "change_password", {})
    return {"ok": True}
