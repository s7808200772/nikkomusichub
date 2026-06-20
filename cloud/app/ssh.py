"""SSH connection helpers for managing remote Pi nodes."""
import io
import json

import paramiko

from cloud.app.config import REMOTE_COMMANDS, SSH_TIMEOUT
from cloud.app.db import get_store


def build_cmd_with_key(cmd_template: str, local_api_key: str) -> str:
    """Inject the local API key header into curl commands."""
    if cmd_template.startswith("curl") and "localhost:8080" in cmd_template:
        # Insert header after 'curl' and before the rest
        parts = cmd_template.split(" ", 1)
        return f"{parts[0]} -s -H 'X-Nikko-Local-Key: {local_api_key}' {parts[1]}"
    return cmd_template


def run_ssh_command(store_id: str, command_key: str) -> dict:
    """Run a whitelisted command on a remote Pi via SSH."""
    store = get_store(store_id)
    if not store:
        return {"ok": False, "error": "Store not found"}

    if command_key not in REMOTE_COMMANDS:
        return {"ok": False, "error": "Command not allowed"}

    cmd_info = REMOTE_COMMANDS[command_key]
    cmd = build_cmd_with_key(cmd_info["cmd"], store["local_api_key"])

    try:
        key = paramiko.RSAKey.from_private_key(io.StringIO(store["ssh_private_key"]))
    except Exception:
        try:
            key = paramiko.Ed25519Key.from_private_key(io.StringIO(store["ssh_private_key"]))
        except Exception as e:
            return {"ok": False, "error": f"Invalid SSH private key: {e}"}

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=store["tailscale_ip"],
            port=store["ssh_port"],
            username=store["ssh_username"],
            pkey=key,
            timeout=SSH_TIMEOUT,
            banner_timeout=SSH_TIMEOUT,
            auth_timeout=SSH_TIMEOUT,
        )
        stdin, stdout, stderr = client.exec_command(cmd, timeout=SSH_TIMEOUT)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        rc = stdout.channel.recv_exit_status()
        client.close()

        # Try to parse JSON from stdout
        parsed = None
        try:
            parsed = json.loads(out)
        except Exception:
            pass

        return {
            "ok": rc == 0,
            "returncode": rc,
            "stdout": out,
            "stderr": err,
            "parsed": parsed,
            "command_label": cmd_info["label"],
        }
    except paramiko.AuthenticationException as e:
        return {"ok": False, "error": f"SSH authentication failed: {e}"}
    except Exception as e:
        return {"ok": False, "error": f"SSH connection failed: {e}"}


def fetch_status(store_id: str) -> dict:
    """Fetch dashboard status from a remote Pi."""
    return run_ssh_command(store_id, "status_dashboard")
