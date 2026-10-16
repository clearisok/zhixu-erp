"""Strict two-contract budget around the existing fixed Source collector.

No new mapper, database writer, scheduler, or report catalog. The original
collector may ask for renewal; this client refuses before another login/HTTP.
"""
import json
import unicodedata
from hashlib import sha256
from time import monotonic
from .ainuoke_client import AinuokeClient, AuthExpiredError, InvalidCredentialError, NetworkAinuokeError
from .server_source import ProtectedTransport, collect, validate_input, identity, MAX_BYTES

MODES = ("selected-bindings", "selected-materials")
LIMITS = {"contracts": 2, "logins": 1, "reportRequests": 80, "httpAttempts": 81,
          "pageSize": 50, "pagesPerReport": 20, "rowsPerReport": 1000,
          "sourceRows": 4000, "responseBytes": 4*1024*1024, "workerBytes": MAX_BYTES, "timeoutMs": 180000}
FAILURE_CODES = frozenset({"selected_source_timeout", "selected_source_request_limit", "selected_source_endpoint_refused",
    "selected_source_response_limit", "selected_source_page_limit", "selected_source_row_limit", "selected_source_query_refused",
    "selected_source_secret_reflection", "invalid_credential", "auth_expired", "source_unavailable", "selected_source_invalid"})


def fingerprint(data):
    value = {"origin": data["baseUrl"].rstrip("/"), "username": unicodedata.normalize("NFKC", data["username"]).strip()}
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf8")).hexdigest()


class Refused(Exception):
    def __init__(self, code):
        self.code = code


class BudgetTransport:
    def __init__(self, base, transport, clock):
        self.base, self.transport, self.clock = base.rstrip("/"), transport, clock
        self.deadline = clock() + LIMITS["timeoutMs"]/1000
        self.logins = self.reports = self.bytes = 0

    def request(self, **request):
        remaining = self.deadline - self.clock()
        if remaining <= 0:
            raise Refused("selected_source_timeout")
        url, method = request["url"], request["method"]
        if method == "GET" and url == self.base + AinuokeClient.LOGIN_PATH:
            if self.logins >= 1:
                raise AuthExpiredError("auth_expired")
            self.logins += 1
        elif method == "POST" and url == self.base + AinuokeClient.REPORT_PATH:
            if self.logins != 1 or self.reports >= LIMITS["reportRequests"]:
                raise Refused("selected_source_request_limit")
            self.reports += 1
        else:
            raise Refused("selected_source_endpoint_refused")
        request["timeout"] = min(request["timeout"], remaining)
        value = self.transport.request(**request)
        size = len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf8"))
        if size > LIMITS["responseBytes"]:
            raise Refused("selected_source_response_limit")
        self.bytes += size
        if self.bytes > MAX_BYTES or self.clock() > self.deadline:
            raise Refused("selected_source_response_limit" if self.bytes > MAX_BYTES else "selected_source_timeout")
        return value

    def metrics(self):
        return {"logins": self.logins, "reportRequests": self.reports, "httpAttempts": self.logins+self.reports,
                "networkRetries": 0, "authRenewals": 0}


class BudgetClient:
    def __init__(self, sdk, transport, selected, mode):
        self.sdk, self.transport, self.selected, self.mode = sdk, transport, set(selected), mode
        self.lookup = {}
        self.secrets = set()

    def login(self, username, password):
        # The common collector's renewal branch cannot get as far as a second
        # SDK login or transport request, even if the session expires mid-page.
        if self.transport.logins:
            raise AuthExpiredError("auth_expired")
        session = self.sdk.login(username, password)
        self.secrets.update((password, session.jwt_token, session.session_id))
        return session

    def read_report(self, definition, *, jwt_token, page, page_size, query_context):
        report = str(definition.report_id)
        detail = "6087105" if self.mode == "selected-bindings" else "6087050"
        if not 1 <= page <= LIMITS["pagesPerReport"] or page_size != 50:
            raise Refused("selected_source_page_limit")
        if report == "6086103":
            allowed = definition.key == "order_discovery" and query_context == {}
        elif report == detail and detail == "6087105":
            allowed = set(query_context) == {"salesContractNo"} and query_context["salesContractNo"] in self.selected
        elif report == detail:
            allowed = (set(query_context) == {"insideOrderNo"} and isinstance(query_context["insideOrderNo"], str)
                       and query_context["insideOrderNo"] in {self.lookup[c] for c in self.selected if c in self.lookup})
        else:
            allowed = False
        if not allowed:
            raise Refused("selected_source_query_refused")
        result = self.sdk.read_report(definition, jwt_token=jwt_token, page=page, page_size=page_size, query_context=query_context)
        if result.total > LIMITS["rowsPerReport"]:
            raise Refused("selected_source_row_limit")
        if report == "6086103":
            for row in result.rows:
                contract, inside = identity(row.get("BillNo")), row.get("InsideOrderNo")
                if contract in self.selected and isinstance(inside, str) and inside.strip():
                    self.lookup[contract] = inside.strip()
        return result


def collect_selected(data, transport=None, clock=monotonic):
    """Injection is an internal testing seam, never an argv/stdin flag."""
    data = validate_input(data)
    if data.get("mode") not in MODES:
        raise ValueError("invalid_selected_scope")
    budget = BudgetTransport(data["baseUrl"], transport or ProtectedTransport(LIMITS["responseBytes"]), clock)
    common = {"schemaVersion": "ainuoke-selected-source-once.v1", "mode": data["mode"], "limits": dict(LIMITS),
              "sourceFingerprint": fingerprint(data), "selectedContracts": list(data["contracts"]),
              "databaseAccess": "none", "sourceActivation": "not-activated"}
    try:
        sdk = AinuokeClient(base_url=data["baseUrl"], transport=budget, network_retries=0)
        client = BudgetClient(sdk, budget, data["contracts"], data["mode"])
        engine = {**data}
        if data["mode"] == "selected-bindings":
            engine["mode"] = "additions"
        else:
            engine.pop("mode")
        bundle = collect(engine, client)
        encoded = json.dumps(bundle, ensure_ascii=False, allow_nan=False)
        if any(secret in encoded for secret in client.secrets):
            raise Refused("selected_source_secret_reflection")
        if sum(len(p["rows"]) for p in [*bundle["discoveryBefore"], *bundle["discoveryAfter"],
              *(p for pages in bundle.get("colors", bundle.get("materials", {})).values() for p in pages)]) > LIMITS["sourceRows"]:
            raise Refused("selected_source_row_limit")
        return {**common, "result": "complete", "code": None, "metrics": budget.metrics(), "bundle": bundle}
    except (Exception, KeyboardInterrupt) as error:
        code = error.code if isinstance(error, Refused) else "invalid_credential" if isinstance(error, InvalidCredentialError) \
            else "auth_expired" if isinstance(error, AuthExpiredError) else "source_unavailable" if isinstance(error, NetworkAinuokeError) \
            else "selected_source_invalid"
        return {**common, "result": "failed", "code": code if code in FAILURE_CODES else "selected_source_invalid",
                "metrics": budget.metrics(), "bundle": None}
