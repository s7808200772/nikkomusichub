"""System information helpers."""
import os
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path

import psutil

from app.config import (
    BASE_DIR,
    MUSIC_DIR,
    MUSIC_OLD_DIR,
    PLAYER_LOG_PATH,
    SYNC_LOG_PATH,
    SYSTEM_LOG_PATH,
)
from app.db import get_setting


# Allowed systemd service names for status / journal queries.
ALLOWED_SERVICES = frozenset(
    {
        "nikko-music-hub-web.service",
        "nikko-music-player.service",
        "nikko-music-sync.service",
        "nikko-music-sync.timer",
        "nikko-music-mqtt.service",
    }
)


def _validate_service_name(name: str) -> None:
    if name not in ALLOWED_SERVICES:
        raise ValueError(f"Service name not allowed: {name}")


def run(cmd: list[str], shell: bool = False, timeout: int = 120, check: bool = False, env: dict | None = None) -> dict:
    """Run a whitelisted command safely. cmd must be a list of args.

    Uses a new process group so that child processes (e.g. rclone) are
    killed together if the timeout expires.
    """
    import signal

    try:
        proc_env = os.environ.copy()
        if env:
            proc_env.update(env)
        proc = subprocess.Popen(
            cmd,
            shell=shell,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
            env=proc_env,
        )
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
            return {
                "returncode": proc.returncode,
                "stdout": stdout,
                "stderr": stderr,
                "ok": proc.returncode == 0 if not check else True,
            }
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
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


def get_git_version() -> dict:
    """Return current git commit hash, branch and commit date."""
    commit = run(["git", "rev-parse", "HEAD"], timeout=10)["stdout"].strip() or "unknown"
    branch = run(["git", "branch", "--show-current"], timeout=10)["stdout"].strip() or "unknown"
    date_res = run(["git", "show", "-s", "--format=%cI", "HEAD"], timeout=10)
    commit_date = date_res["stdout"].strip() or None
    return {"commit": commit, "branch": branch, "date": commit_date}


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
    _validate_service_name(name)
    res = run(["systemctl", "is-active", name], timeout=10)
    status = res["stdout"].strip()
    if status in ("active", "inactive", "failed", "activating"):
        return status
    return "unknown"


def service_enabled(name: str) -> bool:
    _validate_service_name(name)
    res = run(["systemctl", "is-enabled", name], timeout=10)
    return res["stdout"].strip() == "enabled"


def _is_mp3(p: Path) -> bool:
    return p.is_file() and p.suffix.lower() == ".mp3"


def count_mp3_files(path: Path = MUSIC_DIR) -> int:
    if not path.exists():
        return 0
    return sum(1 for p in path.rglob("*") if _is_mp3(p))


def list_music_files(path: Path = MUSIC_DIR) -> list[dict]:
    if not path.exists():
        return []
    files = []
    for p in sorted(path.rglob("*")):
        if _is_mp3(p):
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


def _count_mp3_files(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for p in path.rglob("*") if p.is_file() and p.suffix.lower() == ".mp3")


def ensure_local_music_fallback() -> dict:
    """If the live music folder is empty but a backup exists, restore it.

    This guarantees playback continues even if a previous sync or
    replacement left the live folder without music.
    """
    if _count_mp3_files(MUSIC_DIR) > 0:
        return {"ok": True, "restored": False}
    if MUSIC_OLD_DIR.exists() and _count_mp3_files(MUSIC_OLD_DIR) > 0:
        try:
            if MUSIC_DIR.exists():
                shutil.rmtree(MUSIC_DIR)
            MUSIC_OLD_DIR.rename(MUSIC_DIR)
            return {"ok": True, "restored": True, "message": "已從備份還原音樂"}
        except Exception as e:
            return {"ok": False, "restored": False, "error": str(e)}
    return {"ok": True, "restored": False, "message": "無可用備份"}


def tail_log(path: Path, lines: int = 100) -> str:
    if not path.exists():
        return ""
    res = run(["tail", "-n", str(lines), str(path)], timeout=10)
    return res["stdout"]


