"""SQLite helpers."""
import sqlite3
import json
from datetime import datetime
from pathlib import Path

from app.config import DATABASE_PATH


def get_db():
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            hashed_password TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS device (
            store_id TEXT,
            store_name TEXT,
            device_id TEXT PRIMARY KEY,
            hostname TEXT,
            tailscale_ip TEXT,
            location_note TEXT,
            music_profile TEXT,
            last_seen TEXT,
            last_sync_at TEXT,
            last_error TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT,
            message TEXT,
            stdout TEXT,
            stderr TEXT
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            username TEXT,
            action TEXT NOT NULL,
            details TEXT
        )
        """
    )

    conn.commit()
    conn.close()


def get_setting(key: str, default=None):
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    if row is None:
        return default
    return row["value"]


def set_setting(key: str, value: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    conn.commit()
    conn.close()


def get_all_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


def audit(username: str, action: str, details: dict | None = None):
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO audit_log(created_at, username, action, details) VALUES(?, ?, ?, ?)",
        (datetime.utcnow().isoformat(), username, action, json.dumps(details or {}, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()


def add_sync_log(started_at: str, finished_at: str | None, status: str, message: str, stdout: str = "", stderr: str = ""):
    conn = get_db()
    conn.execute(
        "INSERT INTO sync_log(started_at, finished_at, status, message, stdout, stderr) VALUES(?, ?, ?, ?, ?, ?)",
        (started_at, finished_at, status, message, stdout, stderr),
    )
    conn.commit()
    conn.close()


def get_recent_sync_logs(limit: int = 20):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM sync_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_recent_audit_logs(limit: int = 100):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
