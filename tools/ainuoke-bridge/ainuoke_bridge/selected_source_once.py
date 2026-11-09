"""Strict shared budget for selected two-contract or full-bound-scope capture.

No new mapper, database writer, scheduler, or report catalog. Standalone captures
refuse renewal; a persistent owner can renew an explicitly expired reused session
once within the same existing request budget.
"""
import json
import unicodedata
from dataclasses import replace
from hashlib import sha256
from time import monotonic
from .ainuoke_client import AinuokeClient, AuthExpiredError, InvalidCredentialError, NetworkAinuokeError, UpstreamSchemaError
from .server_source import ProtectedTransport, collect, validate_input, identity, MAX_BYTES

MODES = ("selected-bindings", "selected-materials", "bound-materials", "catalog-discovery", "catalog-contracts")
LIMITS = {"contracts": 2, "logins": 1, "reportRequests": 80, "httpAttempts": 81,
          "pageSize": 50, "pagesPerReport": 20, "rowsPerReport": 1000,
          "sourceRows": 4000, "responseBytes": 4*1024*1024, "workerBytes": MAX_BYTES, "timeoutMs": 180000}
CATALOG_LIMITS = {**LIMITS, "contracts": 0, "reportRequests": 56, "httpAttempts": 57,
                  "pagesPerReport": 28, "rowsPerReport": 1400}
CATALOG_CONTRACT_LIMITS = {**LIMITS, "contracts": 25, "pagesPerReport": 28, "rowsPerReport": 1400}
FAILURE_CODES = frozenset({"selected_source_timeout", "selected_source_request_limit", "selected_source_endpoint_refused",
    "selected_source_response_limit", "selected_source_page_limit", "selected_source_row_limit", "selected_source_query_refused",
    "selected_source_secret_reflection", "invalid_credential", "auth_expired", "source_unavailable", "selected_source_invalid"})

# The entire fixed capture still expires after 180s. A single catalogue request
# may wait 45s for a delayed response; it is never retried or renewed.
CATALOG_REQUEST_TIMEOUT_SECONDS = 45


def fingerprint(data):
    value = {"origin": data["baseUrl"].rstrip("/"), "username": unicodedata.normalize("NFKC", data["username"]).strip()}
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf8")).hexdigest()


def reject_secret_values(value, secrets, depth=0):
    if depth > 12:
        raise Refused("selected_source_invalid")
    if isinstance(value, str) and any(secret in value for secret in secrets):
        raise Refused("selected_source_secret_reflection")
    if isinstance(value, dict):
        for key, child in value.items():
            reject_secret_values(key, secrets, depth+1)
            reject_secret_values(child, secrets, depth+1)
    elif isinstance(value, list):
        for child in value:
            reject_secret_values(child, secrets, depth+1)


class Refused(Exception):
    def __init__(self, code):
        self.code = code


class BudgetTransport:
    def __init__(self, base, transport, clock, report_limit=80):
        self.report_limit = report_limit
        self.base, self.transport, self.clock = base.rstrip("/"), transport, clock
        self.deadline = clock() + LIMITS["timeoutMs"]/1000
        self.logins = self.reports = self.bytes = 0
        self.authenticated = False
        self.renewals = 0
        self.explicit_session_expired = False

    def request(self, **request):
        self.explicit_session_expired = False
        remaining = self.deadline - self.clock()
        if remaining <= 0:
            raise Refused("selected_source_timeout")
        url, method = request["url"], request["method"]
        if method == "GET" and url == self.base + AinuokeClient.LOGIN_PATH:
            if self.logins >= 1:
                raise AuthExpiredError("auth_expired")
            self.logins += 1
        elif method == "POST" and url == self.base + AinuokeClient.REPORT_PATH:
            if not (self.logins == 1 or self.authenticated) or self.reports >= self.report_limit:
                raise Refused("selected_source_request_limit")
            self.reports += 1
        else:
            raise Refused("selected_source_endpoint_refused")
        request["timeout"] = min(request["timeout"], remaining)
        value = self.transport.request(**request)
        if method == 'POST' and isinstance(value, dict):
            nested = value.get('reObj')
            codes = {str(value.get('code', '')).lower(), str(nested.get('code', '')).lower() if isinstance(nested, dict) else ''}
            # HTTP/JSON 403 may mean permission denial; never renew on it.
            self.explicit_session_expired = '403' not in codes and (bool(codes & {'401','auth_expired','token_expired'})
                or value.get('isLogined') is False and not isinstance(value.get('dataList'), str))
        size = len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf8"))
        if size > LIMITS["responseBytes"]:
            raise Refused("selected_source_response_limit")
        self.bytes += size
        if self.bytes > MAX_BYTES or self.clock() > self.deadline:
            raise Refused("selected_source_response_limit" if self.bytes > MAX_BYTES else "selected_source_timeout")
        return value

    def metrics(self):
        return {"logins": self.logins, "reportRequests": self.reports, "httpAttempts": self.logins+self.reports,
                "networkRetries": 0, "authRenewals": self.renewals}


