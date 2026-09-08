from __future__ import annotations

from dataclasses import dataclass
from ipaddress import ip_address
from typing import Any, Mapping


DEFAULT_ALLOWED_ORIGINS = frozenset(
    {
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    }
)

FORBIDDEN_SECRET_FIELDS = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "token",
        "jwttoken",
        "jwt_token",
        "authorization",
        "cookie",
        "session",
        "sessionid",
        "session_id",
    }
)


class SecurityContractError(ValueError):
    """Raised when a bridge boundary violates the local security contract."""


def require_loopback_host(host: str) -> str:
    candidate = host.strip().strip("[]")
    try:
        address = ip_address(candidate)
    except ValueError as error:
        raise SecurityContractError("bridge host must be a literal loopback address") from error
    if str(address) not in {"127.0.0.1", "::1"}:
        raise SecurityContractError("bridge may bind only to 127.0.0.1 or ::1")
    return host


def require_allowed_origin(origin: str | None, allowed_origins: frozenset[str] = DEFAULT_ALLOWED_ORIGINS) -> str:
    if not origin or origin not in allowed_origins:
        raise SecurityContractError("origin_not_allowed")
    return origin


def _normalized_key(value: object) -> str:
    return str(value).replace("-", "").replace("_", "").lower()


def contains_secret_field(value: Any) -> bool:
    if isinstance(value, Mapping):
        for key, child in value.items():
            if _normalized_key(key) in {_normalized_key(item) for item in FORBIDDEN_SECRET_FIELDS}:
                return True
            if contains_secret_field(child):
                return True
    elif isinstance(value, (list, tuple)):
        return any(contains_secret_field(item) for item in value)
    return False


def sanitize_mapping(value: Mapping[str, Any]) -> dict[str, Any]:
    forbidden = {_normalized_key(item) for item in FORBIDDEN_SECRET_FIELDS}
    result: dict[str, Any] = {}
    for key, child in value.items():
        if _normalized_key(key) in forbidden:
            continue
        result[str(key)] = _sanitize_value(child)
    return result


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return sanitize_mapping(value)
    if isinstance(value, (list, tuple)):
        return [_sanitize_value(item) for item in value]
    return value


@dataclass(frozen=True)
class SecurityContract:
    bind_host: str
    allowed_origins: frozenset[str] = DEFAULT_ALLOWED_ORIGINS

    def __post_init__(self) -> None:
        require_loopback_host(self.bind_host)
        if not self.allowed_origins or "*" in self.allowed_origins:
            raise SecurityContractError("an explicit non-wildcard origin allowlist is required")

    def allow_origin(self, origin: str | None) -> str:
        return require_allowed_origin(origin, self.allowed_origins)
