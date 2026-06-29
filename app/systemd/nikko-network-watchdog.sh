#!/usr/bin/env bash
# Network watchdog for NikkoMusicHub Pi devices.
# Checks gateway, external IP, and DNS every minute.
# Escalates recovery: NetworkManager -> tailscaled -> reboot (with cooldown).

set -uo pipefail

STATE_DIR="/var/lib/nikko-watchdog"
FAIL_COUNT_FILE="${STATE_DIR}/fail_count"
LAST_REBOOT_FILE="${STATE_DIR}/last_reboot"
LAST_ACTION_FILE="${STATE_DIR}/last_action"
LOG_TAG="nikko-network-watchdog"

# Configurable defaults
CONFIG_FILE="/etc/nikko-watchdog.conf"
if [[ -f "${CONFIG_FILE}" ]]; then
    # shellcheck source=/dev/null
    source "${CONFIG_FILE}"
fi

PING_TARGET="${PING_TARGET:-8.8.8.8}"
REBOOT_COOLDOWN_SECONDS="${REBOOT_COOLDOWN_SECONDS:-1800}"
MAX_FAIL_BEFORE_NETWORKMANAGER="${MAX_FAIL_BEFORE_NETWORKMANAGER:-3}"
MAX_FAIL_BEFORE_TAILSCALED="${MAX_FAIL_BEFORE_TAILSCALED:-5}"
MAX_FAIL_BEFORE_REBOOT="${MAX_FAIL_BEFORE_REBOOT:-8}"

mkdir -p "${STATE_DIR}"

read_int() {
    local file="$1"
    if [[ -f "${file}" ]]; then
        local v
        v="$(cat "${file}" 2>/dev/null | tr -dc '0-9' || true)"
        [[ -n "${v}" ]] && echo "${v}" || echo 0
    else
        echo 0
    fi
}

write_int() {
    local file="$1"
    local value="$2"
    echo "${value}" > "${file}"
}

write_action() {
    local msg="$1"
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "${msg}" > "${LAST_ACTION_FILE}"
    logger -t "${LOG_TAG}" "${msg}"
}

get_gateway() {
    local gw
    gw="$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')"
    if [[ -z "${gw}" ]]; then
        gw="$(route -n 2>/dev/null | awk '/^0\.0\.0\.0/ {print $2; exit}')"
    fi
    echo "${gw}"
}

ping_host() {
    local host="$1"
    ping -c 1 -W 3 "${host}" >/dev/null 2>&1
}

check_dns() {
    local host="$1"
    if command -v getent >/dev/null 2>&1; then
        getent ahosts "${host}" >/dev/null 2>&1 && return 0
    fi
    if command -v nslookup >/dev/null 2>&1; then
        nslookup "${host}" >/dev/null 2>&1 && return 0
    fi
    if command -v host >/dev/null 2>&1; then
        host "${host}" >/dev/null 2>&1 && return 0
    fi
    if command -v dig >/dev/null 2>&1; then
        dig +short "${host}" >/dev/null 2>&1 && return 0
    fi
    return 1
}

restart_network_manager() {
    write_action "Attempting to restart network manager (fail_count=${fail_count})"
    if systemctl is-active --quiet NetworkManager 2>/dev/null || systemctl is-enabled --quiet NetworkManager 2>/dev/null; then
        if systemctl restart NetworkManager 2>/dev/null; then
            write_action "NetworkManager restarted successfully"
            return 0
        else
            write_action "Failed to restart NetworkManager"
        fi
    fi
    if systemctl is-active --quiet dhcpcd 2>/dev/null || systemctl is-enabled --quiet dhcpcd 2>/dev/null; then
        if systemctl restart dhcpcd 2>/dev/null; then
            write_action "dhcpcd restarted successfully"
            return 0
        else
            write_action "Failed to restart dhcpcd"
        fi
    fi
    if systemctl is-active --quiet networking 2>/dev/null || systemctl is-enabled --quiet networking 2>/dev/null; then
        if systemctl restart networking 2>/dev/null; then
            write_action "networking service restarted successfully"
            return 0
        else
            write_action "Failed to restart networking service"
        fi
    fi
    write_action "No supported network manager service found (NetworkManager/dhcpcd/networking)"
    return 1
}

