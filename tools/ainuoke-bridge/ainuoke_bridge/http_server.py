from __future__ import annotations

from dataclasses import dataclass, field
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from json import JSONDecodeError, dumps, loads
from socket import AF_INET6
from typing import Any, Mapping
from urllib.parse import urlparse

from .ainuoke_client import AinuokeClientError
from .contracts import SourceContractError, sanitized_source_error, parse_non_negative_integer
from .security import SecurityContract, SecurityContractError
from .service import AccountNotConfiguredError, AinuokeBridgeService
from .session_store import BrowserSessionStore, SessionError


SESSION_COOKIE = "zhixu_ainuoke_bridge"
MAX_BODY_BYTES = 256 * 1024


@dataclass(frozen=True)
class BridgeRequest:
    method: str
    path: str
    origin: str | None
    headers: Mapping[str, str] = field(default_factory=dict)
    body: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BridgeResponse:
    status: int
    body: Mapping[str, Any]
    headers: Mapping[str, str] = field(default_factory=dict)


class BridgeApplication:
    def __init__(self, *, security: SecurityContract, sessions: BrowserSessionStore, service: AinuokeBridgeService) -> None:
        self.security = security
        self.sessions = sessions
        self.service = service

    def handle(self, request: BridgeRequest) -> BridgeResponse:
        try:
            origin = self.security.allow_origin(request.origin)
        except SecurityContractError:
            return BridgeResponse(403, {"error": {"code": "origin_not_allowed", "message": "请求来源不在允许列表"}})
        cors = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
        try:
            if request.method == "OPTIONS":
                return BridgeResponse(204, {}, {**cors, "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Zhixu-CSRF"})
            if request.method == "POST" and request.path == "/v1/session":
                user_id = str(request.body.get("userId", "")).strip()
                session = self.sessions.create(user_id, origin)
                return BridgeResponse(
                    201,
                    {"csrfToken": session.csrf_nonce, "expiresAt": session.expires_at, "identitySecurity": "browser_local_mock"},
                    {**cors, "Set-Cookie": f"{SESSION_COOKIE}={session.session_id}; Path=/; HttpOnly; SameSite=Strict"},
                )
            headers = {key.lower(): value for key, value in request.headers.items()}
            csrf_nonce = headers.get("x-zhixu-csrf") if request.method in {"PUT", "POST", "DELETE"} else None
            if request.method in {"PUT", "POST", "DELETE"} and not csrf_nonce:
                raise SessionError("csrf_required")
            session = self.sessions.resolve(
                _session_cookie(headers.get("cookie")),
                origin,
                csrf_nonce,
            )
            if request.method == "GET" and request.path == "/v1/ainuoke/account":
                return BridgeResponse(200, self.service.get_account(session.user_id), cors)
            if request.method == "PUT" and request.path == "/v1/ainuoke/account":
                body = self.service.put_account(session.user_id, str(request.body.get("username", "")), str(request.body.get("password", "")))
                return BridgeResponse(200, body, cors)
            if request.method == "POST" and request.path == "/v1/ainuoke/account/test":
                username = request.body.get("username")
                password = request.body.get("password")
                body = self.service.test_account(
                    session.user_id,
                    str(username) if username is not None else None,
                    str(password) if password is not None else None,
                )
                return BridgeResponse(200, body, cors)
            if request.method == "DELETE" and request.path == "/v1/ainuoke/account":
                body = self.service.delete_account(session.user_id)
                self.sessions.delete_for_user(session.user_id)
                return BridgeResponse(200, body, cors)
            prefix = "/v1/ainuoke/reports/"
            suffix = "/query"
            if request.method == "POST" and request.path.startswith(prefix) and request.path.endswith(suffix):
                if not set(request.body).issubset({"page", "pageSize", "query"}):
                    raise ValueError("invalid_query")
                report_key = request.path[len(prefix) : -len(suffix)]
                try:
                    page = parse_non_negative_integer(request.body.get("page", 1))
                    page_size = parse_non_negative_integer(request.body.get("pageSize", 100))
                except ValueError:
                    raise ValueError("invalid_paging") from None
                if page < 1 or page_size < 1 or page_size > 500:
                    raise ValueError("invalid_paging")
                query = request.body.get("query", {})
                if not isinstance(query, Mapping):
                    raise ValueError("invalid_query")
                snapshot = self.service.read_report(session.user_id, report_key=report_key, page=page, page_size=page_size, query_context=query)
                return BridgeResponse(200, snapshot.to_dict(), cors)
            if request.path.startswith("/v1/ainuoke/"):
                return BridgeResponse(405, {"error": {"code": "read_only_boundary", "message": "Local Bridge 不提供该操作"}}, cors)
            return BridgeResponse(404, {"error": {"code": "not_found", "message": "未找到接口"}}, cors)
        except AccountNotConfiguredError:
            return BridgeResponse(409, {"error": {"code": "account_not_configured", "message": "尚未绑定艾诺科账号"}}, cors)
        except SourceContractError as error:
            return BridgeResponse(400, {"error": sanitized_source_error(str(error))}, cors)
        except AinuokeClientError as error:
            status = 401 if error.code in {"invalid_credential", "auth_expired"} else 502
            return BridgeResponse(status, {"error": sanitized_source_error(error.code)}, cors)
        except (SessionError, ValueError) as error:
            known_codes = {"invalid_user_context", "session_required", "session_origin_mismatch", "csrf_invalid", "csrf_required", "username_and_password_required", "invalid_paging", "invalid_query"}
            code = str(error) if str(error) in known_codes else "invalid_request"
            return BridgeResponse(400, {"error": {"code": code, "message": "请求无效"}}, cors)
        except Exception:
            return BridgeResponse(500, {"error": {"code": "bridge_internal_error", "message": "Local Bridge 请求失败"}}, cors)


