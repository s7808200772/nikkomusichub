"""End-to-end MQTT signature verification against a running Pi agent."""
from __future__ import annotations

import json
import os
import threading
import time
import uuid

import paho.mqtt.client as mqtt

from app.db import get_db
from app.services.mqtt_auth import command_message, sign_message, verify_response


def main() -> int:
    secret = os.environ["NIKKO_MQTT_COMMAND_SECRET"]
    prefix = os.environ["NIKKO_MQTT_TOPIC_PREFIX"]
    store_id = os.environ.get("NIKKO_MQTT_STORE_ID", "store-001")
    broker = os.environ.get("NIKKO_MQTT_BROKER", "broker.hivemq.com")
    port = int(os.environ.get("NIKKO_MQTT_PORT", "8883"))
    request_id = str(uuid.uuid4())
    command = {
        "requestId": request_id,
        "commandKey": "status_player",
        "timestamp": int(time.time() * 1000),
        "nonce": str(uuid.uuid4()),
    }
    command["signature"] = sign_message(secret, command_message(command, store_id))
    response_topic = f"{prefix}/{store_id}/resp"
    command_topic = f"{prefix}/{store_id}/cmd"
    completed = threading.Event()
    result = {"ok": False, "error": "Timed out", "unsigned_rejected": False}
    unsigned_request_id = str(uuid.uuid4())

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            result["error"] = f"Connect failed: {reason_code}"
            completed.set()
            return
        client.subscribe(response_topic, qos=1)
        client.publish(command_topic, json.dumps(command), qos=1)

    def on_message(client, userdata, message):
        payload = json.loads(message.payload.decode("utf-8"))
        if payload.get("requestId") != request_id:
            if payload.get("requestId") == unsigned_request_id:
                result["error"] = "Unsigned command received a response"
                completed.set()
            return
        result["ok"] = payload.get("ok") is True and verify_response(payload, secret)
        result["error"] = "" if result["ok"] else "Invalid signed response"
        completed.set()

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"nikko-security-check-{request_id}",
    )
    if os.environ.get("NIKKO_MQTT_TLS", "1") not in ("0", "false", "no"):
        client.tls_set()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(broker, port, keepalive=30)
    client.loop_start()
    completed.wait(15)
    if result["ok"]:
        client.publish(
            command_topic,
            json.dumps(
                {
                    "requestId": unsigned_request_id,
                    "commandKey": "reboot",
                    "timestamp": int(time.time() * 1000),
                }
            ),
            qos=1,
        )
        time.sleep(2)
        conn = get_db()
        row = conn.execute(
            "SELECT details FROM audit_log WHERE action = 'reject_command' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        conn.close()
        result["unsigned_rejected"] = bool(row and unsigned_request_id in row["details"])
        if not result["unsigned_rejected"]:
            result["ok"] = False
            result["error"] = "Unsigned command rejection was not audited"

    client.disconnect()
    client.loop_stop()
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
