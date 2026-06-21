"""MQTT client for central cloud management.

This module runs as a standalone daemon (nikko-music-mqtt.service).
It connects to the configured MQTT broker, subscribes to command topics,
and publishes responses / status updates.
"""
import json
import logging
import os
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
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_STORE_ID,
    MQTT_TOPIC_PREFIX,
    MQTT_USERNAME,
    MUSIC_DIR,
    PLAYER_LOG_PATH,
    RCLONE_CONFIG_PATH,
    SYNC_LOG_PATH,
)
from app.db import get_recent_sync_logs, get_setting
from app.services import mpv, rclone
from app.services.system import (
    command_exists,
    count_mp3_files,
    get_cpu_usage,
    get_disk_usage,
    get_hostname,
    get_ip_addresses,
    get_mpv_version,
    get_pi_model,
    get_rclone_version,
    get_ram_usage,
    get_uptime_seconds,
    reboot,
    run,
    service_enabled,
    service_status,
    tail_log,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "mqtt.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("nikko-mqtt")

CMD_TOPIC = f"{MQTT_TOPIC_PREFIX}/{MQTT_STORE_ID}/cmd"
RESP_TOPIC = f"{MQTT_TOPIC_PREFIX}/{MQTT_STORE_ID}/resp"
STATUS_TOPIC = f"{MQTT_TOPIC_PREFIX}/{MQTT_STORE_ID}/status"


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

    dropbox_ok = False
    if rclone_installed and RCLONE_CONFIG_PATH.exists():
        try:
            dropbox_ok = rclone.test_dropbox(get_setting("dropbox_remote", "dropbox")).get("ok", False)
        except Exception:
            dropbox_ok = False

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
        "dropbox_connected": dropbox_ok,
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
        "os_version": "",
        "python_version": "",
        "rclone_version": get_rclone_version(),
        "mpv_version": get_mpv_version(),
        "hostname": get_hostname(),
        "lan_ip": ips["lan_ip"],
        "tailscale_ip": ips["tailscale_ip"],
        "tailscale_up": False,
        "cpu_temp_c": 0,
        "uptime_seconds": get_uptime_seconds(),
        "disk": get_disk_usage("/"),
        "music_folder_size": 0,
        "mp3_count": count_mp3_files(MUSIC_DIR),
        "web_service_status": service_status("nikko-music-hub-web.service"),
        "player_service_status": service_status("nikko-music-player.service"),
        "sync_timer_status": service_status("nikko-music-sync.timer"),
        "mqtt_service_status": service_status("nikko-music-mqtt.service"),
        "player_service_enabled": service_enabled("nikko-music-player.service"),
    }


def handle_command(command_key):
    """Execute a command and return (ok, result)."""
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
        if command_key == "sync":
            remote = get_setting("dropbox_remote", "dropbox")
            path = get_setting("dropbox_path", "NikkoMusic")
            local = get_setting("local_music_path", str(MUSIC_DIR))
            res = rclone.sync_music(remote, path, local)
            if res.get("ok") and bool(int(get_setting("auto_restart_player", "1"))):
                if mpv.mpv_is_running():
                    mpv.reload_playlist()
                else:
                    mpv.start_player()
            return res.get("ok", False), res
        if command_key == "rescan":
            return True, mpv.reload_playlist()
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
    logger.info("Received command: %s (requestId=%s)", command_key, request_id)

    ok, result = handle_command(command_key)
    response = {
        "requestId": request_id,
        "storeId": MQTT_STORE_ID,
        "ok": ok,
        "result": result,
        "error": result.get("error") if isinstance(result, dict) else None,
        "timestamp": int(time.time()),
    }
    publish(client, RESP_TOPIC, response)


def on_disconnect(client, userdata, rc, properties=None):
    logger.warning("Disconnected from broker (rc=%s)", rc)


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
        publish(client, STATUS_TOPIC, status)
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

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"nikko-pi-{MQTT_STORE_ID}",
    )

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    # Start status publisher thread
    threading.Thread(target=status_loop, args=(client,), daemon=True).start()

    logger.info("Connecting to %s:%s as %s", MQTT_BROKER, MQTT_PORT, MQTT_STORE_ID)
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    except Exception as e:
        logger.error("Initial connect failed: %s", e)
        sys.exit(1)

    client.loop_forever()


if __name__ == "__main__":
    main()
