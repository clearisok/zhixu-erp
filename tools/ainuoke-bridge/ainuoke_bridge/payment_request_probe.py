"""Operator-only 6086941 first-page evidence. No catalog registration or domain writes."""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Mapping, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import ProxyHandler, Request, build_opener

from .ainuoke_client import AinuokeClient, AuthExpiredError, InvalidCredentialError, NetworkAinuokeError, UpstreamSchemaError
from .contracts import ReportDefinition, ReportKey, build_report_request
from .security import contains_secret_field
from .server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, NoRedirect

SCHEMA = "ainuoke-payment-page-evidence.v1"
REPORT_ID = "6086941"
PAGE_SIZE = 100
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
# Deliberately absent from REPORT_CATALOG: neither Bridge nor continuous Source may read it.
DEFINITION = ReportDefinition(key=cast(ReportKey, "payment_request_first_page"), report_id=REPORT_ID,
                              label="面辅料货款申请明细（首页诊断）", future_consumer="private diagnostic only", query_kind="empty")


def validate_input(data):
    if not isinstance(data, dict) or set(data) != {"baseUrl", "username", "password", "transportPolicy", "action"}:
        raise ValueError("invalid_payment_probe_input")
    if data["baseUrl"] != APPROVED_HTTP_ORIGIN or data["transportPolicy"] != APPROVED_HTTP_POLICY:
        raise ValueError("payment_probe_origin_not_approved")
    if data["action"] != "read-first-page-only":
        raise ValueError("payment_probe_explicit_action_required")
    for key in ("username", "password"):
        value = data[key]
        if not isinstance(value, str) or not value.strip() or len(value) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError("invalid_payment_probe_credentials")
    return data


class BoundedPaymentTransport:
    """Same proven endpoint/login contract; fixed scope, no proxy/redirect/retry, bounded bytes."""
    def __init__(self):
        self.http_attempts = 0
        self.report_requests = 0
        self.last_report_text = None
        self.last_report_request_number = 0
        self.phase = "not-started"

    MAX_HTTP_ATTEMPTS = 2
    MAX_REPORT_REQUESTS = 1

    def report_body_allowed(self, body):
        return body == build_report_request(DEFINITION, page=1, page_size=PAGE_SIZE, query_context={})

    def response_byte_limit(self, is_report):
        return MAX_RESPONSE_BYTES

    def request(self, *, url, method, body, headers, timeout):
        login_url = urljoin(APPROVED_HTTP_ORIGIN + "/", AinuokeClient.LOGIN_PATH.lstrip("/"))
        report_url = urljoin(APPROVED_HTTP_ORIGIN + "/", AinuokeClient.REPORT_PATH.lstrip("/"))
        is_report = method == "POST" and url == report_url
        if not (method == "GET" and url == login_url or is_report):
            raise UpstreamSchemaError("payment_probe_endpoint_refused")
        if is_report and not self.report_body_allowed(body):
            raise UpstreamSchemaError("payment_probe_scope_refused")
        if self.http_attempts >= self.MAX_HTTP_ATTEMPTS or is_report and self.report_requests >= self.MAX_REPORT_REQUESTS:
            raise UpstreamSchemaError("payment_probe_request_limit")
        response_limit = self.response_byte_limit(is_report)
        if response_limit < 1:
            raise UpstreamSchemaError("payment_probe_response_limit")
        self.phase = "report" if is_report else "login"
        self.http_attempts += 1
        self.report_requests += int(is_report)
        data = None
        if method == "GET":
            url += "?" + urlencode(body)
        else:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers = {**headers, "Content-Type": "application/json;charset=utf-8"}
        try:
            with build_opener(NoRedirect(), ProxyHandler({})).open(Request(url, data=data, method=method, headers=headers), timeout=min(timeout, 15)) as response:
                raw = response.read(response_limit + 1)
        except HTTPError as error:
            error.close()
            if error.code in (401, 403):
                raise AuthExpiredError("auth_expired") from None
            if 300 <= error.code < 400:
                raise UpstreamSchemaError("redirect_refused") from None
            raise NetworkAinuokeError("upstream_http_error") from None
        except (URLError, TimeoutError, OSError):
            raise NetworkAinuokeError("network_unavailable") from None
        if len(raw) > response_limit:
            raise UpstreamSchemaError("payment_probe_response_limit")
        try:
            text = raw.decode("utf-8")
            result = json.loads(text)
        except (ValueError, UnicodeDecodeError):
            raise UpstreamSchemaError("payment_probe_invalid_json") from None
        if not isinstance(result, Mapping):
            raise UpstreamSchemaError("payment_probe_invalid_json")
        if is_report:
            self.last_report_text = text
            self.last_report_request_number = self.report_requests
        return result


def decoded_object(value, *, optional=False):
    if value is None and optional:
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, RecursionError):
            raise UpstreamSchemaError("payment_probe_invalid_metadata") from None
    if not isinstance(value, Mapping):
        raise UpstreamSchemaError("payment_probe_invalid_metadata")
    return value



