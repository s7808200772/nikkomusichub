"""Authentication routes and helpers."""
from collections import defaultdict, deque
from datetime import datetime, timedelta
import hmac
import re
import time

import bcrypt
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    COOKIE_SECURE,
    DEFAULT_PASSWORD,
    DEFAULT_USERNAME,
    SECRET_KEY,
)
from app.db import audit, get_db, get_setting, set_setting

templates = Jinja2Templates(directory="app/templates")

router = APIRouter()
_failed_logins: dict[str, deque[float]] = defaultdict(deque)
_LOGIN_WINDOW_SECONDS = 15 * 60
_LOGIN_MAX_FAILURES = 5


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",", 1)[0].strip() or (request.client.host if request.client else "unknown")


def _prune_failures(ip: str) -> deque[float]:
    failures = _failed_logins[ip]
    cutoff = time.monotonic() - _LOGIN_WINDOW_SECONDS
    while failures and failures[0] < cutoff:
        failures.popleft()
    return failures


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
    username = payload.get("sub")
    password_version = payload.get("pwdv")
    if not username or not password_version:
        raise HTTPException(status_code=401, detail="Session expired")
    conn = get_db()
    row = conn.execute(
        "SELECT username, updated_at, is_default FROM users WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if not row or not hmac.compare_digest(str(row["updated_at"]), str(password_version)):
        raise HTTPException(status_code=401, detail="Session expired")
    return username


def user_uses_initial_password(username: str) -> bool:
    conn = get_db()
    row = conn.execute("SELECT is_default FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return bool(row and row["is_default"])


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
    error = request.query_params.get("error")
    message = "帳號或密碼錯誤" if error == "invalid" else ""
    return templates.TemplateResponse("login.html", {"request": request, "error": message})


@router.get("/change-password", response_class=HTMLResponse)
async def change_password_page(request: Request):
    get_current_user_or_local(request)
    return templates.TemplateResponse("change_password.html", {"request": request})


@router.post("/login")
async def login_post(request: Request, username: str = Form(...), password: str = Form(...)):
    ip = _client_ip(request)
    failures = _prune_failures(ip)
    if len(failures) >= _LOGIN_MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Too many login attempts")

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if not row or not verify_password(password, row["hashed_password"]):
        failures.append(time.monotonic())
        return RedirectResponse(url="/login?error=invalid", status_code=303)
    _failed_logins.pop(ip, None)
    token = create_access_token({"sub": username, "pwdv": row["updated_at"]})
    resp = RedirectResponse(url="/", status_code=303)
    resp.set_cookie(
        "nikko_token",
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
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
    if (
        len(new_password) < 12
        or not re.search(r"[A-Z]", new_password)
        or not re.search(r"[a-z]", new_password)
        or not re.search(r"\d", new_password)
    ):
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 12 characters and include upper/lowercase letters and a number",
        )
    updated_at = datetime.utcnow().isoformat()
    conn.execute(
        "UPDATE users SET hashed_password = ?, is_default = 0, updated_at = ? WHERE username = ?",
        (hash_password(new_password), updated_at, user),
    )
    conn.commit()
    conn.close()
    audit(user, "change_password", {})
    token = create_access_token({"sub": user, "pwdv": updated_at})
    resp = JSONResponse({"ok": True})
    resp.set_cookie(
        "nikko_token",
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return resp


@router.get("/api/me")
async def me(request: Request):
    user = get_current_user(request)
    conn = get_db()
    row = conn.execute("SELECT username, is_default FROM users WHERE username = ?", (user,)).fetchone()
    conn.close()
    return {"username": row["username"], "is_default": bool(row["is_default"])}
