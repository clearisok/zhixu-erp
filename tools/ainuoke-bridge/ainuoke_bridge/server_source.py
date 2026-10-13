"""Headless, fixed-catalog collector. Secrets arrive through stdin, never argv/env/logs.
Reuses the proven report/login client and snapshot contract; no Windows keyring,
HTTP listener, domain writer or scheduler. Invoked only by an explicit operator command.
"""
from __future__ import annotations
import json
import sys
import unicodedata
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from urllib.error import HTTPError, URLError
from .ainuoke_client import AinuokeClient, AuthExpiredError, InvalidCredentialError, NetworkAinuokeError, UpstreamSchemaError
from .contracts import REPORT_CATALOG, build_report_snapshot

MAX_BYTES = 32 * 1024 * 1024
APPROVED_HTTP_ORIGIN = "http://61.164.81.194:9043"
APPROVED_HTTP_POLICY = "user-approved-http-d109"

def identity(value):
    return "".join(unicodedata.normalize("NFKC", str(value or "")).strip().upper().split())

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class ProtectedTransport:
    """No redirects (including credential-bearing login GET); no ambient proxy."""
    def request(self, *, url, method, body, headers, timeout):
        from urllib.parse import urlencode
        data = None
        if method == "GET":
            url += "?" + urlencode(body)
        else:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers = {**headers, "Content-Type": "application/json;charset=utf-8"}
        try:
            with build_opener(NoRedirect(), ProxyHandler({})).open(Request(url, data=data, method=method, headers=headers), timeout=timeout) as response:
                raw = response.read(MAX_BYTES + 1)
        except HTTPError as error:
            error.close()
            if error.code in (401, 403):
                raise AuthExpiredError("auth_expired") from None
            if 300 <= error.code < 400:
                raise UpstreamSchemaError("redirect_refused") from None
            raise NetworkAinuokeError("upstream_http_error") from None
        except (URLError, TimeoutError, OSError):
            raise NetworkAinuokeError("network_unavailable") from None
        if len(raw) > MAX_BYTES:
            raise UpstreamSchemaError("response_limit")
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise UpstreamSchemaError("invalid_json") from None
        if not isinstance(result, dict):
            raise UpstreamSchemaError("invalid_json")
        return result

def validate_input(data):
    required = {"baseUrl", "username", "password", "contracts"}
    target_keys = {"targetSalesContractNo", "targetPurchaseOrderNo", "expectedQuantities", "additionalSalesContracts"}
    if not isinstance(data, dict) or not required <= set(data) <= required | {"mode", "transportPolicy"} | target_keys:
        raise ValueError("invalid_collector_input")
    url = urlsplit(data["baseUrl"])
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("invalid_source_origin")
    approved_http = data.get("transportPolicy") == APPROVED_HTTP_POLICY and data["baseUrl"] in (APPROVED_HTTP_ORIGIN, APPROVED_HTTP_ORIGIN + "/")
    if "transportPolicy" in data and not approved_http:
        raise ValueError("http_approval_target_mismatch")
    if not url.hostname or not (url.scheme == "https" or url.scheme == "http" and url.hostname in ("127.0.0.1", "::1") or approved_http):
        raise ValueError("protected_source_transport_required")
    for key in ("username", "password"):
        if not isinstance(data[key], str) or not data[key].strip() or len(data[key]) > 1024 or any(ord(c) < 32 for c in data[key]):
            raise ValueError("invalid_credentials")
    if "mode" in data and data["mode"] not in ("bindings", "probe", "audit", "targeted", "discovery", "additions"):
        raise ValueError("invalid_mode")
    if data.get("mode") == "targeted":
        if not target_keys <= set(data) or data["contracts"] != []:
            raise ValueError("invalid_target_scope")
        sales = data["targetSalesContractNo"]
        purchase = data["targetPurchaseOrderNo"]
        additional = data["additionalSalesContracts"]
        expected = data["expectedQuantities"]
        if (not isinstance(sales, str) or not identity(sales) or len(sales) > 80
                or not isinstance(purchase, str) or not identity(purchase) or len(purchase) > 80
                or not isinstance(additional, list) or len(additional) > 2
                or any(not isinstance(x, str) or not identity(x) or len(x) > 80 for x in additional)
                or len({identity(x) for x in [sales, *additional]}) != 1 + len(additional)
                or not isinstance(expected, list) or len(expected) != 3
                or any(type(x) is not int or x <= 0 or x > 100000000 for x in expected)):
            raise ValueError("invalid_target_scope")
        return data
    if set(data) & target_keys:
        raise ValueError("invalid_target_scope")
    contracts = data["contracts"]
    if data.get("mode") in ("bindings", "probe", "audit", "discovery"):
        if contracts != []:
            raise ValueError("binding_discovery_scope_required")
        return data
    if not isinstance(contracts, list) or not 1 <= len(contracts) <= 1000 or any(not isinstance(x, str) or not identity(x) or len(x) > 80 for x in contracts):
        raise ValueError("invalid_contract_scope")
    if len(set(map(identity, contracts))) != len(contracts):
        raise ValueError("duplicate_contract_scope")
    if data.get("mode") == "additions" and len(contracts) > 25:
        raise ValueError("addition_scope_limit")
    return data

