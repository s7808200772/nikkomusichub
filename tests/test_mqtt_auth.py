import unittest

from app.services.mqtt_auth import (
    command_message,
    sign_message,
    sign_response,
    verify_command,
    verify_response,
)


class MqttAuthTests(unittest.TestCase):
    secret = "test-secret-123"
    command = {
        "requestId": "req-123",
        "commandKey": "status_dashboard",
        "timestamp": 1782595000000,
        "nonce": "nonce-456",
    }

    def test_command_signature_matches_cross_language_vector(self):
        signature = sign_message(
            self.secret, command_message(self.command, "store-001")
        )
        self.assertEqual(
            signature,
            "6b75f2521a116d4665daabb321bdcd753634568460a18caffdc4898c3673e97e",
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
            "result": {"b": 2, "a": ["x", 1]},
        }
        self.assertEqual(
            sign_response(response, self.secret),
            "beb5b24a5bbefb8c7561425c93939e8ceff13e969c919435c0cd319af31ca6b1",
        )
        response["signature"] = sign_response(response, self.secret)
        self.assertTrue(verify_response(response, self.secret))
        response["result"]["b"] = 3
        self.assertFalse(verify_response(response, self.secret))


if __name__ == "__main__":
    unittest.main()
