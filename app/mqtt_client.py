"""MQTT client for central cloud management.

This module runs as a standalone daemon (nikko-music-mqtt.service).
It connects to the configured MQTT broker, subscribes to command topics,
and publishes responses / status updates.
"""
import json
import logging
import os
import ssl
import sys
import threading
import time
import uuid
from pathlib import Path

# Allow running from repo root or installed path
script_dir = Path(__file__).resolve().parent
if (script_dir.parent / "app").exists():
    sys.path.insert(0, str(script_dir.parent))

import paho.mqtt.client as mqtt

from app.config import (
    DATA_DIR,
    LOGS_DIR,
    MQTT_BROKER,
    MQTT_CA_PATH,
    MQTT_COMMAND_MAX_AGE_SECONDS,
    MQTT_COMMAND_SECRET,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_TLS,
    MQTT_TOPIC_PREFIX,
    MQTT_USERNAME,
    MUSIC_DIR,
    PLAYER_LOG_PATH,
    RCLONE_CONFIG_PATH,
    SYNC_LOG_PATH,
)
from app.db import audit, get_setting, init_db
from app.services import mpv, rclone
from app.services.mqtt_auth import (
    encode_result,
    sign_response,
    verify_command,
    verify_command_allowed,
)
from app.services.system import (
    command_exists,
    count_mp3_files,
    get_cpu_temp,
    get_cpu_usage,
    get_disk_usage,
    get_hostname,
    get_ip_addresses,
    get_mpv_version,
    get_os_version,
    get_pi_model,
    get_python_version,
    get_rclone_version,
    get_ram_usage,
    get_uptime_seconds,
    is_tailscale_up,
    list_music_files,
    reboot,
    run,
    service_enabled,
    service_status,
    tail_log,
    get_music_folder_size,
)

# Ensure log directory exists before configuring file handler
LOGS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "mqtt.log"),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger("nikko-mqtt")

# Ensure DB tables exist before reading settings
try:
    init_db()
except Exception as e:
    logger.error("init_db failed: %s", e)

# Resolve MQTT Store ID: env var > settings db > hostname
MQTT_STORE_ID = os.environ.get("NIKKO_MQTT_STORE_ID") or get_setting("store_id", "")
if not MQTT_STORE_ID:
    import socket
    MQTT_STORE_ID = socket.gethostname().lower().replace(" ", "-")

logger.info("Resolved MQTT_STORE_ID=%s", MQTT_STORE_ID)

CMD_TOPIC = f"{MQTT_TOPIC_PREFIX}/{MQTT_STORE_ID}/cmd"
RESP_TOPIC = f"{MQTT_TOPIC_PREFIX}/{MQTT_STORE_ID}/resp"
STATUS_TOPIC = f"{MQTT_TOPIC_PREFIX}/{MQTT_STORE_ID}/status"

_seen_requests: dict[str, float] = {}
_seen_lock = threading.Lock()


def _claim_request(request_id: str) -> bool:
    """Return False when a recently processed request ID is replayed."""
    now = time.time()
    cutoff = now - max(MQTT_COMMAND_MAX_AGE_SECONDS * 2, 120)
    with _seen_lock:
        stale = [key for key, seen_at in _seen_requests.items() if seen_at < cutoff]
        for key in stale:
            _seen_requests.pop(key, None)
        if request_id in _seen_requests:
            return False
        _seen_requests[request_id] = now
        return True


def publish(client, topic, payload, qos=1):
    """Publish a JSON payload to a topic."""
    try:
        msg = json.dumps(payload)
        client.publish(topic, msg, qos=qos)
    except Exception as e:
        logger.error("Failed to publish to %s: %s", topic, e)


def build_dashboard():
    ips = get_ip_addresses()
    mpv_status = mpv.get_status()
    rclone_installed = command_exists("rclone")
    mpv_installed = command_exists("mpv")
    player_active = service_status("nikko-music-player.service")

    webdav_ok = False
    if rclone_installed and RCLONE_CONFIG_PATH.exists():
        try:
            webdav_ok = rclone.test_remote(get_setting("webdav_remote", "qnapmusic")).get("ok", False)
        except Exception:
            webdav_ok = False

    recent_errors = ""
    for log_path in (SYNC_LOG_PATH, PLAYER_LOG_PATH):
        tail = tail_log(log_path, lines=20)
        if "error" in tail.lower() or "failed" in tail.lower():
            recent_errors = tail
            break

    return {
        "store_name": get_setting("store_name", "未命名店鋪"),
        "hostname": get_hostname(),
        "tailscale_ip": ips["tailscale_ip"],
        "lan_ip": ips["lan_ip"],
        "cpu_percent": get_cpu_usage(),
        "ram": get_ram_usage(),
        "disk": get_disk_usage("/"),
        "uptime_seconds": get_uptime_seconds(),
        "rclone_installed": rclone_installed,
        "mpv_installed": mpv_installed,
        "player_active": player_active,
        "webdav_connected": webdav_ok,
        "last_sync_at": get_setting("last_sync_at"),
        "last_sync_status": get_setting("last_sync_status", "never"),
        "last_sync_message": get_setting("last_sync_message", ""),
        "player_status": mpv_status.get("state"),
        "current_track": mpv_status.get("current"),
        "mp3_count": count_mp3_files(MUSIC_DIR),
        "recent_errors": recent_errors,
    }