restart_tailscaled() {
    write_action "Attempting to restart tailscaled (fail_count=${fail_count})"
    if systemctl is-active --quiet tailscaled 2>/dev/null || systemctl is-enabled --quiet tailscaled 2>/dev/null; then
        if systemctl restart tailscaled 2>/dev/null; then
            write_action "tailscaled restarted successfully"
            return 0
        else
            write_action "Failed to restart tailscaled"
        fi
    else
        write_action "tailscaled service not found"
    fi
    return 1
}

should_reboot() {
    if [[ -f "${LAST_REBOOT_FILE}" ]]; then
        local last_reboot_ts now_ts delta
        last_reboot_ts="$(stat -c %Y "${LAST_REBOOT_FILE}" 2>/dev/null || echo 0)"
        now_ts="$(date +%s)"
        delta=$((now_ts - last_reboot_ts))
        if [[ ${delta} -lt ${REBOOT_COOLDOWN_SECONDS} ]]; then
            return 1
        fi
    fi
    return 0
}

do_reboot() {
    write_action "Network failed ${fail_count} times, initiating reboot"
    date +%s > "${LAST_REBOOT_FILE}"
    sync
    # Give logger time to flush before reboot.
    sleep 2
    systemctl reboot
}

# Main check
fail_count="$(read_int "${FAIL_COUNT_FILE}")"
gateway="$(get_gateway)"

ok=true
reasons=()

if [[ -z "${gateway}" ]]; then
    ok=false
    reasons+=("default gateway missing")
fi

external_ok=false
for ext in ${PING_TARGET}; do
    if ping_host "${ext}"; then
        external_ok=true
        break
    fi
done

if [[ "${external_ok}" == false ]]; then
    ok=false
    reasons+=("external IP unreachable")
fi

dns_ok=false
for dns_host in google.com login.tailscale.com; do
    if check_dns "${dns_host}"; then
        dns_ok=true
        break
    fi
done

if [[ "${dns_ok}" == false ]]; then
    ok=false
    reasons+=("DNS resolution failed")
fi

if [[ "${ok}" == true ]]; then
    if [[ "${fail_count}" -gt 0 ]]; then
        write_action "Network check ok, clearing fail_count (was ${fail_count})"
        write_int "${FAIL_COUNT_FILE}" 0
    else
        logger -t "${LOG_TAG}" "Network check ok"
    fi
    write_action "Network check ok"

    # Opportunistically restart tailscaled if it is down but should be up.
    if ! systemctl is-active --quiet tailscaled 2>/dev/null && systemctl is-enabled --quiet tailscaled 2>/dev/null; then
        write_action "tailscaled is inactive but enabled, attempting restart"
        systemctl restart tailscaled 2>/dev/null || write_action "Failed to restart tailscaled"
    fi
    exit 0
fi

fail_count=$((fail_count + 1))
write_int "${FAIL_COUNT_FILE}" "${fail_count}"
reason_str="${reasons[*]}"
write_action "Network check failed, count=${fail_count}, reasons: ${reason_str}"

if [[ ${fail_count} -eq ${MAX_FAIL_BEFORE_NETWORKMANAGER} ]]; then
    restart_network_manager
elif [[ ${fail_count} -eq ${MAX_FAIL_BEFORE_TAILSCALED} ]]; then
    restart_tailscaled
elif [[ ${fail_count} -ge ${MAX_FAIL_BEFORE_REBOOT} ]]; then
    if should_reboot; then
        do_reboot
    else
        write_action "Reboot skipped due to cooldown (fail_count=${fail_count})"
    fi
fi
