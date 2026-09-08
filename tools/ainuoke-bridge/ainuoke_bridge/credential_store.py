from __future__ import annotations

from dataclasses import asdict, dataclass
from json import dumps, loads
from typing import Protocol


@dataclass(frozen=True)
class PersonalCredential:
    username: str
    password: str
    status: str = "verified"
    last_verified_at: str | None = None
    last_successful_login_at: str | None = None
    last_error_code: str | None = None

    def public_view(self) -> dict[str, str | bool | None]:
        return {
            "username": self.username,
            "configured": True,
            "status": self.status,
            "lastVerifiedAt": self.last_verified_at,
            "lastSuccessfulLoginAt": self.last_successful_login_at,
            "lastErrorCode": self.last_error_code,
        }


UNCONFIGURED_ACCOUNT = {
    "username": None,
    "configured": False,
    "status": "not_configured",
    "lastVerifiedAt": None,
    "lastSuccessfulLoginAt": None,
    "lastErrorCode": None,
}


class CredentialStore(Protocol):
    def get(self, user_id: str) -> PersonalCredential | None: ...
    def set(self, user_id: str, credential: PersonalCredential) -> None: ...
    def delete(self, user_id: str) -> None: ...


class MemoryCredentialStore:
    """Test-only store. Production startup never selects this implementation."""

    def __init__(self) -> None:
        self._records: dict[str, PersonalCredential] = {}

    def get(self, user_id: str) -> PersonalCredential | None:
        return self._records.get(user_id)

    def set(self, user_id: str, credential: PersonalCredential) -> None:
        self._records[user_id] = credential

    def delete(self, user_id: str) -> None:
        self._records.pop(user_id, None)


class KeyringCredentialStore:
    SERVICE_NAME = "zhixu.erp.ainuoke.personal-account"

    def __init__(self, keyring_module=None) -> None:
        injected = keyring_module is not None
        if keyring_module is None:
            try:
                import keyring as keyring_module  # type: ignore[no-redef]
            except ImportError as error:
                raise RuntimeError("Python keyring is required for Windows Credential Manager") from error
        self._keyring = keyring_module
        if not injected:
            backend_name = type(self._keyring.get_keyring()).__module__ + "." + type(self._keyring.get_keyring()).__name__
            if "keyring.backends.Windows" not in backend_name:
                raise RuntimeError("Windows Credential Manager keyring backend is required")

    def get(self, user_id: str) -> PersonalCredential | None:
        raw = self._keyring.get_password(self.SERVICE_NAME, user_id)
        if raw is None:
            return None
        value = loads(raw)
        return PersonalCredential(
            username=str(value["username"]),
            password=str(value["password"]),
            status=str(value.get("status") or "verified"),
            last_verified_at=value.get("last_verified_at"),
            last_successful_login_at=value.get("last_successful_login_at"),
            last_error_code=value.get("last_error_code"),
        )

    def set(self, user_id: str, credential: PersonalCredential) -> None:
        self._keyring.set_password(self.SERVICE_NAME, user_id, dumps(asdict(credential), ensure_ascii=False))

    def delete(self, user_id: str) -> None:
        try:
            self._keyring.delete_password(self.SERVICE_NAME, user_id)
        except self._keyring.errors.PasswordDeleteError:
            pass