def collect(data, client=None):
    data = validate_input(data)
    client = client or AinuokeClient(base_url=data["baseUrl"], transport=ProtectedTransport(), network_retries=0 if data.get("mode") in ("probe", "audit", "targeted") else 1)
    session = client.login(data["username"], data["password"])
    if data.get("mode") == "probe":
        return probe_first_pages(client, session)
    renewals = 0
    total_rows = 0
    total_bytes = 0
    requests = 0

    def pages(key, query):
        nonlocal session, renewals, total_rows, total_bytes, requests
        result = []
        expected = None
        for index in range(1, 201):
            requests += 1
            if data.get("mode") in ("audit", "targeted"):
                if requests > (80 if data.get("mode") == "targeted" else 2000):
                    raise UpstreamSchemaError("request_limit")
                from time import sleep
                sleep(0.1)
            try:
                page = client.read_report(REPORT_CATALOG[key], jwt_token=session.jwt_token, page=index, page_size=50, query_context=query)
            except AuthExpiredError:
                if renewals >= 1:
                    raise
                renewals += 1
                session = client.login(data["username"], data["password"])
                if data.get("mode") in ("audit", "targeted"):
                    requests += 1
                    if requests > (80 if data.get("mode") == "targeted" else 2000):
                        raise UpstreamSchemaError("request_limit")
                page = client.read_report(REPORT_CATALOG[key], jwt_token=session.jwt_token, page=index, page_size=50, query_context=query)
            if expected is None:
                expected = page.total
            if page.total != expected or len(page.rows) > 50 or page.page_index != index or page.page_size != 50:
                raise UpstreamSchemaError("inconsistent_paging")
            remaining = max(0, expected - 50 * (index - 1))
            if len(page.rows) != min(50, remaining):
                raise UpstreamSchemaError("incomplete_paging")
            total_rows += len(page.rows)
            if total_rows > 100000:
                raise UpstreamSchemaError("source_limit")
            snapshot = build_report_snapshot(report_key=key, rows=page.rows, page=index, page_size=50, total=expected, query_context=query).to_dict()
            total_bytes += len(json.dumps(snapshot, ensure_ascii=False, allow_nan=False).encode("utf-8"))
            if total_bytes > MAX_BYTES:
                raise UpstreamSchemaError("source_limit")
            result.append(snapshot)
            if index * 50 >= expected:
                return result
        raise UpstreamSchemaError("page_limit")

    before = pages("order_discovery", {})
    lookup = {}
    for page in before:
        for row in page["rows"]:
            key = identity(row["values"].get("BillNo"))
            inside = row["values"].get("InsideOrderNo")
            if not key or key in lookup or not isinstance(inside, str) or not inside.strip():
                raise UpstreamSchemaError("invalid_discovery_identity")
            lookup[key] = inside.strip()
    if len(lookup) > 1000:
        raise UpstreamSchemaError("source_limit")
    if data.get("mode") == "targeted":
        selected = [identity(data["targetSalesContractNo"]), *map(identity, data["additionalSalesContracts"])]
        if any(key not in lookup for key in selected):
            raise UpstreamSchemaError("target_not_visible")
        materials = {key: pages("material_purchase_statistics", {"insideOrderNo": lookup[key]}) for key in selected}
        return {"schemaVersion": "ainuoke-targeted-diagnostic.v1", "discovery": before,
                "materials": materials, "targetSalesContractNo": selected[0],
                "targetPurchaseOrderNo": identity(data["targetPurchaseOrderNo"]),
                "expectedQuantities": data["expectedQuantities"], "reportRequests": requests,
                "authRenewals": renewals}
    if data.get("mode") == "audit":
        keys = sorted(lookup, key=lambda key: key.encode("utf-16-be"))
        count = min(80, len(keys))
        selected = keys if count < 2 else [keys[i * (len(keys) - 1) // (count - 1)] for i in range(count)]
        materials = {key: pages("material_purchase_statistics", {"insideOrderNo": lookup[key]}) for key in selected}
        after = pages("order_discovery", {})
        return {"schemaVersion": "ainuoke-readonly-audit.v1", "discoveryBefore": before,
                "discoveryAfter": after, "materials": materials,
                "selection": {"strategy": "sorted-contract-even-spread-v1", "maximumContracts": 80},
                "reportRequests": requests}
    if data.get("mode") == "bindings":
        colors = {key: pages("garment_color_size_details", {"salesContractNo": key}) for key in lookup}
        after = pages("order_discovery", {})
        return {"schemaVersion": "ainuoke-order-binding.v1", "discoveryBefore": before, "discoveryAfter": after, "colors": colors}
    if data.get("mode") == "discovery":
        after = pages("order_discovery", {})
        return {"schemaVersion": "ainuoke-order-addition-discovery.v1", "discoveryBefore": before, "discoveryAfter": after}
    if data.get("mode") == "additions":
        selected = [identity(contract) for contract in data["contracts"]]
        if any(key not in lookup for key in selected):
            raise UpstreamSchemaError("target_not_visible")
        colors = {key: pages("garment_color_size_details", {"salesContractNo": key}) for key in selected}
        after = pages("order_discovery", {})
        return {"schemaVersion": "ainuoke-order-addition.v1", "discoveryBefore": before,
                "discoveryAfter": after, "colors": colors}
    materials = {}
    for contract in data["contracts"]:
        key = identity(contract)
        if key in lookup:
            materials[key] = pages("material_purchase_statistics", {"insideOrderNo": lookup[key]})
    after = pages("order_discovery", {})
    return {"schemaVersion": "ainuoke-server-source.v1", "discoveryBefore": before, "discoveryAfter": after, "materials": materials}


def probe_first_pages(client, session):
    """One login and at most three fixed first-page reads; no raw values escape.

    This checks connection/report readability only. It is deliberately not a
    complete discovery, business validation, binding or source activation.
    """
    reports = []

    def first(key, query):
        definition = REPORT_CATALOG[key]
        page = client.read_report(definition, jwt_token=session.jwt_token, page=1, page_size=50, query_context=query)
        if (type(page.total) is not int or page.total < 0 or page.page_index != 1
                or page.page_size != 50 or len(page.rows) != min(50, page.total)):
            raise UpstreamSchemaError("incomplete_probe_page")
        reports.append({"reportId": int(definition.report_id), "status": "readable",
                        "returnedRows": len(page.rows), "totalRows": page.total,
                        "complete": page.total == len(page.rows)})
        return page.rows

    rows = first("order_discovery", {})
    if rows:
        contract, inside = rows[0].get("BillNo"), rows[0].get("InsideOrderNo")
        if not isinstance(contract, str) or not contract.strip() or not isinstance(inside, str) or not inside.strip():
            raise UpstreamSchemaError("invalid_probe_identity")
        first("garment_color_size_details", {"salesContractNo": contract.strip()})
        first("material_purchase_statistics", {"insideOrderNo": inside.strip()})
    else:
        reports.extend({"reportId": report_id, "status": "not-probed", "returnedRows": None,
                        "totalRows": None, "complete": False} for report_id in (6087105, 6087050))
    return {"schemaVersion": "ainuoke-connection-probe.v1", "authenticated": True,
            "scope": "first-visible-contract-first-pages-only", "reports": reports}

def read_input(args):
    if args in (["--interactive-approved-http"], ["--interactive-readonly-audit"], ["--interactive-targeted-diagnostic"]):
        # Private local terminal only: no password argv/env/file or credential-store reuse.
        import getpass
        import warnings
        if not sys.stdin.isatty():
            raise ValueError("private_terminal_required")
        scope = {}
        if args == ["--interactive-targeted-diagnostic"]:
            from pathlib import Path
            root = Path(__file__).resolve().parents[3]
            request = root / "outputs" / "ainuoke-targeted-request.json"
            if request.is_symlink() or not request.is_file() or request.stat().st_size > 2048:
                raise ValueError("invalid_private_request")
            scope = json.loads(request.read_text(encoding="utf-8"))
            if not isinstance(scope, dict) or set(scope) != {"targetSalesContractNo", "targetPurchaseOrderNo", "expectedQuantities", "additionalSalesContracts"}:
                raise ValueError("invalid_private_request")
        username = input("Ainuoke username: ")
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            password = getpass.getpass("Ainuoke password (hidden, not saved): ")
        return {"baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY, **scope,
                "username": username, "password": password, "contracts": [],
                "mode": "audit" if args == ["--interactive-readonly-audit"] else "targeted" if args == ["--interactive-targeted-diagnostic"] else "probe"}
    if args:
        raise ValueError("invalid_arguments")
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError("input_limit")
    return json.loads(raw)


def main():
    # Error output is a closed vocabulary; never reflect exception, URL, response or credentials.
    try:
        args = sys.argv[1:]
        data = read_input(args)
        if args:
            import subprocess
            audit = data["mode"] == "audit"
            targeted = data["mode"] == "targeted"
            try:
                child = subprocess.run([sys.executable, "-m", "ainuoke_bridge.server_source"],
                                       input=json.dumps(data).encode("utf-8"), capture_output=True, timeout=900 if audit else 600 if targeted else 90)
            except subprocess.TimeoutExpired:
                raise NetworkAinuokeError("source_timeout") from None
            result = json.loads(child.stdout)
            if child.returncode != 0:
                error_class = {"invalid_credential": InvalidCredentialError, "auth_expired": AuthExpiredError,
                               "source_unavailable": NetworkAinuokeError}.get(result.get("error"), UpstreamSchemaError)
                raise error_class("source_probe_failed")
            if audit or targeted:
                # Existing TypeScript projection is the single business mapping authority.
                # Only source snapshots, never credentials, enter this offline analyzer.
                from pathlib import Path
                root = Path(__file__).resolve().parents[3]
                analyzer = "targeted-diagnostic.ts" if targeted else "readonly-audit.ts"
                analysis = subprocess.run(["node", "--import", "tsx", "server/ainuoke-source/" + analyzer, "--analyze-stdin"],
                                          input=json.dumps(result).encode("utf-8"), capture_output=True, timeout=90, cwd=root)
                if analysis.returncode != 0:
                    raise UpstreamSchemaError("audit_analysis_failed")
                result = json.loads(analysis.stdout)
        else:
            result = collect(data)
        if args and data["mode"] == "probe":
            result = {"result": "READ_ONLY_CONNECTION_PROBED", "transport": "user-approved-plaintext-http",
                      "sourceActivation": "not-activated", "businessValidation": "not-performed",
                      "operatorAuthorization": "not-checked", **result}
        output = json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(output) > MAX_BYTES:
            raise ValueError("output_limit")
        sys.stdout.buffer.write(output)
    except InvalidCredentialError:
        sys.stdout.write('{"error":"invalid_credential"}')
        return 1
    except AuthExpiredError:
        sys.stdout.write('{"error":"auth_expired"}')
        return 1
    except NetworkAinuokeError:
        sys.stdout.write('{"error":"source_unavailable"}')
        return 1
    except (Exception, KeyboardInterrupt):
        sys.stdout.write('{"error":"source_invalid"}')
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