def _session_cookie(raw_cookie: str | None) -> str | None:
    if not raw_cookie:
        return None
    cookie = SimpleCookie()
    cookie.load(raw_cookie)
    morsel = cookie.get(SESSION_COOKIE)
    return morsel.value if morsel else None


def create_http_server(host: str, port: int, application: BridgeApplication) -> ThreadingHTTPServer:
    application.security.__class__(host, application.security.allowed_origins)

    server_type = ThreadingHTTPServer
    if ":" in host:
        class IPv6ThreadingHTTPServer(ThreadingHTTPServer):
            address_family = AF_INET6
        server_type = IPv6ThreadingHTTPServer

    class Handler(BaseHTTPRequestHandler):
        server_version = "ZhixuAinuokeBridge/1"

        def log_message(self, _format: str, *_args: object) -> None:
            return

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._dispatch()

        def do_GET(self) -> None:  # noqa: N802
            self._dispatch()

        def do_PUT(self) -> None:  # noqa: N802
            self._dispatch()

        def do_POST(self) -> None:  # noqa: N802
            self._dispatch()

        def do_DELETE(self) -> None:  # noqa: N802
            self._dispatch()

        def _dispatch(self) -> None:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length > MAX_BODY_BYTES:
                self.send_error(413)
                return
            body: Mapping[str, Any] = {}
            if length:
                try:
                    candidate = loads(self.rfile.read(length).decode("utf-8"))
                    if not isinstance(candidate, Mapping):
                        raise ValueError
                    body = candidate
                except (UnicodeDecodeError, JSONDecodeError, ValueError):
                    self._write(BridgeResponse(400, {"error": {"code": "invalid_json", "message": "请求无效"}}))
                    return
            response = application.handle(
                BridgeRequest(
                    method=self.command,
                    path=urlparse(self.path).path,
                    origin=self.headers.get("Origin"),
                    headers={key: value for key, value in self.headers.items()},
                    body=body,
                )
            )
            self._write(response)

        def _write(self, response: BridgeResponse) -> None:
            payload = b"" if response.status == 204 else dumps(response.body, ensure_ascii=False).encode("utf-8")
            self.send_response(response.status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            for key, value in response.headers.items():
                self.send_header(key, value)
            self.end_headers()
            if payload:
                self.wfile.write(payload)

    return server_type((host, port), Handler)