class BudgetClient:
    def __init__(self, sdk, transport, selected, mode, material_report=None, session_owner=None):
        self.sdk, self.transport, self.selected, self.mode = sdk, transport, set(selected), mode
        self.lookup = {}
        self.material_report = material_report
        self.unit_lookups = set()
        self.directory_row_limit = 1400 if mode in ("catalog-discovery", "catalog-contracts") else 1000
        self.secrets = set()
        self.session_owner = session_owner
        self.login_called = False
        self.credentials = None

    def login(self, username, password):
        # The common collector cannot start an unbounded second login. The
        # persistent owner's bounded renewal lives in read_report instead.
        if self.login_called or self.transport.logins:
            raise AuthExpiredError("auth_expired")
        self.login_called = True
        self.credentials = (username, password)
        session = self.session_owner.session if self.session_owner and self.session_owner.valid() else self.sdk.login(username, password)
        if self.session_owner:
            self.session_owner.accept(session)
        self.transport.authenticated = True
        self.secrets.update((password, session.jwt_token, session.session_id))
        return session

    def read_report(self, definition, *, jwt_token, page, page_size, query_context):
        report = str(definition.report_id)
        detail = "none" if self.mode == "catalog-discovery" else "6087105" if self.mode == "selected-bindings" else "6087050"
        if not 1 <= page <= (self.directory_row_limit // 50 if report == "6086103" else LIMITS["pagesPerReport"]) or page_size != 50:
            raise Refused("selected_source_page_limit")
        if report == "6086103":
            allowed = definition.key == "order_discovery" and query_context == {}
        elif report == "6087105" and (detail == "6087105" or self.mode == "catalog-contracts"):
            allowed = set(query_context) == {"salesContractNo"} and query_context["salesContractNo"] in self.selected
        elif self.material_report == "6087051" and report == "6087051":
            allowed = set(query_context) == {"salesContractNo"} and query_context["salesContractNo"] in self.selected
        elif self.material_report == "6087051" and report in ("6086405", "6086408", "6086875", "6086354"):
            allowed = set(query_context) == {"insideOrderNo"} and (definition.key, query_context["insideOrderNo"]) in self.unit_lookups
        elif report == detail and self.material_report is None:
            allowed = (set(query_context) == {"insideOrderNo"} and isinstance(query_context["insideOrderNo"], str)
                       and query_context["insideOrderNo"] in {self.lookup[c] for c in self.selected if c in self.lookup})
        else:
            allowed = False
        if not allowed:
            raise Refused("selected_source_query_refused")
        if self.session_owner and self.session_owner.session:
            jwt_token = self.session_owner.session.jwt_token
        try:
            result = self.sdk.read_report(definition, jwt_token=jwt_token, page=page, page_size=page_size, query_context=query_context)
        except AuthExpiredError:
            # Only an explicitly expired reused session may renew once. Fresh
            # login rejection/expiry does not cause another authentication loop.
            if not self.session_owner or self.transport.logins or self.transport.renewals or not self.transport.explicit_session_expired:
                raise
            self.session_owner.session = None
            session = self.sdk.login(*self.credentials)
            self.session_owner.accept(session)
            self.secrets.update((session.jwt_token, session.session_id))
            self.transport.renewals = 1
            result = self.sdk.read_report(definition, jwt_token=session.jwt_token, page=page, page_size=page_size, query_context=query_context)
        # The enclosing collector retains its original session object. Use the
        # owner's current token for subsequent pages after a bounded renewal.
        if result.total > (self.directory_row_limit if report == "6086103" else LIMITS["rowsPerReport"]):
            raise Refused("selected_source_row_limit")
        if report == "6087051":
            for row in result.rows:
                if identity(row.get("ExpContractNo")) != query_context["salesContractNo"]:
                    raise Refused("selected_source_query_refused")
                prefix = {"面料": "fabric", "辅料": "trim"}.get(row.get("lx"))
                inside = row.get("insideorderno")
                if prefix and isinstance(inside, str) and inside.strip():
                    for ref, suffix in (("cgmxid", "purchase_units"), ("rkmxid", "inbound_units")):
                        if row.get(ref): self.unit_lookups.add((prefix + "_" + suffix, inside.strip()))
        if report == "6086103":
            # The user excludes source images. Project before building evidence
            # fingerprints; keep every other field, and never fetch image URLs.
            result = replace(result, rows=[{key: value for key, value in row.items() if key != "ImageFile"}
                                           for row in result.rows])
            for row in result.rows:
                contract, inside = identity(row.get("BillNo")), row.get("InsideOrderNo")
                if contract in self.selected and isinstance(inside, str) and inside.strip():
                    self.lookup[contract] = inside.strip()
        return result


def collect_selected(data, transport=None, clock=monotonic, diagnostics=None, session_owner=None, catalog_progress=None, catalog_resume=None):
    """Injection is an internal testing seam, never an argv/stdin flag."""
    data = validate_input(data)
    if session_owner:
        session_owner.bind(data)
    if data.get("mode") not in MODES:
        raise ValueError("invalid_selected_scope")
    catalog = data["mode"] == "catalog-discovery"
    if (catalog_progress or catalog_resume) and not catalog:
        raise ValueError('invalid_catalog_checkpoint')
    from .catalog_checkpoint import validated_prefix
    prefix = validated_prefix(catalog_resume or [])
    underlying = transport or ProtectedTransport(LIMITS["responseBytes"])
    if diagnostics is not None:
        from .request_diagnostics import DiagnosticTransport
        underlying = DiagnosticTransport(underlying, diagnostics, clock)
    budget = BudgetTransport(data["baseUrl"], underlying, clock, CATALOG_LIMITS["reportRequests"] if catalog else 80)
    bounded = data["mode"] in ("bound-materials", "catalog-contracts")
    common = {"schemaVersion": "ainuoke-catalog-contracts.v1" if data["mode"] == "catalog-contracts" else "ainuoke-catalog-discovery.v1" if catalog else "ainuoke-bound-materials-once.v1" if bounded else "ainuoke-selected-source-once.v1",
              "mode": data["mode"], "limits": CATALOG_LIMITS if catalog else CATALOG_CONTRACT_LIMITS if data["mode"] == "catalog-contracts" else {**LIMITS, **({"contracts": 25} if bounded else {})},
              "sourceFingerprint": fingerprint(data), "selectedContracts": list(data["contracts"]),
              "databaseAccess": "none", "sourceActivation": "not-activated"}
    try:
        sdk = AinuokeClient(base_url=data["baseUrl"], transport=budget, network_retries=0,
                           timeout_seconds=CATALOG_REQUEST_TIMEOUT_SECONDS if data["mode"] in ("catalog-discovery", "catalog-contracts") else 15)
        client = BudgetClient(sdk, budget, data["contracts"], data["mode"], data.get("materialReport"), session_owner)
        engine = {**data}
        if data["mode"] == "catalog-discovery":
            engine["mode"] = "discovery"
        elif data["mode"] == "selected-bindings":
            engine["mode"] = "additions"
        else:
            engine.pop("mode")
        bundle = collect(engine, client, include_colors=data["mode"] == "catalog-contracts", material_report=engine.pop("materialReport", None),
                         catalog_progress=catalog_progress, catalog_resume=prefix)
        reject_secret_values(bundle, client.secrets)
        if sum(len(p["rows"]) for p in [*bundle["discoveryBefore"], *bundle["discoveryAfter"],
              *(p for key in ("colors", "materials") for pages in bundle.get(key, {}).values() for p in pages)]) > LIMITS["sourceRows"]:
            raise Refused("selected_source_row_limit")
        return {**common, "result": "complete", "code": None, "metrics": budget.metrics(), "bundle": bundle}
    except (Exception, KeyboardInterrupt) as error:
        if session_owner and isinstance(error, (InvalidCredentialError, AuthExpiredError, UpstreamSchemaError)):
            session_owner.stop()
        # HTTP can finish normally while the login payload explicitly refuses
        # access. Mark the semantic failure without retaining its message/token.
        if isinstance(error, InvalidCredentialError) and diagnostics and diagnostics[-1]["kind"] == "login":
            diagnostics[-1]["outcome"] = "auth_error"
        if isinstance(error, UpstreamSchemaError) and diagnostics and diagnostics[-1]["kind"] == "login":
            diagnostics[-1]["outcome"] = "schema_error"
        code = error.code if isinstance(error, Refused) else "invalid_credential" if isinstance(error, InvalidCredentialError) \
            else "auth_expired" if isinstance(error, AuthExpiredError) else "source_unavailable" if isinstance(error, NetworkAinuokeError) \
            else "selected_source_response_limit" if isinstance(error, UpstreamSchemaError) and str(error) == "response_limit" \
            else "selected_source_endpoint_refused" if isinstance(error, UpstreamSchemaError) and str(error) == "redirect_refused" \
            else "selected_source_invalid"
        return {**common, "result": "failed", "code": code if code in FAILURE_CODES else "selected_source_invalid",
                "metrics": budget.metrics(), "bundle": None}