def build_system_info():
    ips = get_ip_addresses()
    return {
        "pi_model": get_pi_model(),
        "os_version": get_os_version(),
        "python_version": get_python_version(),
        "rclone_version": get_rclone_version(),
        "mpv_version": get_mpv_version(),
        "hostname": get_hostname(),
        "lan_ip": ips["lan_ip"],
        "tailscale_ip": ips["tailscale_ip"],
        "tailscale_up": is_tailscale_up(),
        "cpu_temp_c": get_cpu_temp(),
        "uptime_seconds": get_uptime_seconds(),
        "disk": get_disk_usage("/"),
        "music_folder_size": get_music_folder_size(MUSIC_DIR),
        "mp3_count": count_mp3_files(MUSIC_DIR),
        "web_service_status": service_status("nikko-music-hub-web.service"),
        "player_service_status": service_status("nikko-music-player.service"),
        "sync_timer_status": service_status("nikko-music-sync.timer"),
        "mqtt_service_status": service_status("nikko-music-mqtt.service"),
        "player_service_enabled": service_enabled("nikko-music-player.service"),
    }


def handle_command(command_key, payload=None):
    """Execute a command and return (ok, result)."""
    payload = payload or {}
    try:
        if command_key == "status_dashboard":
            return True, build_dashboard()
        if command_key == "status_system":
            return True, build_system_info()
        if command_key == "status_player":
            return True, mpv.get_status()
        if command_key == "player_play":
            res = mpv.start_player()
            return res.get("ok", False), res
        if command_key == "player_pause":
            return True, mpv.pause()
        if command_key == "player_resume":
            return True, mpv.resume()
        if command_key == "player_next":
            return True, mpv.next_track()
        if command_key == "player_mute":
            return True, mpv.set_mute(True)
        if command_key == "player_unmute":
            return True, mpv.set_mute(False)
        if command_key == "sync":
            remote_path = get_setting("webdav_remote_path", "qnapmusic:NikkoMusic")
            local = get_setting("local_music_path", str(MUSIC_DIR))
            res = rclone.sync_music(remote_path, local)
            if res.get("ok") and bool(int(get_setting("auto_restart_player", "1"))):
                if mpv.mpv_is_running():
                    mpv.reload_playlist()
                else:
                    mpv.start_player()
            return res.get("ok", False), res

        if command_key == "rescan":
            return True, mpv.reload_playlist()
        if command_key == "library_list":
            files = list_music_files(MUSIC_DIR)
            return True, {"count": len(files), "files": files[:500]}
        if command_key == "get_log":
            log_type = (payload.get("log_type") if isinstance(payload, dict) else None) or "system"
            path_map = {
                "player": PLAYER_LOG_PATH,
                "sync": SYNC_LOG_PATH,
                "system": SYSTEM_LOG_PATH,
            }
            path = path_map.get(log_type, SYSTEM_LOG_PATH)
            lines = (payload.get("lines") if isinstance(payload, dict) else 100) or 100
            return True, {"log_type": log_type, "lines": tail_log(path, int(lines))}
        if command_key == "restart_player":
            run(["sudo", "systemctl", "restart", "nikko-music-player.service"], timeout=30)
            return True, {"ok": True}
        if command_key == "reboot":
            reboot()
            return True, {"ok": True, "message": "Reboot initiated"}
        return False, {"error": f"Unknown command: {command_key}"}
    except Exception as e:
        logger.exception("Command %s failed", command_key)
        return False, {"error": str(e)}


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        logger.info("Connected to MQTT broker %s:%s", MQTT_BROKER, MQTT_PORT)
        client.subscribe(CMD_TOPIC, qos=1)
        logger.info("Subscribed to %s", CMD_TOPIC)
    else:
        logger.error("MQTT connect failed with code %s", rc)


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except Exception as e:
        logger.error("Invalid JSON in command: %s", e)
        return

    request_id = payload.get("requestId", str(uuid.uuid4()))
    command_key = payload.get("commandKey")
    valid, reason = verify_command(
        payload,
        store_id=MQTT_STORE_ID,
        secret=MQTT_COMMAND_SECRET,
        max_age_seconds=MQTT_COMMAND_MAX_AGE_SECONDS,
    )
    if not valid or not _claim_request(request_id):
        reason = reason or "Replayed requestId"
        logger.warning("Rejected MQTT command requestId=%s: %s", request_id, reason)
        audit("mqtt", "reject_command", {"request_id": request_id, "reason": reason})
        return

    allowed, allow_reason = verify_command_allowed(payload)
    if not allowed:
        logger.warning(
            "Rejected unauthorized MQTT command requestId=%s: %s", request_id, allow_reason
        )
        audit("mqtt", "reject_command", {"request_id": request_id, "reason": allow_reason})
        return

    logger.info("Received command: %s (requestId=%s) on %s", command_key, request_id, msg.topic)

    if command_key in {"reboot", "restart_player", "sync"}:
        audit("mqtt", "dangerous_command", {"command": command_key, "request_id": request_id})

    ok, result = handle_command(command_key, payload)
    response = {
        "requestId": request_id,
        "storeId": MQTT_STORE_ID,
        "ok": ok,
        "resultJson": encode_result(result),
        "error": result.get("error") if isinstance(result, dict) else None,
        "timestamp": int(time.time()),
    }
    response["signature"] = sign_response(response, MQTT_COMMAND_SECRET)
    logger.info("Sending response for %s: ok=%s error=%s", command_key, ok, response.get("error"))
    publish(client, RESP_TOPIC, response)


