"""One explicit operator login check; never reads reports or retains a session."""
import json
import sys
from collections.abc import Mapping
from time import monotonic

from .ainuoke_client import AinuokeClient, InvalidCredentialError, NetworkAinuokeError, UpstreamSchemaError
from .request_diagnostics import DiagnosticTransport
from .selected_source_once import BudgetTransport, Refused
from .server_source import ProtectedTransport, validate_input

LIMITS = {"logins": 1, "reportRequests": 0, "httpAttempts": 1,
          "responseBytes": 4 * 1024 * 1024, "timeoutMs": 30000,
          "requestTimeoutMs": 15000, "networkRetries": 0, "authRenewals": 0}
# Exact, closed message matches only. Unknown/dynamic text is never returned.
HINTS = {
    "session_exists": ("用户已登录", "该用户已登录", "用户已经登录", "该用户已经登录",
                       "此用户已登录", "账号已登录", "帐号已登录", "账户已登录",
                       "该账号已登录", "该帐号已登录", "该账户已登录", "already logged in"),
    "verification_required": ("验证码错误", "请输入验证码", "验证码不能为空", "验证码已过期", "captcha required"),
    "credentials_rejected": ("用户名或密码错误", "用户名或密码不正确", "账号或密码错误",
                             "用户名不存在", "密码错误", "invalid username or password"),
    "account_unavailable": ("用户已锁定", "用户被锁定", "账号已锁定", "账号被锁定",
                            "用户已禁用", "账号已禁用", "账号已停用", "account locked", "account disabled"),
    "throttling_hint": ("请求过于频繁", "访问过于频繁", "操作过于频繁", "登录过于频繁", "too many requests"),
}

class LoginEvidenceTransport:
    def __init__(self, transport):
        self.transport = transport
        self.payload_rejected = False
        self.server_hint = "unclassified"

    def request(self, **request):
        body = request.get("body")
        if request.get("method") != "GET" or not isinstance(body, dict) or body.get("isCoverLogin") != "false":
            raise Refused("login_scope_refused")
        response = self.transport.request(**request)
        data = response.get("data") if isinstance(response, Mapping) else None
        self.payload_rejected = isinstance(data, Mapping) and data.get("isOk") is False
        if self.payload_rejected:
            matches = set()
            for obj in (response, data):
                for key in ("message", "msg", "errMsg", "errorMsg"):
                    value = obj.get(key)
                    if not isinstance(value, str) or len(value) > 256:
                        continue
                    normalized = value.strip().rstrip("。.!！").casefold()
                    for hint, messages in HINTS.items():
                        if normalized in messages:
                            matches.add(hint)
            if len(matches) == 1:
                self.server_hint = matches.pop()
        return response


def run_login_diagnostic(data, transport=None, clock=monotonic):
    required = {"schemaVersion", "baseUrl", "username", "password"}
    if (not isinstance(data, dict) or not required <= set(data) <= required | {"transportPolicy"}
            or data.get("schemaVersion") != "ainuoke-login-diagnostic-input.v1"):
        raise ValueError("login_diagnostic_input_invalid")
    checked = validate_input({key: value for key, value in data.items() if key != "schemaVersion"}
                             | {"mode": "catalog-discovery", "contracts": []})
    evidence = LoginEvidenceTransport(transport or ProtectedTransport(LIMITS["responseBytes"]))
    events = []
    bounded = BudgetTransport(checked["baseUrl"], DiagnosticTransport(evidence, events, clock), clock, report_limit=0)
    bounded.deadline = min(bounded.deadline, clock() + LIMITS["timeoutMs"] / 1000)
    client = AinuokeClient(base_url=checked["baseUrl"], transport=bounded,
                           timeout_seconds=LIMITS["requestTimeoutMs"] / 1000, network_retries=0)
    result, code = "accepted", "login_accepted"
    try:
        client.login(checked["username"], checked["password"])
    except InvalidCredentialError:
        result, code = "rejected", "login_refused"
        if events:
            events[-1]["outcome"] = "auth_error"
    except NetworkAinuokeError:
        result, code = "failed", "source_unavailable"
    except UpstreamSchemaError:
        result, code = "failed", "upstream_schema_error"
    except (Exception, KeyboardInterrupt):
        result, code = "failed", "login_diagnostic_failed"
    return {"schemaVersion": "ainuoke-login-diagnostic.v1", "result": result, "code": code,
            "limits": dict(LIMITS), "metrics": bounded.metrics(), "requests": events,
            "payloadRefused": evidence.payload_rejected, "serverHint": evidence.server_hint,
            "databaseAccess": "none", "sourceActivation": "not-activated", "coverLogin": False,
            "sessionRetained": False}


def main():
    try:
        if sys.argv[1:]:
            raise ValueError("no_arguments_allowed")
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("input_limit")
        result = run_login_diagnostic(json.loads(raw))
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        return 0 if result["result"] == "accepted" else 1
    except (Exception, KeyboardInterrupt):
        sys.stdout.write('{"error":"login_diagnostic_input_or_result_invalid"}')
        return 1


if __name__ == "__main__":
    sys.exit(main())
