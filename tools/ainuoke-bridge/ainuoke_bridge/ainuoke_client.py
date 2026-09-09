from __future__ import annotations

from dataclasses import dataclass
from json import JSONDecodeError, dumps, loads
from time import sleep
from typing import Any, Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

from .contracts import ReportDefinition, build_report_request


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
            request_headers["Content-Type"] = "application/json;charset=utf-8"
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
class AinuokeLoginSession:
    jwt_token: str
    session_id: str


@dataclass(frozen=True)
class ReportPage:
    rows: list[Mapping[str, Any]]
    total: int
    page_index: int
    page_size: int


class AinuokeClient:
    DEFAULT_BASE_URL = "http://61.164.81.194:9043"
    LOGIN_PATH = "/kaijin/system/user/loginsys2"
    REPORT_PATH = "/kaijin/report/report/getReportObjAndData"
    SYSTEM_ID = "6080183"

    def __init__(self, *, base_url: str = DEFAULT_BASE_URL, report_path: str = REPORT_PATH, transport: JsonTransport | None = None, timeout_seconds: float = 15, network_retries: int = 2, sleeper=sleep) -> None:
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

    def login(self, username: str, password: str) -> AinuokeLoginSession:
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
                headers={
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": urljoin(self.base_url, "kaijin/login.html"),
                },
            )
        except AuthExpiredError:
            raise InvalidCredentialError("invalid_credential") from None
        data = response.get("data")
        if not isinstance(data, Mapping):
            raise UpstreamSchemaError("upstream_schema_error")
        if not isinstance(data.get("isOk"), bool):
            raise UpstreamSchemaError("upstream_schema_error")
        if data["isOk"] is not True:
            raise InvalidCredentialError("invalid_credential")
        token = data.get("jwtToken")
        session_id = data.get("sessionId")
        if not isinstance(token, str) or not token.strip() or not isinstance(session_id, str) or not session_id.strip():
            raise UpstreamSchemaError("upstream_schema_error")
        return AinuokeLoginSession(jwt_token=token.strip(), session_id=session_id.strip())

    def read_report(self, definition: ReportDefinition, *, jwt_token: str, page: int, page_size: int, query_context: Mapping[str, Any]) -> ReportPage:
        response = self._request_with_network_retry(
            url=urljoin(self.base_url, self.report_path.lstrip("/")),
            method="POST",
            body=build_report_request(definition, page=page, page_size=page_size, query_context=query_context),
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": urljoin(self.base_url, "kaijin/main2.html?systemId=6080183"),
                "Authorization": jwt_token,
                "Token": jwt_token,
                "Cookie": f"kaijin_my_token={jwt_token}; rungingSysId={self.SYSTEM_ID}",
            },
        )
        if _looks_like_auth_expired(response):
            raise AuthExpiredError("auth_expired")
        rows, total, actual_page, actual_page_size = _parse_report_page(response, requested_page=page, requested_page_size=page_size)
        return ReportPage(rows=rows, total=total, page_index=actual_page, page_size=actual_page_size)


def _looks_like_auth_expired(response: Mapping[str, Any]) -> bool:
    code = str(response.get("code", "")).lower()
    re_obj = response.get("reObj")
    nested_code = str(re_obj.get("code", "")).lower() if isinstance(re_obj, Mapping) else ""
    explicit_code = code in {"401", "403", "auth_expired", "token_expired"} or nested_code in {"401", "403", "auth_expired", "token_expired"}
    missing_report_data = not isinstance(response.get("dataList"), str)
    return explicit_code or (response.get("isLogined") is False and missing_report_data)


def _required_non_negative_int(value: Any) -> int:
    if isinstance(value, bool):
        raise UpstreamSchemaError("upstream_schema_error")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise UpstreamSchemaError("upstream_schema_error") from None
    if parsed < 0:
        raise UpstreamSchemaError("upstream_schema_error")
    return parsed


def _parse_report_page(response: Mapping[str, Any], *, requested_page: int, requested_page_size: int) -> tuple[list[Mapping[str, Any]], int, int, int]:
    re_obj = response.get("reObj")
    if not isinstance(re_obj, Mapping) or re_obj.get("isOk") is not True:
        raise UpstreamSchemaError("upstream_schema_error")
    raw_data_list = response.get("dataList")
    if not isinstance(raw_data_list, str):
        raise UpstreamSchemaError("upstream_schema_error")
    try:
        parsed = loads(raw_data_list)
    except JSONDecodeError:
        raise UpstreamSchemaError("upstream_schema_error") from None
    if not isinstance(parsed, Mapping):
        raise UpstreamSchemaError("upstream_schema_error")
    raw_rows = parsed.get("rows")
    if not isinstance(raw_rows, list) or not all(isinstance(row, Mapping) for row in raw_rows):
        raise UpstreamSchemaError("upstream_schema_error")
    total = _required_non_negative_int(response.get("dataCount", parsed.get("total")))
    page_index = _required_non_negative_int(response.get("pageIndex"))
    page_size = _required_non_negative_int(response.get("pageSize"))
    # getReportObjAndData returns 0/0 for these direct report reads. In that
    # verified sentinel case, the request sqlCdtn is the paging authority.
    if page_index == 0:
        page_index = requested_page
    if page_size == 0:
        page_size = requested_page_size
    if page_index != requested_page or page_size != requested_page_size:
        raise UpstreamSchemaError("upstream_schema_error")
    return list(raw_rows), total, page_index, page_size
