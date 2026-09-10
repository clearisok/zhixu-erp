from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Any, Mapping

from .ainuoke_client import AinuokeClient, AinuokeClientError, AuthExpiredError
from .contracts import ReportSnapshot, build_report_snapshot, resolve_report, validate_query_for_report
from .credential_store import CredentialStore, PersonalCredential, UNCONFIGURED_ACCOUNT
from .session_store import AinuokeAuthSession, AinuokeTokenCache


class AccountNotConfiguredError(ValueError):
    code = "account_not_configured"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AinuokeBridgeService:
    def __init__(self, *, credentials: CredentialStore, token_cache: AinuokeTokenCache, client: AinuokeClient, clock=now_iso) -> None:
        self.credentials = credentials
        self.token_cache = token_cache
        self.client = client
        self.clock = clock

    def get_account(self, user_id: str) -> dict[str, str | bool | None]:
        credential = self.credentials.get(user_id)
        return credential.public_view() if credential else dict(UNCONFIGURED_ACCOUNT)

    def put_account(self, user_id: str, username: str, password: str) -> dict[str, str | bool | None]:
        username = username.strip()
        if not username or not password:
            raise ValueError("username_and_password_required")
        login_session = self.client.login(username, password)
        timestamp = self.clock()
        credential = PersonalCredential(
            username=username,
            password=password,
            status="verified",
            last_verified_at=timestamp,
            last_successful_login_at=timestamp,
            last_error_code=None,
        )
        self.credentials.set(user_id, credential)
        self.token_cache.set(user_id, AinuokeAuthSession(jwt_token=login_session.jwt_token, session_id=login_session.session_id, authenticated_at=timestamp))
        return credential.public_view()

    def test_account(self, user_id: str, username: str | None = None, password: str | None = None) -> dict[str, str | bool | None]:
        stored = self.credentials.get(user_id)
        if username is None and password is None:
            if stored is None:
                raise AccountNotConfiguredError("account_not_configured")
            tested = stored
        elif username and password:
            tested = PersonalCredential(username=username.strip(), password=password)
        else:
            raise ValueError("username_and_password_required")
        try:
            login_session = self.client.login(tested.username, tested.password)
        except AinuokeClientError as error:
            if stored is not None and tested.username == stored.username and tested.password == stored.password:
                self.credentials.set(user_id, replace(stored, status="error", last_verified_at=self.clock(), last_error_code=error.code))
            raise
        timestamp = self.clock()
        self.token_cache.set(user_id, AinuokeAuthSession(jwt_token=login_session.jwt_token, session_id=login_session.session_id, authenticated_at=timestamp))
        if stored is not None and tested.username == stored.username and tested.password == stored.password:
            stored = replace(stored, status="verified", last_verified_at=timestamp, last_successful_login_at=timestamp, last_error_code=None)
            self.credentials.set(user_id, stored)
            return stored.public_view()
        return {**tested.public_view(), "lastVerifiedAt": timestamp, "lastSuccessfulLoginAt": timestamp}

    def delete_account(self, user_id: str) -> dict[str, bool]:
        self.credentials.delete(user_id)
        self.token_cache.delete(user_id)
        return {"deleted": True}

    def read_report(self, user_id: str, *, report_key: str, page: int, page_size: int, query_context: Mapping[str, Any]) -> ReportSnapshot:
        definition = resolve_report(report_key)
        safe_query = validate_query_for_report(definition, query_context)
        credential = self.credentials.get(user_id)
        if credential is None:
            raise AccountNotConfiguredError("account_not_configured")
        auth = self.token_cache.get(user_id)
        if auth is None:
            login_session = self.client.login(credential.username, credential.password)
            auth = AinuokeAuthSession(jwt_token=login_session.jwt_token, session_id=login_session.session_id, authenticated_at=self.clock())
            self.token_cache.set(user_id, auth)
        try:
            report_page = self.client.read_report(definition, jwt_token=auth.jwt_token, page=page, page_size=page_size, query_context=safe_query)
        except AuthExpiredError:
            self.token_cache.delete(user_id)
            login_session = self.client.login(credential.username, credential.password)
            auth = AinuokeAuthSession(jwt_token=login_session.jwt_token, session_id=login_session.session_id, authenticated_at=self.clock())
            self.token_cache.set(user_id, auth)
            report_page = self.client.read_report(definition, jwt_token=auth.jwt_token, page=page, page_size=page_size, query_context=safe_query)
        return build_report_snapshot(
            report_key=report_key,
            rows=report_page.rows,
            page=report_page.page_index,
            page_size=report_page.page_size,
            total=report_page.total,
            query_context=safe_query,
            fetched_at=self.clock(),
        )
