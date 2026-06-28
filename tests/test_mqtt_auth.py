import unittest

from app.services.mqtt_auth import (
    ALLOWED_COMMANDS,
    DANGEROUS_COMMANDS,
    command_message,
    sign_message,
    sign_response,
    verify_command,
    verify_command_allowed,
    verify_response,
)


class MqttAuthTests(unittest.TestCase):
    secret = "test-secret-123"
    command = {
        "requestId": "req-123",
        "commandKey": "status_dashboard",
        "timestamp": 1782595000000,
        "nonce": "nonce-456",
        "confirm": False,
    }

    def test_command_signature_matches_cross_language_vector(self):
        signature = sign_message(
            self.secret, command_message(self.command, "store-001")
        )
        self.assertEqual(
            signature,
            "07c010b65338b6984bd5fd6e32488b909ad67c95071d0b972005dc4c1c4e3c70",
        )

    def test_valid_command_and_tampering(self):
        payload = dict(self.command)
        payload["signature"] = sign_message(
            self.secret, command_message(payload, "store-001")
        )
        valid, reason = verify_command(
            payload,
            store_id="store-001",
            secret=self.secret,
            now_ms=1782595005000,
        )
        self.assertTrue(valid, reason)

        payload["commandKey"] = "reboot"
        valid, reason = verify_command(
            payload,
            store_id="store-001",
            secret=self.secret,
            now_ms=1782595005000,
        )
        self.assertFalse(valid)
        self.assertEqual(reason, "Invalid command signature")

    def test_expired_command_is_rejected(self):
        payload = dict(self.command)
        payload["signature"] = sign_message(
            self.secret, command_message(payload, "store-001")
        )
        valid, reason = verify_command(
            payload,
            store_id="store-001",
            secret=self.secret,
            now_ms=1782595070001,
        )
        self.assertFalse(valid)
        self.assertEqual(reason, "Command timestamp expired")

    def test_response_signature_matches_cross_language_vector(self):
        response = {
            "requestId": "req-123",
            "storeId": "store-001",
            "timestamp": 1782595001,
            "ok": True,
            "resultJson": '{"a":["x",1],"b":2}',
            "error": None,
        }
        self.assertEqual(
            sign_response(response, self.secret),
            "f3f5691c4d9758d87d3525f011d0d075842b66c667054109e8aa91cb34174129",
        )
        response["signature"] = sign_response(response, self.secret)
        self.assertTrue(verify_response(response, self.secret))
        response["resultJson"] = '{"a":["x",1],"b":3}'
        self.assertFalse(verify_response(response, self.secret))

    def test_command_whitelist(self):
        self.assertIn("status_dashboard", ALLOWED_COMMANDS)
        self.assertNotIn("evil_command", ALLOWED_COMMANDS)
        ok, reason = verify_command_allowed({"commandKey": "evil_command"})
        self.assertFalse(ok)
        self.assertIn("not allowed", reason)

    def test_dangerous_command_requires_confirmation(self):
        ok, reason = verify_command_allowed({"commandKey": "reboot", "confirm": False})
        self.assertFalse(ok)
        self.assertIn("confirmation", reason)

        ok, reason = verify_command_allowed({"commandKey": "reboot", "confirm": True})
        self.assertTrue(ok)

    def test_non_dangerous_command_does_not_require_confirmation(self):
        ok, reason = verify_command_allowed({"commandKey": "status_dashboard"})
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
