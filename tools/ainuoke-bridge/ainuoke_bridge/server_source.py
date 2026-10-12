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
    if not isinstance(data, dict) or set(data) not in ({"baseUrl", "username", "password", "contracts"}, {"baseUrl", "username", "password", "contracts", "mode"}):
        raise ValueError("invalid_collector_input")
    url = urlsplit(data["baseUrl"])
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("invalid_source_origin")
    if not url.hostname or not (url.scheme == "https" or url.scheme == "http" and url.hostname in ("127.0.0.1", "::1")):
        raise ValueError("protected_source_transport_required")
    for key in ("username", "password"):
        if not isinstance(data[key], str) or not data[key].strip() or len(data[key]) > 1024 or any(ord(c) < 32 for c in data[key]):
            raise ValueError("invalid_credentials")
    if "mode" in data and data["mode"] != "bindings":
        raise ValueError("invalid_mode")
    contracts = data["contracts"]
    if data.get("mode") == "bindings":
        if contracts != []:
            raise ValueError("binding_discovery_scope_required")
        return data
    if not isinstance(contracts, list) or not 1 <= len(contracts) <= 1000 or any(not isinstance(x, str) or not identity(x) or len(x) > 80 for x in contracts):
        raise ValueError("invalid_contract_scope")
    if len(set(map(identity, contracts))) != len(contracts):
        raise ValueError("duplicate_contract_scope")
    return data

def collect(data, client=None):
    data = validate_input(data)
    client = client or AinuokeClient(base_url=data["baseUrl"], transport=ProtectedTransport(), network_retries=1)
    session = client.login(data["username"], data["password"])
    renewals = 0
    total_rows = 0
    total_bytes = 0

    def pages(key, query):
        nonlocal session, renewals, total_rows, total_bytes
        result = []
        expected = None
        for index in range(1, 201):
            try:
                page = client.read_report(REPORT_CATALOG[key], jwt_token=session.jwt_token, page=index, page_size=50, query_context=query)
            except AuthExpiredError:
                if renewals >= 1:
                    raise
                renewals += 1
                session = client.login(data["username"], data["password"])
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
    if data.get("mode") == "bindings":
        colors = {key: pages("garment_color_size_details", {"salesContractNo": key}) for key in lookup}
        after = pages("order_discovery", {})
        return {"schemaVersion": "ainuoke-order-binding.v1", "discoveryBefore": before, "discoveryAfter": after, "colors": colors}
    materials = {}
    for contract in data["contracts"]:
        key = identity(contract)
        if key in lookup:
            materials[key] = pages("material_purchase_statistics", {"insideOrderNo": lookup[key]})
    after = pages("order_discovery", {})
    return {"schemaVersion": "ainuoke-server-source.v1", "discoveryBefore": before, "discoveryAfter": after, "materials": materials}

def main():
    # Error output is a closed vocabulary; never reflect exception, URL, response or credentials.
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("input_limit")
        result = collect(json.loads(raw))
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
    except Exception:
        sys.stdout.write('{"error":"source_invalid"}')
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
