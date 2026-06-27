"""Rotate the Pi admin password from stdin without exposing it in arguments."""
from __future__ import annotations

import sys
from datetime import datetime, timezone

import bcrypt

from app.config import DEFAULT_USERNAME
from app.db import get_db


def main() -> int:
    password = sys.stdin.read().strip()
    if len(password) < 12:
        print("Password must contain at least 12 characters", file=sys.stderr)
        return 2

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    conn = get_db()
    cursor = conn.execute(
        "UPDATE users SET hashed_password = ?, is_default = 0, updated_at = ? WHERE username = ?",
        (hashed, datetime.now(timezone.utc).isoformat(), DEFAULT_USERNAME),
    )
    conn.commit()
    conn.close()
    if cursor.rowcount != 1:
        print("Admin user was not found", file=sys.stderr)
        return 1
    print("Pi admin password rotated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
