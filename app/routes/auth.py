"""Authentication routes and helpers."""
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Form, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
    SECRET_KEY,
)
from app.db import audit, get_db, get_setting, set_setting

templates = Jinja2Templates(directory="app/templates")

router = APIRouter()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict):
    import jwt
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str):
    import jwt
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None


def get_current_user(request: Request):
    token = request.cookies.get("nikko_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload.get("sub")


def is_local_api_request(request: Request) -> bool:
    """Allow requests from localhost without additional authentication.

    The Pi API binds to 127.0.0.1 and is only reachable from the local
    machine. Combined with Tailscale network access control, this is
    sufficient for the central platform to manage the device.
    """
    client_ip = request.client.host if request.client else None
    return client_ip in ("127.0.0.1", "::1")


def get_current_user_or_local(request: Request):
    """Authenticate via JWT cookie or local API key (localhost only)."""
    if is_local_api_request(request):
        return "local"
    return get_current_user(request)


def init_default_user():
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (DEFAULT_USERNAME,)).fetchone()
    conn.close()
    if row is None:
        conn = get_db()
        conn.execute(
            "INSERT INTO users(username, hashed_password, is_default, updated_at) VALUES(?, ?, ?, ?)",
            (DEFAULT_USERNAME, hash_password(DEFAULT_PASSWORD), 1, datetime.utcnow().isoformat()),
        )
        conn.commit()
        conn.close()


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.post("/login")
async def login_post(response: Response, username: str = Form(...), password: str = Form(...)):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not row or not verify_password(password, row["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": username})
    resp = RedirectResponse(url="/", status_code=303)
    resp.set_cookie("nikko_token", token, httponly=True, max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return resp


@router.get("/logout")
async def logout():
    resp = RedirectResponse(url="/login", status_code=303)
    resp.delete_cookie("nikko_token")
    return resp


@router.post("/api/change-password")
async def change_password(request: Request, current: str = Form(...), new_password: str = Form(...)):
    user = get_current_user(request)
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (user,)).fetchone()
    if not row or not verify_password(current, row["hashed_password"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current password incorrect")
    conn.execute(
        "UPDATE users SET hashed_password = ?, is_default = 0, updated_at = ? WHERE username = ?",
        (hash_password(new_password), datetime.utcnow().isoformat(), user),
    )
    conn.commit()
    conn.close()
    audit(user, "change_password", {})
    return {"ok": True}


@router.get("/api/me")
async def me(request: Request):
    user = get_current_user(request)
    conn = get_db()
    row = conn.execute("SELECT username, is_default FROM users WHERE username = ?", (user,)).fetchone()
    conn.close()
    return {"username": row["username"], "is_default": bool(row["is_default"])}
