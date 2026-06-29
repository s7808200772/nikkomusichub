"""Network settings (WiFi / priority) routes."""
from fastapi import APIRouter, Form, Request

from app.db import audit, get_setting, set_setting
from app.routes.auth import get_current_user_or_local
from app.services.system import command_exists, run

router = APIRouter()

DEFAULT_NETWORK_PRIORITY = "ethernet"


def _current_settings():
    return {
        "wifi_ssid": get_setting("wifi_ssid", ""),
        "wifi_password": get_setting("wifi_password", ""),
        "network_priority": get_setting("network_priority", DEFAULT_NETWORK_PRIORITY),
    }


def _apply_priority(priority: str) -> None:
    """Try to apply ethernet/wifi priority via nmcli. Failures are ignored."""
    if not command_exists("nmcli"):
        return

    # List active connection profiles by type.
    res = run(["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"], timeout=15)
    if not res.get("ok"):
        return

    eth_metric = "100" if priority == "ethernet" else "200"
    wifi_metric = "100" if priority == "wifi" else "200"
    eth_auto = "100" if priority == "ethernet" else "0"
    wifi_auto = "100" if priority == "wifi" else "0"

    for line in res.get("stdout", "").splitlines():
        if ":" not in line:
            continue
        name, conn_type = line.split(":", 1)
        name = name.strip()
        conn_type = conn_type.strip().lower()
        if "ethernet" in conn_type:
            run(["nmcli", "connection", "modify", name, "ipv4.route-metric", eth_metric], timeout=10)
            run(["nmcli", "connection", "modify", name, "ipv6.route-metric", eth_metric], timeout=10)
            run(["nmcli", "connection", "modify", name, "connection.autoconnect-priority", eth_auto], timeout=10)
        elif "wireless" in conn_type or "wifi" in conn_type:
            run(["nmcli", "connection", "modify", name, "ipv4.route-metric", wifi_metric], timeout=10)
            run(["nmcli", "connection", "modify", name, "ipv6.route-metric", wifi_metric], timeout=10)
            run(["nmcli", "connection", "modify", name, "connection.autoconnect-priority", wifi_auto], timeout=10)


@router.get("/api/settings/network")
async def get_network_settings(request: Request):
    get_current_user_or_local(request)
    return _current_settings()


@router.post("/api/settings/network")
async def save_network_settings(
    request: Request,
    wifi_ssid: str = Form(""),
    wifi_password: str = Form(""),
    network_priority: str = Form(DEFAULT_NETWORK_PRIORITY),
):
    user = get_current_user_or_local(request)
    current = _current_settings()
    priority = network_priority if network_priority in ("ethernet", "wifi") else DEFAULT_NETWORK_PRIORITY

    set_setting("wifi_ssid", wifi_ssid)
    set_setting("wifi_password", wifi_password)
    set_setting("network_priority", priority)

    changed = (
        current["wifi_ssid"] != wifi_ssid
        or current["wifi_password"] != wifi_password
        or current["network_priority"] != priority
    )

    warning = None
    if changed:
        try:
            _apply_priority(priority)
        except Exception as e:
            warning = f"設定已儲存，但套用網路優先順序失敗：{e}"

    audit(user, "save_network_settings", {
        "changed": changed,
        "priority": priority,
        "warning": warning,
    })

    if warning:
        return {"ok": True, "warning": warning}
    return {"ok": True}
