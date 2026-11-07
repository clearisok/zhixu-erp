"""One explicit operator login check; never reads reports or retains a session."""
import json
import sys
from time import monotonic

from .ainuoke_client import AinuokeClient, InvalidCredentialError, NetworkAinuokeError, UpstreamSchemaError
from .request_diagnostics import DiagnosticTransport
from .selected_source_once import BudgetTransport, Refused
from .server_source import ProtectedTransport, validate_input
from .login_evidence import login_evidence

LIMITS = {"logins": 1, "reportRequests": 0, "httpAttempts": 1,
          "responseBytes": 4 * 1024 * 1024, "timeoutMs": 30000,
          "requestTimeoutMs": 15000, "networkRetries": 0, "authRenewals": 0}

class LoginEvidenceTransport:
    def __init__(self, transport):
        self.transport = transport
        self.payload_rejected = False
        self.server_hint = "unclassified"

    @property
    def last_http_status(self):
        return getattr(self.transport, "last_http_status", None)

    def request(self, **request):
        body = request.get("body")
        if request.get("method") != "GET" or not isinstance(body, dict) or body.get("isCoverLogin") != "false":
            raise Refused("login_scope_refused")
        response = self.transport.request(**request)
        evidence = login_evidence(response)
        self.payload_rejected = evidence["result"] == "rejected"
        self.server_hint = evidence["serverHint"]
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
        if events:
            events[-1]["outcome"] = "schema_error"
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
