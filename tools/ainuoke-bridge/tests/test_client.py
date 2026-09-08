from __future__ import annotations

import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ainuoke_bridge.ainuoke_client import AinuokeClient, InvalidCredentialError, NetworkAinuokeError  # noqa: E402


class SequenceTransport:
    def __init__(self, results: list[object]) -> None:
        self.results = results
        self.calls: list[dict[str, object]] = []

    def request(self, **arguments):
        self.calls.append(arguments)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class AinuokeClientRetryTests(unittest.TestCase):
    def test_invalid_credentials_are_not_retried(self) -> None:
        transport = SequenceTransport([{"code": "401", "message": "密码错误"}])
        client = AinuokeClient(base_url="http://ainuoke.invalid", report_path="/read", transport=transport, network_retries=4, sleeper=lambda _: None)
        with self.assertRaises(InvalidCredentialError):
            client.login("alice", "wrong")
        self.assertEqual(len(transport.calls), 1)

    def test_network_retry_is_bounded(self) -> None:
        transport = SequenceTransport([NetworkAinuokeError("network") for _ in range(3)])
        client = AinuokeClient(base_url="http://ainuoke.invalid", report_path="/read", transport=transport, network_retries=2, sleeper=lambda _: None)
        with self.assertRaises(NetworkAinuokeError):
            client.login("alice", "secret")
        self.assertEqual(len(transport.calls), 3)

    def test_login_contract_contains_required_parameters_without_logging(self) -> None:
        transport = SequenceTransport([{"data": {"jwtToken": "jwt-secret"}}])
        client = AinuokeClient(base_url="http://ainuoke.invalid", report_path="/read", transport=transport)
        self.assertEqual(client.login("alice", "credential-secret"), "jwt-secret")
        body = transport.calls[0]["body"]
        self.assertEqual(body["userName"], "alice")
        self.assertEqual(body["cltType"], 1)
        self.assertEqual(body["rememberMe"], "true")
        self.assertIn("verifyCode", body)
        self.assertIn("jsCode", body)
        self.assertIn("isCoverLogin", body)


if __name__ == "__main__":
    unittest.main()
