"""System information helpers."""
import os
import re
import socket
import subprocess
import time
from pathlib import Path

import psutil

from app.config import (
    BASE_DIR,
    MUSIC_DIR,
    PLAYER_LOG_PATH,
    SYNC_LOG_PATH,
    SYSTEM_LOG_PATH,
)
from app.db import get_setting


def run(cmd: list[str], shell: bool = False, timeout: int = 120, check: bool = False) -> dict:
    """Run a whitelisted command safely. cmd must be a list of args."""
    try:
        proc = subprocess.run(
            cmd,
            shell=shell,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "ok": proc.returncode == 0 if not check else True,
        }
    except subprocess.TimeoutExpired:
        return {"returncode": -1, "stdout": "", "stderr": "Timeout", "ok": False}
    except Exception as e:
        return {"returncode": -1, "stdout": "", "stderr": str(e), "ok": False}


def get_hostname() -> str:
    return socket.gethostname()


def get_ip_addresses():
    """Return dict with lan_ip, tailscale_ip, etc."""
    lan_ip = ""
    tailscale_ip = ""
    try:
        # Best effort: interface addresses
        addrs = psutil.net_if_addrs()
        for iface, family_addrs in addrs.items():
            lower = iface.lower()
            for fam in family_addrs:
                if fam.family == socket.AF_INET:
                    ip = fam.address
                    if ip.startswith("100."):
                        tailscale_ip = ip
                    elif not ip.startswith("127.") and not lan_ip:
                        if "tailscale" not in lower:
                            lan_ip = ip
    except Exception:
        pass

    # Fallback for LAN IP
    if not lan_ip:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
            s.close()
        except Exception:
            lan_ip = "127.0.0.1"

    return {"lan_ip": lan_ip, "tailscale_ip": tailscale_ip}


def get_cpu_usage() -> float:
    return psutil.cpu_percent(interval=0.5)


def get_ram_usage() -> dict:
    mem = psutil.virtual_memory()
    return {"percent": mem.percent, "used_mb": mem.used // (1024 * 1024), "total_mb": mem.total // (1024 * 1024)}


def get_disk_usage(path: str = "/") -> dict:
    usage = psutil.disk_usage(path)
    return {
        "percent": usage.percent,
        "free_gb": round(usage.free / (1024 ** 3), 2),
        "total_gb": round(usage.total / (1024 ** 3), 2),
    }


def get_uptime_seconds() -> int:
    return int(time.time() - psutil.boot_time())


def command_exists(cmd: str) -> bool:
    return run(["which", cmd])["ok"]


def get_version(cmd: list[str]) -> str:
    res = run(cmd, timeout=10)
    if not res["ok"]:
        return "未安裝"
    out = res["stdout"].strip().splitlines()
    return out[0] if out else "unknown"


def get_rclone_version() -> str:
    return get_version(["rclone", "version"])


def get_mpv_version() -> str:
    return get_version(["mpv", "--version"])


def get_python_version() -> str:
    import sys
    return sys.version


def get_pi_model() -> str:
    try:
        p = Path("/proc/device-tree/model")
        if p.exists():
            return p.read_text().strip().replace("\x00", "")
    except Exception:
        pass
    return "Unknown"


def get_os_version() -> str:
    try:
        p = Path("/etc/os-release")
        if p.exists():
            content = p.read_text()
            m = re.search(r'PRETTY_NAME="([^"]+)"', content)
            return m.group(1) if m else content.splitlines()[0]
    except Exception:
        pass
    return "Unknown"


def get_cpu_temp() -> float | None:
    try:
        p = Path("/sys/class/thermal/thermal_zone0/temp")
        if p.exists():
            return round(int(p.read_text().strip()) / 1000.0, 1)
    except Exception:
        pass
    return None


def service_status(name: str) -> str:
    res = run(["systemctl", "is-active", name], timeout=10)
    status = res["stdout"].strip()
    if status in ("active", "inactive", "failed", "activating"):
        return status
    return "unknown"


def service_enabled(name: str) -> bool:
    res = run(["systemctl", "is-enabled", name], timeout=10)
    return res["stdout"].strip() == "enabled"


def count_mp3_files(path: Path = MUSIC_DIR) -> int:
    if not path.exists():
        return 0
    return sum(1 for p in path.rglob("*") if p.is_file() and p.suffix.lower() == ".mp3")


def list_music_files(path: Path = MUSIC_DIR) -> list[dict]:
    if not path.exists():
        return []
    files = []
    for p in sorted(path.rglob("*")):
        if p.is_file() and p.suffix.lower() == ".mp3":
            rel = p.relative_to(path)
            files.append(
                {
                    "name": p.name,
                    "path": str(rel),
                    "size": p.stat().st_size,
                    "mtime": p.stat().st_mtime,
                }
            )
    return files


def get_music_folder_size(path: Path = MUSIC_DIR) -> str:
    if not path.exists():
        return "0 B"
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    gb = total / (1024 ** 3)
    if gb >= 1:
        return f"{gb:.2f} GB"
    mb = total / (1024 ** 2)
    if mb >= 1:
        return f"{mb:.2f} MB"
    return f"{total} B"


def tail_log(path: Path, lines: int = 100) -> str:
    if not path.exists():
        return ""
    res = run(["tail", "-n", str(lines), str(path)], timeout=10)
    return res["stdout"]


def tail_journal(unit: str, lines: int = 100) -> str:
    res = run(["journalctl", "-u", unit, "-n", str(lines), "--no-pager"], timeout=15)
    return res["stdout"]


def is_tailscale_up() -> bool:
    res = run(["tailscale", "status", "--self"], timeout=10)
    return res["ok"]


def test_audio() -> dict:
    return run(["bash", str(BASE_DIR / "scripts" / "nikko-test-audio.sh")], timeout=30)


def reboot() -> dict:
    return run(["sudo", "reboot"], timeout=10)


def safe_path_validate(path_str: str) -> bool:
    """Prevent path traversal."""
    p = Path(path_str).resolve()
    base = BASE_DIR.resolve()
    return str(p).startswith(str(base)) or str(p) == "/tmp/nikko-mpv.sock"
