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


def _apply_priority(priority: str) -> list:
    """Apply ethernet/wifi priority via nmcli and return a list of warnings."""
    warnings = []
    if not command_exists("nmcli"):
        return ["系統未安裝 nmcli，無法套用網路優先順序。"]

    # List active connection profiles by type.
    res = run(["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"], timeout=15)
    if not res.get("ok"):
        return [f"無法取得網路連線列表：{res.get('stderr', '未知錯誤')}"]

    eth_metric = "100" if priority == "ethernet" else "200"
    wifi_metric = "100" if priority == "wifi" else "200"
    eth_auto = "100" if priority == "ethernet" else "0"
    wifi_auto = "100" if priority == "wifi" else "0"

    found_eth = False
    found_wifi = False
    for line in res.get("stdout", "").splitlines():
        if ":" not in line:
            continue
        name, conn_type = line.split(":", 1)
        name = name.strip()
        conn_type = conn_type.strip().lower()
        if "ethernet" in conn_type:
            found_eth = True
            for cmd in [
                ["sudo", "nmcli", "connection", "modify", name, "ipv4.route-metric", eth_metric],
                ["sudo", "nmcli", "connection", "modify", name, "ipv6.route-metric", eth_metric],
                ["sudo", "nmcli", "connection", "modify", name, "connection.autoconnect-priority", eth_auto],
            ]:
                r = run(cmd, timeout=10)
                if not r.get("ok"):
                    warnings.append(f"乙太網路優先順序設定失敗（{name}）：{r.get('stderr', '未知錯誤')}")
        elif "wireless" in conn_type or "wifi" in conn_type:
            found_wifi = True
            for cmd in [
                ["sudo", "nmcli", "connection", "modify", name, "ipv4.route-metric", wifi_metric],
                ["sudo", "nmcli", "connection", "modify", name, "ipv6.route-metric", wifi_metric],
                ["sudo", "nmcli", "connection", "modify", name, "connection.autoconnect-priority", wifi_auto],
            ]:
                r = run(cmd, timeout=10)
                if not r.get("ok"):
                    warnings.append(f"WiFi 優先順序設定失敗（{name}）：{r.get('stderr', '未知錯誤')}")

    if priority == "ethernet" and not found_eth:
        warnings.append("未偵測到乙太網路連線，優先順序設定可能不生效。")
    if priority == "wifi" and not found_wifi:
        warnings.append("未偵測到 WiFi 連線，優先順序設定可能不生效。")
    return warnings


@router.get("/api/settings/network")
async def get_network_settings(request: Request):
    get_current_user_or_local(request)
    return _current_settings()


@router.post("/api/settings/network/test")
async def test_network_settings(
    request: Request,
    wifi_ssid: str = Form(""),
    wifi_password: str = Form(""),
    network_priority: str = Form(DEFAULT_NETWORK_PRIORITY),
):
    """Validate WiFi / network settings without applying them."""
    get_current_user_or_local(request)
    priority = network_priority if network_priority in ("ethernet", "wifi") else DEFAULT_NETWORK_PRIORITY

    if not command_exists("nmcli"):
        return {"ok": False, "error": "系統未安裝 nmcli，無法測試網路設定。"}

    # Verify we can read NetworkManager connections.
    res = run(["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"], timeout=15)
    if not res.get("ok"):
        return {"ok": False, "error": f"無法讀取網路連線：{res.get('stderr', '未知錯誤')}"}

    # Check requested priority has a matching connection profile.
    has_eth = any("ethernet" in line.split(":", 1)[1].strip().lower() for line in res.get("stdout", "").splitlines() if ":" in line)
    has_wifi = any(
        ("wireless" in line.split(":", 1)[1].strip().lower() or "wifi" in line.split(":", 1)[1].strip().lower())
        for line in res.get("stdout", "").splitlines() if ":" in line
    )
    if priority == "ethernet" and not has_eth:
        return {"ok": False, "error": "選擇優先使用乙太網路，但系統未偵測到乙太網路連線。"}
    if priority == "wifi" and not has_wifi:
        return {"ok": False, "error": "選擇優先使用 WiFi，但系統未偵測到 WiFi 連線。"}

    # If a WiFi SSID is provided, try to confirm it is visible.
    if wifi_ssid:
        scan = run(["nmcli", "-t", "-f", "SSID,ACTIVE", "device", "wifi", "list", "--rescan", "no"], timeout=15)
        if scan.get("ok"):
            visible = {
                line.split(":", 1)[0].strip()
                for line in scan.get("stdout", "").splitlines()
                if ":" in line
            }
            if wifi_ssid not in visible:
                return {"ok": False, "error": f"目前掃描不到 WiFi SSID「{wifi_ssid}」，請確認名稱正確或靠近路由器。"}
        else:
            return {"ok": False, "error": f"無法掃描 WiFi：{scan.get('stderr', '未知錯誤')}"}

    return {"ok": True, "message": "網路設定測試通過，可以儲存並套用。"}


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

    warnings = []
    if changed:
        try:
            warnings = _apply_priority(priority)
        except Exception as e:
            warnings = [f"設定已儲存，但套用網路優先順序失敗：{e}"]

    warning = None
    if warnings:
        warning = "設定已儲存，但套用網路優先順序時發生問題：\n" + "\n".join(f"• {w}" for w in warnings)

    audit(user, "save_network_settings", {
        "changed": changed,
        "priority": priority,
        "warning": warning,
    })

    if warning:
        return {"ok": True, "warning": warning}
    return {"ok": True}
