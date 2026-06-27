"""Authentication helpers for MQTT command and response messages."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from collections.abc import Mapping


def _stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _result_digest(result) -> str:
    return hashlib.sha256(_stable_json(result).encode("utf-8")).hexdigest()


def command_message(payload: Mapping, store_id: str) -> str:
    return "\n".join(
        (
            str(payload.get("requestId", "")),
            store_id,
            str(payload.get("commandKey", "")),
            str(payload.get("timestamp", "")),
            str(payload.get("nonce", "")),
        )
    )


def response_message(payload: Mapping) -> str:
    return "\n".join(
        (
            str(payload.get("requestId", "")),
            str(payload.get("storeId", "")),
            str(payload.get("timestamp", "")),
            "1" if payload.get("ok") is True else "0",
            _result_digest(payload.get("result")),
        )
    )


def sign_message(secret: str, message: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def sign_response(payload: Mapping, secret: str) -> str:
    return sign_message(secret, response_message(payload))


def verify_response(payload: Mapping, secret: str) -> bool:
    if not secret or not payload.get("signature"):
        return False
    return hmac.compare_digest(sign_response(payload, secret), str(payload["signature"]))


def verify_command(
    payload: Mapping,
    *,
    store_id: str,
    secret: str,
    max_age_seconds: int = 60,
    now_ms: int | None = None,
) -> tuple[bool, str]:
    if not secret:
        return False, "MQTT command secret is not configured"

    required = ("requestId", "commandKey", "timestamp", "nonce", "signature")
    if any(not payload.get(key) for key in required):
        return False, "Missing signed command fields"

    try:
        timestamp = int(payload["timestamp"])
    except (TypeError, ValueError):
        return False, "Invalid command timestamp"

    current = int(time.time() * 1000) if now_ms is None else now_ms
    age = current - timestamp
    if age < -10_000 or age > max_age_seconds * 1000:
        return False, "Command timestamp expired"

    expected = sign_message(secret, command_message(payload, store_id))
    if not hmac.compare_digest(expected, str(payload["signature"])):
        return False, "Invalid command signature"
    return True, ""
