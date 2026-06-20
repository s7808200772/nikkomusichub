"""SQLite helpers for central platform."""
import sqlite3
from datetime import datetime
from pathlib import Path

from cloud.app.config import DATABASE_PATH


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
        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id TEXT UNIQUE NOT NULL,
            store_name TEXT NOT NULL,
            device_id TEXT,
            hostname TEXT,
            tailscale_ip TEXT NOT NULL,
            ssh_port INTEGER DEFAULT 22,
            ssh_username TEXT DEFAULT 'pi',
            ssh_private_key TEXT NOT NULL,
            local_api_key TEXT NOT NULL,
            location_note TEXT,
            music_profile TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_seen TEXT,
            last_sync_at TEXT,
            last_error TEXT,
            status TEXT DEFAULT 'unknown'
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            username TEXT,
            store_id TEXT,
            action TEXT NOT NULL,
            details TEXT
        )
        """
    )

    conn.commit()
    conn.close()


def get_user(username: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_or_update_user(username: str, hashed_password: str, is_default: int = 0):
    now = datetime.utcnow().isoformat()
    conn = get_db()
    conn.execute(
        """
        INSERT INTO users(username, hashed_password, is_default, updated_at)
        VALUES(?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
            hashed_password=excluded.hashed_password,
            is_default=excluded.is_default,
            updated_at=excluded.updated_at
        """,
        (username, hashed_password, is_default, now),
    )
    conn.commit()
    conn.close()


def list_stores():
    conn = get_db()
    rows = conn.execute("SELECT * FROM stores ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_store(store_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM stores WHERE store_id = ?", (store_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_store(data: dict):
    now = datetime.utcnow().isoformat()
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO stores(
            store_id, store_name, device_id, hostname, tailscale_ip,
            ssh_port, ssh_username, ssh_private_key, local_api_key,
            location_note, music_profile, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["store_id"],
            data["store_name"],
            data.get("device_id"),
            data.get("hostname"),
            data["tailscale_ip"],
            data.get("ssh_port", 22),
            data.get("ssh_username", "pi"),
            data["ssh_private_key"],
            data["local_api_key"],
            data.get("location_note"),
            data.get("music_profile"),
            now,
            now,
        ),
    )
    conn.commit()
    store = cur.execute("SELECT * FROM stores WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(store)


def update_store(store_id: str, data: dict):
    now = datetime.utcnow().isoformat()
    allowed = [
        "store_name", "device_id", "hostname", "tailscale_ip",
        "ssh_port", "ssh_username", "ssh_private_key", "local_api_key",
        "location_note", "music_profile",
    ]
    fields = []
    values = []
    for key in allowed:
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    if not fields:
        return get_store(store_id)
    fields.append("updated_at = ?")
    values.append(now)
    values.append(store_id)
    conn = get_db()
    conn.execute(f"UPDATE stores SET {', '.join(fields)} WHERE store_id = ?", values)
    conn.commit()
    conn.close()
    return get_store(store_id)


def delete_store(store_id: str):
    conn = get_db()
    conn.execute("DELETE FROM stores WHERE store_id = ?", (store_id,))
    conn.commit()
    conn.close()


def update_store_status(store_id: str, status: dict):
    conn = get_db()
    conn.execute(
        """
        UPDATE stores SET
            last_seen = ?,
            last_sync_at = ?,
            last_error = ?,
            status = ?
        WHERE store_id = ?
        """,
        (
            status.get("last_seen"),
            status.get("last_sync_at"),
            status.get("last_error"),
            status.get("status", "unknown"),
            store_id,
        ),
    )
    conn.commit()
    conn.close()


def audit(username: str | None, store_id: str | None, action: str, details: dict | None = None):
    conn = get_db()
    conn.execute(
        "INSERT INTO audit_log(created_at, username, store_id, action, details) VALUES(?, ?, ?, ?, ?)",
        (datetime.utcnow().isoformat(), username, store_id, action, str(details or {})),
    )
    conn.commit()
    conn.close()
