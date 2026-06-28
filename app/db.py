"""SQLite helpers with WAL, indexes and per-thread connection reuse."""
import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from app.config import DATABASE_PATH

# Per-thread connection pool. FastAPI runs sync routes in a thread pool, so
# reusing the same connection per thread avoids repeatedly opening the file.
_db_local = threading.local()


def _configure_connection(conn: sqlite3.Connection) -> None:
    """Enable WAL mode and reasonable defaults for concurrent readers."""
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA mmap_size=30000000;")


def get_db() -> sqlite3.Connection:
    conn = getattr(_db_local, "conn", None)
    if conn is None:
        DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
        _configure_connection(conn)
        _db_local.conn = conn
    return conn


def init_db():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    _configure_connection(conn)
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

    # Indexes for common queries
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_device_store_id ON device(store_id)")

    conn.commit()
    conn.close()


def get_setting(key: str, default=None):
    row = get_db().execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row is None:
        return default
    return row["value"]


def set_setting(key: str, value: str):
    db = get_db()
    db.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    db.commit()


def get_all_settings():
    rows = get_db().execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


# Optional callback registered at startup to notify the dashboard of state changes.
_dashboard_bump = None


def set_dashboard_bump_callback(callback):
    global _dashboard_bump
    _dashboard_bump = callback


def audit(username: str, action: str, details: dict | None = None):
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = get_db()
    db.execute(
        "INSERT INTO audit_log(created_at, username, action, details) VALUES(?, ?, ?, ?)",
        (datetime.utcnow().isoformat(), username, action, json.dumps(details or {}, ensure_ascii=False)),
    )
    db.commit()
    if _dashboard_bump is not None:
        try:
            _dashboard_bump()
        except Exception:
            pass


def add_sync_log(started_at: str, finished_at: str | None, status: str, message: str, stdout: str = "", stderr: str = ""):
    db = get_db()
    db.execute(
        "INSERT INTO sync_log(started_at, finished_at, status, message, stdout, stderr) VALUES(?, ?, ?, ?, ?, ?)",
        (started_at, finished_at, status, message, stdout, stderr),
    )
    db.commit()


def get_recent_sync_logs(limit: int = 20):
    rows = get_db().execute(
        "SELECT * FROM sync_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_recent_audit_logs(limit: int = 100):
    rows = get_db().execute(
        "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]