def report_metadata(value):
    # Optional metadata may be omitted/blank, or JSON-encoded by the report API.
    # Normalize only its representation; retain the original response unchanged.
    if value is None or isinstance(value, str) and not value.strip():
        return None
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, RecursionError):
            raise UpstreamSchemaError("payment_probe_report_metadata_invalid_json") from None
    if not isinstance(value, Mapping):
        raise UpstreamSchemaError("payment_probe_report_metadata_shape")
    result = dict(value)
    columns = result.get("cellList")
    if isinstance(columns, str):
        if not columns.strip():
            columns = None
        else:
            try:
                columns = json.loads(columns)
            except (ValueError, RecursionError):
                raise UpstreamSchemaError("payment_probe_column_metadata_invalid_json") from None
    if columns is not None and not isinstance(columns, list):
        raise UpstreamSchemaError("payment_probe_column_metadata_shape")
    if "cellList" in result:
        result["cellList"] = columns
    return result


def reject_reflected_secrets(value: Any, secrets, depth=0):
    if depth > 16:
        raise UpstreamSchemaError("payment_probe_structure_limit")
    if isinstance(value, Mapping):
        if contains_secret_field(value):
            raise UpstreamSchemaError("payment_probe_secret_field")
        for child in value.values():
            reject_reflected_secrets(child, secrets, depth + 1)
    elif isinstance(value, list):
        for child in value:
            reject_reflected_secrets(child, secrets, depth + 1)
    elif isinstance(value, str):
        if any(secret and secret in value for secret in secrets):
            raise UpstreamSchemaError("payment_probe_secret_reflection")
    elif isinstance(value, float) and not math.isfinite(value):
        raise UpstreamSchemaError("payment_probe_invalid_number")


def probe(data, transport=None):
    data = validate_input(data)
    transport = transport or BoundedPaymentTransport()
    client = AinuokeClient(base_url=data["baseUrl"], transport=transport, network_retries=0, timeout_seconds=15)
    transport.phase = "login"
    session = client.login(data["username"], data["password"])
    transport.phase = "report"
    page = client.read_report(DEFINITION, jwt_token=session.jwt_token, page=1, page_size=PAGE_SIZE, query_context={})
    transport.phase = "validation"
    if len(page.rows) > PAGE_SIZE or len(page.rows) > page.total:
        raise UpstreamSchemaError("payment_probe_page_limit")
    raw_text = transport.last_report_text
    if not isinstance(raw_text, str) or len(raw_text.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise UpstreamSchemaError("payment_probe_raw_evidence_missing")
    raw = decoded_object(raw_text)
    parsed_data = decoded_object(raw.get("dataList"))
    report = report_metadata(raw.get("reportObj"))
    for container in (raw, report):
        if container is not None and "reportId" in container and str(container["reportId"]) != REPORT_ID:
            raise UpstreamSchemaError("payment_probe_report_mismatch")
    secrets = (data["password"], session.jwt_token, session.session_id)
    # Check the decoded rows/metadata too: JSON strings must not hide forbidden fields.
    for value in (raw, parsed_data, report):
        if value is not None:
            reject_reflected_secrets(value, secrets)
    if transport.http_attempts != 2 or transport.report_requests != 1:
        raise UpstreamSchemaError("payment_probe_request_limit")
    return {"schemaVersion": SCHEMA, "reportId": REPORT_ID, "page": 1, "pageSize": PAGE_SIZE,
            "reportedTotal": page.total, "returnedRows": len(page.rows),
            "fetchedAt": datetime.now(timezone.utc).isoformat(), "httpAttempts": 2, "reportRequests": 1,
            "rawResponseSha256": sha256(raw_text.encode("utf-8")).hexdigest(), "rawReportResponse": raw_text}


FAILURE_CODES = frozenset({
    "invalid_payment_probe_input", "payment_probe_origin_not_approved", "payment_probe_explicit_action_required",
    "invalid_payment_probe_credentials", "payment_probe_endpoint_refused", "payment_probe_scope_refused",
    "payment_probe_request_limit", "payment_probe_response_limit", "payment_probe_invalid_json",
    "payment_probe_invalid_metadata", "payment_probe_structure_limit", "payment_probe_secret_field",
    "payment_probe_secret_reflection", "payment_probe_invalid_number", "payment_probe_page_limit",
    "payment_probe_raw_evidence_missing", "payment_probe_report_mismatch", "redirect_refused",
    "payment_probe_report_metadata_invalid_json", "payment_probe_report_metadata_shape", "payment_probe_column_metadata_invalid_json", "payment_probe_column_metadata_shape",
    "auth_expired", "invalid_credential", "network_unavailable", "upstream_http_error", "upstream_schema_error",
})
def safe_failure(error, transport):
    # Exception text is never forwarded unless it is exactly a static code from this module.
    candidate = error.args[0] if error.args else None
    code = candidate if isinstance(candidate, str) and candidate in FAILURE_CODES else getattr(error, "code", "payment_probe_failed")
    if not isinstance(code, str) or code not in FAILURE_CODES:
        code = "payment_probe_failed"
    phase = getattr(transport, "phase", "not-started")
    if phase not in {"not-started", "login", "report", "validation"}:
        phase = "not-started"
    return {"schemaVersion": "ainuoke-payment-page-failure.v1", "code": code, "workerStage": phase,
            "httpAttempts": transport.http_attempts, "reportRequests": transport.report_requests}


def main():
    transport = BoundedPaymentTransport()
    try:
        if sys.argv[1:] != ["--stdin-request"]:
            raise ValueError("payment_probe_explicit_action_required")
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("invalid_payment_probe_input")
        result = probe(json.loads(raw.decode("utf-8")), transport)
        # ASCII JSON is stable even when Windows pipes default to GBK. Decoding
        # restores the exact Unicode raw response; its original UTF-8 hash is unchanged.
        print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
    except Exception as error:
        print(json.dumps(safe_failure(error, transport)))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
