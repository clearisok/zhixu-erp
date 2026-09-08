from __future__ import annotations

from dataclasses import dataclass
from json import JSONDecodeError, dumps, loads
from time import sleep
from typing import Any, Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

from .contracts import ReportDefinition


class AinuokeClientError(RuntimeError):
    code = "upstream_error"


class InvalidCredentialError(AinuokeClientError):
    code = "invalid_credential"


class NetworkAinuokeError(AinuokeClientError):
    code = "network_unavailable"


class AuthExpiredError(AinuokeClientError):
    code = "auth_expired"


class UpstreamSchemaError(AinuokeClientError):
    code = "upstream_schema_error"


class JsonTransport(Protocol):
    def request(self, *, url: str, method: str, body: Mapping[str, Any], headers: Mapping[str, str], timeout: float) -> Mapping[str, Any]: ...


class UrllibJsonTransport:
    def request(self, *, url: str, method: str, body: Mapping[str, Any], headers: Mapping[str, str], timeout: float) -> Mapping[str, Any]:
        request_headers = {"Accept": "application/json", **headers}
        data: bytes | None
        if method == "GET":
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}{urlencode({key: str(value) for key, value in body.items()})}"
            data = None
        else:
            request_headers["Content-Type"] = "application/json"
            data = dumps(body, ensure_ascii=False).encode("utf-8")
        try:
            with urlopen(Request(url, data=data, method=method, headers=request_headers), timeout=timeout) as response:
                raw = response.read()
        except HTTPError as error:
            if error.code in (401, 403):
                raise AuthExpiredError("auth_expired") from None
            raise NetworkAinuokeError("upstream_http_error") from None
        except (URLError, TimeoutError, OSError):
            raise NetworkAinuokeError("network_unavailable") from None
        try:
            decoded = loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, JSONDecodeError):
            raise UpstreamSchemaError("upstream_schema_error") from None
        if not isinstance(decoded, Mapping):
            raise UpstreamSchemaError("upstream_schema_error")
        return decoded


@dataclass(frozen=True)
class ReportPage:
    rows: list[Mapping[str, Any]]
    total: int


class AinuokeClient:
    LOGIN_PATH = "/kaijin/system/user/loginsys2"

    def __init__(self, *, base_url: str, report_path: str, transport: JsonTransport | None = None, timeout_seconds: float = 15, network_retries: int = 2, sleeper=sleep) -> None:
        if not base_url.lower().startswith(("http://", "https://")):
            raise ValueError("Ainuoke base URL must be absolute")
        if not report_path.startswith("/"):
            raise ValueError("Ainuoke report path must start with /")
        self.base_url = base_url.rstrip("/") + "/"
        self.report_path = report_path
        self.transport = transport or UrllibJsonTransport()
        self.timeout_seconds = timeout_seconds
        self.network_retries = max(0, network_retries)
        self.sleeper = sleeper

    def _request_with_network_retry(self, **arguments: Any) -> Mapping[str, Any]:
        for attempt in range(self.network_retries + 1):
            try:
                return self.transport.request(timeout=self.timeout_seconds, **arguments)
            except NetworkAinuokeError:
                if attempt >= self.network_retries:
                    raise
                self.sleeper(min(0.25 * (2**attempt), 1.0))
        raise AssertionError("unreachable")

    def login(self, username: str, password: str) -> str:
        try:
            response = self._request_with_network_retry(
                url=urljoin(self.base_url, self.LOGIN_PATH.lstrip("/")),
                method="GET",
                body={
                    "userName": username,
                    "password": password,
                    "verifyCode": "",
                    "cltType": 1,
                    "rememberMe": "true",
                    "jsCode": "",
                    "isCoverLogin": "false",
                },
                headers={},
            )
        except AuthExpiredError:
            raise InvalidCredentialError("invalid_credential") from None
        token = _find_token(response)
        if token:
            return token
        if _looks_like_invalid_credential(response):
            raise InvalidCredentialError("invalid_credential")
        raise UpstreamSchemaError("upstream_schema_error")

    def read_report(self, definition: ReportDefinition, *, jwt_token: str, page: int, page_size: int, query_context: Mapping[str, Any]) -> ReportPage:
        response = self._request_with_network_retry(
            url=urljoin(self.base_url, self.report_path.lstrip("/")),
            method="POST",
            body={"reportId": definition.report_id, "page": page, "pageSize": page_size, "query": dict(query_context)},
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        if _looks_like_auth_expired(response):
            raise AuthExpiredError("auth_expired")
        rows, total = _find_rows(response)
        return ReportPage(rows=rows, total=total)


def _find_token(response: Mapping[str, Any]) -> str | None:
    for container in (response, response.get("data")):
        if not isinstance(container, Mapping):
            continue
        for key in ("jwtToken", "token"):
            value = container.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _looks_like_invalid_credential(response: Mapping[str, Any]) -> bool:
    code = str(response.get("code", "")).lower()
    message = str(response.get("message", response.get("msg", ""))).lower()
    return code in {"401", "invalid_credential", "login_failed"} or any(marker in message for marker in ("密码", "账号", "credential", "password"))


def _looks_like_auth_expired(response: Mapping[str, Any]) -> bool:
    code = str(response.get("code", "")).lower()
    return code in {"401", "403", "auth_expired", "token_expired"}


def _find_rows(response: Mapping[str, Any]) -> tuple[list[Mapping[str, Any]], int]:
    candidates = [response, response.get("data")]
    if isinstance(response.get("data"), Mapping):
        candidates.append(response["data"].get("page"))
    for candidate in candidates:
        if not isinstance(candidate, Mapping):
            continue
        for key in ("rows", "records", "list"):
            raw_rows = candidate.get(key)
            if isinstance(raw_rows, list) and all(isinstance(row, Mapping) for row in raw_rows):
                total_value = candidate.get("total", len(raw_rows))
                try:
                    total = int(total_value)
                except (TypeError, ValueError):
                    total = len(raw_rows)
                return list(raw_rows), total
    raise UpstreamSchemaError("upstream_schema_error")
