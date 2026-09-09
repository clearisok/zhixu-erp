from __future__ import annotations

from dataclasses import dataclass
from secrets import token_urlsafe
from time import time


class SessionError(ValueError):
    pass


@dataclass(frozen=True)
class BrowserSession:
    session_id: str
    csrf_nonce: str
    user_id: str
    origin: str
    expires_at: float


class BrowserSessionStore:
    def __init__(self, ttl_seconds: int = 8 * 60 * 60, clock=time) -> None:
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._sessions: dict[str, BrowserSession] = {}

    def create(self, user_id: str, origin: str) -> BrowserSession:
        if not user_id.strip():
            raise SessionError("invalid_user_context")
        session = BrowserSession(
            session_id=token_urlsafe(32),
            csrf_nonce=token_urlsafe(32),
            user_id=user_id.strip(),
            origin=origin,
            expires_at=self._clock() + self._ttl_seconds,
        )
        self._sessions[session.session_id] = session
        return session

    def resolve(self, session_id: str | None, origin: str, csrf_nonce: str | None = None) -> BrowserSession:
        session = self._sessions.get(session_id or "")
        if session is None or session.expires_at <= self._clock():
            if session is not None:
                self._sessions.pop(session.session_id, None)
            raise SessionError("session_required")
        if session.origin != origin:
            raise SessionError("session_origin_mismatch")
        if csrf_nonce is not None and not _constant_time_equal(session.csrf_nonce, csrf_nonce):
            raise SessionError("csrf_invalid")
        return session

    def delete_for_user(self, user_id: str) -> None:
        for session_id in [key for key, item in self._sessions.items() if item.user_id == user_id]:
            self._sessions.pop(session_id, None)


def _constant_time_equal(left: str, right: str) -> bool:
    if len(left) != len(right):
        return False
    result = 0
    for left_char, right_char in zip(left.encode(), right.encode(), strict=True):
        result |= left_char ^ right_char
    return result == 0


@dataclass(frozen=True)
class AinuokeAuthSession:
    jwt_token: str
    session_id: str
    authenticated_at: str


class AinuokeTokenCache:
    def __init__(self) -> None:
        self._sessions: dict[str, AinuokeAuthSession] = {}

    def get(self, user_id: str) -> AinuokeAuthSession | None:
        return self._sessions.get(user_id)

    def set(self, user_id: str, session: AinuokeAuthSession) -> None:
        self._sessions[user_id] = session

    def delete(self, user_id: str) -> None:
        self._sessions.pop(user_id, None)
