"""Verify private MQTT TLS, valid credentials, and anonymous rejection."""
from __future__ import annotations

import json
import secrets
import ssl
import threading

import paho.mqtt.client as mqtt

from app.config import (
    MQTT_BROKER,
    MQTT_CA_PATH,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USERNAME,
)


def _tls_context() -> ssl.SSLContext:
    context = ssl.create_default_context(cafile=MQTT_CA_PATH or None)
    if MQTT_CA_PATH:
        if hasattr(ssl, "VERIFY_X509_STRICT"):
            context.verify_flags &= ~ssl.VERIFY_X509_STRICT
        context.check_hostname = False
    return context


def try_connect(username: str = "", password: str = "") -> tuple[bool, str]:
    event = threading.Event()
    state = {"ok": False, "reason": "timeout"}
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"nikko-auth-check-{secrets.token_hex(6)}",
    )
    client.tls_set_context(_tls_context())
    if username:
        client.username_pw_set(username, password)

    def on_connect(_client, _userdata, _flags, reason_code, _properties):
        state["ok"] = not reason_code.is_failure
        state["reason"] = str(reason_code)
        event.set()

    def on_connect_fail(_client, _userdata):
        state["reason"] = "connect failed"
        event.set()

    client.on_connect = on_connect
    client.on_connect_fail = on_connect_fail
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, keepalive=15)
        client.loop_start()
        event.wait(10)
    except Exception as exc:
        state["reason"] = type(exc).__name__
    finally:
        try:
            client.disconnect()
        except Exception:
            pass
        client.loop_stop()
    return bool(state["ok"]), str(state["reason"])


def main() -> int:
    valid_ok, valid_reason = try_connect(MQTT_USERNAME, MQTT_PASSWORD)
    anonymous_ok, anonymous_reason = try_connect()
    invalid_ok, invalid_reason = try_connect(
        "invalid-user", secrets.token_urlsafe(24)
    )
    result = {
        "ok": valid_ok and not anonymous_ok and not invalid_ok,
        "valid_credentials": valid_ok,
        "valid_reason": valid_reason,
        "anonymous_rejected": not anonymous_ok,
        "anonymous_reason": anonymous_reason,
        "invalid_rejected": not invalid_ok,
        "invalid_reason": invalid_reason,
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())