"""Network watchdog install/status/log helpers for Pi devices."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

from app.config import DATA_DIR
from app.services.system import run

STATE_DIR = Path("/var/lib/nikko-watchdog")
SCRIPT_SRC = Path(__file__).resolve().parent.parent / "systemd" / "nikko-network-watchdog.sh"
SERVICE_SRC = Path(__file__).resolve().parent.parent / "systemd" / "nikko-network-watchdog.service"
TIMER_SRC = Path(__file__).resolve().parent.parent / "systemd" / "nikko-network-watchdog.timer"

SCRIPT_DST = Path("/usr/local/sbin/nikko-network-watchdog.sh")
SERVICE_DST = Path("/etc/systemd/system/nikko-network-watchdog.service")
TIMER_DST = Path("/etc/systemd/system/nikko-network-watchdog.timer")


def _read_int_file(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        return int(re.sub(r"[^0-9]", "", path.read_text(encoding="utf-8")) or 0)
    except Exception:
        return 0


def _read_text_file(path: Path, default: str = "") -> str:
    if not path.exists():
        return default
    try:
        return path.read_text(encoding="utf-8").strip()
    except Exception:
        return default


def install_watchdog(target: str = "8.8.8.8", interval: int = 60, retries: int = 3) -> dict:
    """Install or update the network watchdog script, service and timer."""
    errors = []
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)

        if not SCRIPT_SRC.exists():
            return {"ok": False, "error": f"Watchdog script source not found: {SCRIPT_SRC}"}
        if not SERVICE_SRC.exists():
            return {"ok": False, "error": f"Watchdog service source not found: {SERVICE_SRC}"}

        # Validate inputs
        target = (target or "8.8.8.8").strip()
        interval = max(10, min(3600, int(interval or 60)))
        max_fail = max(1, min(20, int(retries or 3)))

        # Write configurable config file
        config_content = f"""# Nikko Network Watchdog configuration
PING_TARGET="{target}"
REBOOT_COOLDOWN_SECONDS=1800
MAX_FAIL_BEFORE_NETWORKMANAGER={max(1, max_fail)}
MAX_FAIL_BEFORE_TAILSCALED={max(2, max_fail + 2)}
MAX_FAIL_BEFORE_REBOOT={max(3, max_fail + 4)}
"""
        config_path = Path("/tmp/nikko-watchdog.conf")
        config_path.write_text(config_content, encoding="utf-8")
        cp_config = run(["sudo", "cp", str(config_path), "/etc/nikko-watchdog.conf"], timeout=10)
        if not cp_config.get("ok"):
            errors.append(f"copy config failed: {cp_config.get('stderr')}")

        shutil.copy2(SCRIPT_SRC, SCRIPT_DST)
        shutil.copy2(SERVICE_SRC, SERVICE_DST)

        # Generate timer with configured interval
        timer_content = f"""[Unit]
Description=Run Nikko Network Watchdog every {interval} seconds

[Timer]
OnBootSec={interval}s
OnUnitActiveSec={interval}s
Persistent=true

[Install]
WantedBy=timers.target
"""
        timer_path = Path("/tmp/nikko-network-watchdog.timer")
        timer_path.write_text(timer_content, encoding="utf-8")
        cp_timer = run(["sudo", "cp", str(timer_path), str(TIMER_DST)], timeout=10)
        if not cp_timer.get("ok"):
            errors.append(f"copy timer failed: {cp_timer.get('stderr')}")

        chmod_res = run(["chmod", "+x", str(SCRIPT_DST)], timeout=10)
        if not chmod_res.get("ok"):
            errors.append(f"chmod script failed: {chmod_res.get('stderr')}")

        dr_res = run(["sudo", "systemctl", "daemon-reload"], timeout=30)
        if not dr_res.get("ok"):
            errors.append(f"daemon-reload failed: {dr_res.get('stderr')}")

        enable_res = run(["sudo", "systemctl", "enable", "--now", "nikko-network-watchdog.timer"], timeout=30)
        if not enable_res.get("ok"):
            errors.append(f"enable timer failed: {enable_res.get('stderr')}")

        if errors:
            return {"ok": False, "installed": True, "error": "; ".join(errors)}
        return {"ok": True, "installed": True, "target": target, "interval": interval, "retries": max_fail}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def disable_watchdog() -> dict:
    """Disable the watchdog timer but keep files/logs."""
    try:
        res = run(["sudo", "systemctl", "disable", "--now", "nikko-network-watchdog.timer"], timeout=30)
        if not res.get("ok"):
            return {"ok": False, "error": res.get("stderr") or res.get("stdout") or "disable failed"}
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def get_watchdog_status() -> dict:
    """Return service/timer status and state file contents."""
    timer_active = run(["systemctl", "is-active", "nikko-network-watchdog.timer"], timeout=10)
    timer_enabled = run(["systemctl", "is-enabled", "nikko-network-watchdog.timer"], timeout=10)
    service_exists = run(["systemctl", "cat", "nikko-network-watchdog.service"], timeout=10)

    return {
        "ok": True,
        "timer_active": timer_active.get("ok", False),
        "timer_enabled": timer_enabled.get("ok", False),
        "service_exists": service_exists.get("ok", False),
        "fail_count": _read_int_file(STATE_DIR / "fail_count"),
        "last_action": _read_text_file(STATE_DIR / "last_action"),
        "last_reboot": _read_text_file(STATE_DIR / "last_reboot"),
    }


def get_watchdog_logs(lines: int = 50) -> dict:
    """Return recent watchdog journal logs."""
    res = run(
        ["journalctl", "-t", "nikko-network-watchdog", "-n", str(lines), "--no-pager"],
        timeout=15,
    )
    return {
        "ok": res.get("ok", False),
        "logs": res.get("stdout") or "",
        "error": res.get("stderr") or "",
    }