def tail_journal(unit: str, lines: int = 100) -> str:
    _validate_service_name(unit)
    res = run(["journalctl", "-u", unit, "-n", str(lines), "--no-pager"], timeout=15)
    return res["stdout"]


def is_tailscale_up() -> bool:
    res = run(["tailscale", "status", "--self"], timeout=10)
    return res["ok"]


def _extract_host_from_url(url: str) -> str:
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url.strip())
        host = parsed.hostname or ""
        return host
    except Exception:
        return ""


def tailscale_ping(host: str) -> dict:
    """Ping a host over the Tailscale network."""
    if not host:
        return {"ok": False, "stderr": "no host"}
    res = run(["tailscale", "ping", "--c", "1", "--timeout", "5s", host], timeout=15)
    return res


def webdav_connectivity_check(webdav_url: str = "") -> dict:
    """Check if the WebDAV music source is reachable via Tailscale and rclone."""
    from app.config import RCLONE_REMOTE_NAME_DEFAULT
    from app.db import get_setting

    host = _extract_host_from_url(webdav_url) if webdav_url else ""
    tailscale_res = tailscale_ping(host) if host else {"ok": False, "stderr": "no url"}
    if not tailscale_res["ok"]:
        return {
            "ok": False,
            "tailscale_ping_ok": False,
            "webdav_ok": False,
            "host": host,
            "message": "Tailscale 無法連到 WebDAV 主機",
            "stderr": tailscale_res.get("stderr", ""),
        }
    from app.services import rclone
    remote = get_setting("webdav_remote", RCLONE_REMOTE_NAME_DEFAULT)
    webdav_res = rclone.test_remote(remote)
    return {
        "ok": webdav_res.get("ok", False),
        "tailscale_ping_ok": True,
        "webdav_ok": webdav_res.get("ok", False),
        "host": host,
        "message": "WebDAV 可連線" if webdav_res.get("ok") else "Tailscale 通但 WebDAV 失敗",
        "stderr": webdav_res.get("stderr", ""),
    }


def list_audio_devices() -> list[dict]:
    """Return available audio output devices in mpv-compatible format."""
    devices = []
    if command_exists("pactl"):
        res = run(["pactl", "list", "short", "sinks"], timeout=10)
        if res["ok"]:
            for line in res["stdout"].splitlines():
                parts = line.strip().split()
                if len(parts) >= 2:
                    sink_name = parts[1]
                    description = " ".join(parts[2:]) if len(parts) > 2 else sink_name
                    devices.append(
                        {
                            "id": f"pulse/{sink_name}",
                            "name": description,
                            "driver": "pulse",
                        }
                    )
    if not devices and command_exists("aplay"):
        # Fallback for bare ALSA systems
        res = run(["aplay", "-l"], timeout=10)
        if res["ok"]:
            card = None
            device = None
            description = ""
            for line in res["stdout"].splitlines():
                if line.startswith("card "):
                    # e.g. card 0: PCH [Intel PCH], device 0: ALC255 Analog [...]
                    head, _, rest = line.partition(",")
                    if "card " in head and "device " in head:
                        card = head.split(":")[0].replace("card ", "").strip()
                        device = head.split("device ")[1].split(":")[0].strip()
                        description = rest.strip() if rest else f"ALSA card {card} device {device}"
                        devices.append(
                            {
                                "id": f"alsa/hw:{card},{device}",
                                "name": description,
                                "driver": "alsa",
                            }
                        )
    return devices


def test_audio(device: str = "") -> dict:
    script = BASE_DIR / "scripts" / "nikko-test-audio.sh"
    env = os.environ.copy()
    if device:
        env["NIKKO_AUDIO_DEVICE"] = device
    return run(["bash", str(script)], timeout=30, env=env)


def reboot() -> dict:
    return run(["sudo", "reboot"], timeout=10)


def safe_path_validate(path_str: str) -> bool:
    """Prevent path traversal."""
    p = Path(path_str).resolve()
    base = BASE_DIR.resolve()
    return str(p).startswith(str(base)) or str(p) == "/tmp/nikko-mpv.sock"
