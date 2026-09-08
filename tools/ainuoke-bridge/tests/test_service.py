from __future__ import annotations

import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ainuoke_bridge.ainuoke_client import AuthExpiredError, InvalidCredentialError, ReportPage  # noqa: E402
from ainuoke_bridge.credential_store import KeyringCredentialStore, MemoryCredentialStore, PersonalCredential  # noqa: E402
from ainuoke_bridge.service import AinuokeBridgeService  # noqa: E402
from ainuoke_bridge.session_store import AinuokeTokenCache  # noqa: E402


class FakeClient:
    def __init__(self) -> None:
        self.login_calls: list[tuple[str, str]] = []
        self.read_tokens: list[str] = []
        self.login_results: list[object] = []
        self.read_results: list[object] = []

    def login(self, username: str, password: str) -> str:
        self.login_calls.append((username, password))
        result = self.login_results.pop(0) if self.login_results else f"jwt-{username}"
        if isinstance(result, Exception):
            raise result
        return str(result)

    def read_report(self, _definition, *, jwt_token: str, page: int, page_size: int, query_context):
        self.read_tokens.append(jwt_token)
        result = self.read_results.pop(0) if self.read_results else ReportPage(rows=[{"id": 1}], total=1)
        if isinstance(result, Exception):
            raise result
        return result


class PersonalAccountServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.credentials = MemoryCredentialStore()
        self.tokens = AinuokeTokenCache()
        self.client = FakeClient()
        self.service = AinuokeBridgeService(credentials=self.credentials, token_cache=self.tokens, client=self.client, clock=lambda: "2026-09-08T00:00:00Z")

    def test_user_credentials_and_tokens_are_isolated(self) -> None:
        self.service.put_account("user-a", "alice", "credential-a")
        self.service.put_account("user-b", "bob", "credential-b")
        self.assertEqual(self.credentials.get("user-a").username, "alice")  # type: ignore[union-attr]
        self.assertEqual(self.credentials.get("user-b").username, "bob")  # type: ignore[union-attr]
        self.assertEqual(self.tokens.get("user-a").jwt_token, "jwt-alice")  # type: ignore[union-attr]
        self.assertEqual(self.tokens.get("user-b").jwt_token, "jwt-bob")  # type: ignore[union-attr]

    def test_public_account_never_returns_password_token_or_session(self) -> None:
        self.service.put_account("user-a", "alice", "credential-secret")
        encoded = json.dumps(self.service.get_account("user-a"))
        self.assertNotIn("credential-secret", encoded)
        self.assertNotIn("jwt-alice", encoded)
        self.assertNotRegex(encoded.lower(), r'password|token|session')

    def test_failed_new_credential_does_not_replace_old_credential(self) -> None:
        old = PersonalCredential(username="alice", password="old-secret")
        self.credentials.set("user-a", old)
        self.client.login_results = [InvalidCredentialError("invalid_credential")]
        with self.assertRaises(InvalidCredentialError):
            self.service.put_account("user-a", "new-alice", "wrong-secret")
        self.assertEqual(self.credentials.get("user-a"), old)

    def test_unbind_removes_credential_and_token(self) -> None:
        self.service.put_account("user-a", "alice", "credential-secret")
        self.service.delete_account("user-a")
        self.assertIsNone(self.credentials.get("user-a"))
        self.assertIsNone(self.tokens.get("user-a"))

    def test_auth_expiry_relogs_once_and_replays_read_once(self) -> None:
        self.service.put_account("user-a", "alice", "credential-secret")
        self.client.read_results = [AuthExpiredError("auth_expired"), ReportPage(rows=[{"id": 2}], total=1)]
        snapshot = self.service.read_report("user-a", report_key="sales_contracts", page=1, page_size=50, query_context={})
        self.assertEqual(len(self.client.login_calls), 2)
        self.assertEqual(len(self.client.read_tokens), 2)
        self.assertEqual(snapshot.rows[0].values["id"], 2)

    def test_second_auth_expiry_stops(self) -> None:
        self.service.put_account("user-a", "alice", "credential-secret")
        self.client.read_results = [AuthExpiredError("auth_expired"), AuthExpiredError("auth_expired")]
        with self.assertRaises(AuthExpiredError):
            self.service.read_report("user-a", report_key="sales_contracts", page=1, page_size=50, query_context={})
        self.assertEqual(len(self.client.login_calls), 2)
        self.assertEqual(len(self.client.read_tokens), 2)

    def test_process_restart_does_not_restore_token(self) -> None:
        self.service.put_account("user-a", "alice", "credential-secret")
        restarted = AinuokeBridgeService(credentials=self.credentials, token_cache=AinuokeTokenCache(), client=self.client, clock=lambda: "2026-09-08T00:00:01Z")
        restarted.read_report("user-a", report_key="sales_contracts", page=1, page_size=50, query_context={})
        self.assertEqual(len(self.client.login_calls), 2)

    def test_candidate_connection_test_does_not_persist_new_credential(self) -> None:
        old = PersonalCredential(username="alice", password="old-secret")
        self.credentials.set("user-a", old)
        result = self.service.test_account("user-a", "candidate", "candidate-secret")
        self.assertEqual(result["username"], "candidate")
        self.assertEqual(self.credentials.get("user-a"), old)


class FakeKeyring:
    class errors:
        class PasswordDeleteError(Exception):
            pass

    def __init__(self) -> None:
        self.records: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, user_id: str):
        return self.records.get((service, user_id))

    def set_password(self, service: str, user_id: str, value: str):
        self.records[(service, user_id)] = value

    def delete_password(self, service: str, user_id: str):
        if self.records.pop((service, user_id), None) is None:
            raise self.errors.PasswordDeleteError


class KeyringCredentialStoreTests(unittest.TestCase):
    def test_keyring_records_are_scoped_by_zhixu_user_id(self) -> None:
        keyring = FakeKeyring()
        store = KeyringCredentialStore(keyring)
        store.set("user-a", PersonalCredential("alice", "secret-a"))
        store.set("user-b", PersonalCredential("bob", "secret-b"))
        self.assertEqual(store.get("user-a").password, "secret-a")  # type: ignore[union-attr]
        self.assertEqual(store.get("user-b").password, "secret-b")  # type: ignore[union-attr]


if __name__ == "__main__":
    unittest.main()