def on_disconnect(client, userdata, rc, properties=None):
    if rc == 0:
        logger.info("Disconnected from broker (clean disconnect)")
    else:
        logger.warning("Disconnected from broker (rc=%s). Auto-reconnect enabled.", rc)


def publish_status(client):
    try:
        ok, dashboard = handle_command("status_dashboard")
        status = {
            "storeId": MQTT_STORE_ID,
            "online": True,
            "system": build_system_info() if ok else {},
            "player": mpv.get_status(),
            "dashboard": dashboard if ok else {},
            "timestamp": int(time.time()),
        }
        msg = json.dumps(status)
        client.publish(STATUS_TOPIC, msg, qos=1, retain=True)
    except Exception as e:
        logger.error("Failed to publish status: %s", e)


def status_loop(client):
    while True:
        time.sleep(30)
        if client.is_connected():
            publish_status(client)


def main():
    if not MQTT_STORE_ID:
        logger.error("NIKKO_MQTT_STORE_ID is not set. Exiting.")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("NikkoMusicHub MQTT Agent starting")
    logger.info("Store ID: %s", MQTT_STORE_ID)
    logger.info("Broker:   %s:%s", MQTT_BROKER, MQTT_PORT)
    logger.info("Username: %s", MQTT_USERNAME or "(none)")
    logger.info("CMD topic:    %s", CMD_TOPIC)
    logger.info("RESP topic:   %s", RESP_TOPIC)
    logger.info("STATUS topic: %s", STATUS_TOPIC)
    logger.info("=" * 60)

    device_id = get_setting("device_id", "") or "pi"
    random_suffix = uuid.uuid4().hex[:8]
    client_id = f"nikko-{MQTT_STORE_ID}-{device_id}-{random_suffix}"

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
    )

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
    if MQTT_TLS:
        if MQTT_CA_PATH:
            tls_context = ssl.create_default_context(cafile=MQTT_CA_PATH)
            # EMQX's private Root CA predates Authority Key Identifier; keep
            # certificate-chain verification while relaxing only X509 strict mode.
            if hasattr(ssl, "VERIFY_X509_STRICT"):
                tls_context.verify_flags &= ~ssl.VERIFY_X509_STRICT
            # The private broker certificate has no SAN; its dedicated CA and pinned IP
            # still authenticate the endpoint without relying on public DNS.
            tls_context.check_hostname = False
            client.tls_set_context(tls_context)
        else:
            client.tls_set()

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    # Enable automatic reconnect with exponential backoff
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    # Start status publisher thread
    threading.Thread(target=status_loop, args=(client,), daemon=True).start()

    logger.info("Connecting to %s:%s as %s", MQTT_BROKER, MQTT_PORT, MQTT_STORE_ID)
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:
        logger.error("Initial connect failed: %s", e)
        # With Restart=always systemd will restart us; exit non-zero to trigger it
        sys.exit(1)

    client.loop_forever()


if __name__ == "__main__":
    main()
