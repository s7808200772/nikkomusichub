"""Watchdog health check runner.

This script is invoked by nikko-music-watchdog.timer every few minutes.
It checks critical services and dependencies, logs issues, and attempts to
recover by restarting failed services.
"""
import json
import os
import sys
from pathlib import Path

script_dir = Path(__file__).resolve().parent
if (script_dir.parent / "app").exists():
    sys.path.insert(0, str(script_dir.parent))

from app.config import LOGS_DIR
from app.db import audit
from app.services.system import get_disk_usage, is_tailscale_up, run, service_status

LOGS_DIR.mkdir(parents=True, exist_ok=True)
WATCHDOG_LOG = LOGS_DIR / "watchdog.log"

SERVICES = [
    "nikko-music-hub-web.service",
    "nikko-music-player.service",
    "nikko-music-mqtt.service",
]


def log(msg: str):
    line = f"{__import__('datetime').datetime.utcnow().isoformat()} {msg}"
    with open(WATCHDOG_LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)


def check():
    issues = []

    for svc in SERVICES:
        status = service_status(svc)
        if status == "failed":
            issues.append(f"{svc} is failed")
            log(f"Attempting to restart {svc}")
            res = run(["sudo", "systemctl", "restart", svc], timeout=60)
            if not res["ok"]:
                issues.append(f"Failed to restart {svc}: {res.get('stderr', '')}")
        elif status not in ("active", "activating"):
            issues.append(f"{svc} is {status}")

    disk = get_disk_usage("/")
    if disk.get("percent", 0) >= 90:
        issues.append(f"Disk usage critical: {disk.get('percent')}%")

    if not is_tailscale_up():
        issues.append("Tailscale is not up")

    if issues:
        log("Issues found: " + "; ".join(issues))
        audit("watchdog", "issues_found", {"issues": issues})
        return 1

    log("All checks passed")
    return 0


def main():
    try:
        return check()
    except Exception as e:
        log(f"Watchdog exception: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
