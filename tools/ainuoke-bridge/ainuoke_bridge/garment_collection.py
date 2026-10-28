"""One verified contract, two complete first pages. No CLI/catalog/activation.

This private worker is invoked only after the Node owner has committed started.
Its ceilings are engineering limits, not permission to query a real account.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from hashlib import sha256
from time import monotonic

from .ainuoke_client import AinuokeClient, UpstreamSchemaError
from .contracts import build_report_request
from .garment_report_screening import DEFINITION, screen
from .garment_shipment_observations import extract_garment_observation_page
from .payment_request_observations import strict_json
from .payment_request_contract_probe import fingerprint
from .payment_request_probe import BoundedPaymentTransport, FAILURE_CODES
from .server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY

ACTION = "collect-verified-garment-contract-once"
SCHEMA = "ainuoke-garment-collection-worker.v1"
LIMIT_BYTES = 8 * 1024 * 1024
EXTRA_CODES = frozenset({
    "garment_collection_input_invalid", "garment_collection_scope_refused", "garment_collection_account_mismatch",
    "garment_collection_sequence_refused", "garment_collection_deadline", "garment_collection_response_limit",
    "garment_collection_raw_missing", "garment_collection_failed", "garment_collection_pagination_unverified", "shipment_observation_invalid_capture",
    "shipment_observation_scope_mismatch", "shipment_observation_report_mismatch", "shipment_observation_page_mismatch",
    "shipment_observation_count_mismatch", "shipment_observation_invalid_rows", "shipment_observation_exact_contract_rows_required",
    "shipment_observation_invalid_raw_response", "garment_filter_structure_limit", "payment_observation_duplicate_json_key",
    "payment_observation_invalid_json", "payment_observation_invalid_shape", "payment_observation_invalid_count",
})


def fail(code):
    raise UpstreamSchemaError(code)


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {"baseUrl", "transportPolicy", "username", "password", "action", "scope"}
            or value["baseUrl"] != APPROVED_HTTP_ORIGIN or value["transportPolicy"] != APPROVED_HTTP_POLICY
            or value["action"] != ACTION):
        fail("garment_collection_scope_refused")
    for key in ("username", "password"):
        text = value[key]
        if not isinstance(text, str) or not text.strip() or len(text) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in text):
            fail("garment_collection_input_invalid")
    scope = value["scope"]
    if (not isinstance(scope, dict) or set(scope) != {"sourceFingerprint", "salesContractNo"}
            or not isinstance(scope["sourceFingerprint"], str) or not re.fullmatch(r"[a-f0-9]{64}", scope["sourceFingerprint"])
            or not isinstance(scope["salesContractNo"], str) or not re.fullmatch(r"[A-Z0-9][A-Z0-9/._-]{0,79}", scope["salesContractNo"])):
        fail("garment_collection_scope_refused")
    if scope["sourceFingerprint"] != fingerprint(value["baseUrl"], value["username"]):
        fail("garment_collection_account_mismatch")
    return value


class GarmentCollectionTransport(BoundedPaymentTransport):
    MAX_HTTP_ATTEMPTS = 3
    MAX_REPORT_REQUESTS = 2

    def __init__(self):
        super().__init__()
        self.scope = None
        self.deadline = monotonic() + 180
        self.total_report_bytes = 0
        self.stopped = False

    def report_body_allowed(self, body):
        return (not self.stopped and self.scope is not None and self.http_attempts == self.report_requests + 1
                and self.report_requests < 2 and body == build_report_request(DEFINITION, page=1, page_size=100,
                    query_context={"salesContractNo": self.scope["salesContractNo"]}))

    def response_byte_limit(self, is_report):
        return min(4 * 1024 * 1024, LIMIT_BYTES - self.total_report_bytes) if is_report else 4 * 1024 * 1024

    def request(self, **kwargs):
        if (self.stopped or kwargs["method"] == "GET" and self.http_attempts != 0
                or kwargs["method"] == "POST" and not self.report_body_allowed(kwargs["body"])):
            self.stopped = True
            fail("garment_collection_sequence_refused")
        remaining = self.deadline - monotonic()
        if remaining <= 0:
            self.stopped = True
            fail("garment_collection_deadline")
        try:
            result = super().request(**{**kwargs, "timeout": min(kwargs["timeout"], remaining)})
            if kwargs["method"] == "POST":
                self.total_report_bytes += len(self.last_report_text.encode("utf-8"))
                if self.total_report_bytes > LIMIT_BYTES:
                    fail("garment_collection_response_limit")
            if monotonic() > self.deadline:
                fail("garment_collection_deadline")
            return result
        except Exception:
            self.stopped = True
            raise


def collect(value, transport=None):
    value = validate_input(value)
    transport = transport or GarmentCollectionTransport()
    transport.scope = dict(value["scope"])
    client = AinuokeClient(base_url=value["baseUrl"], transport=transport, network_retries=0, timeout_seconds=15)
    session = client.login(value["username"], value["password"])
    captures = []
    for _pass in (1, 2):
        client.read_report(DEFINITION, jwt_token=session.jwt_token, page=1, page_size=100,
                           query_context={"salesContractNo": value["scope"]["salesContractNo"]})
        raw = transport.last_report_text
        if not isinstance(raw, str) or transport.last_report_request_number != _pass:
            fail("garment_collection_raw_missing")
        screen(strict_json(raw), (value["password"], session.jwt_token, session.session_id))
        capture = {"schemaVersion": "ainuoke-garment-shipment-capture.v1", "reportId": "6086979",
                   **value["scope"], "queryContext": {"match": "exact", "salesContractNo": value["scope"]["salesContractNo"]},
                   "capturedAt": datetime.now(timezone.utc).isoformat(), "page": 1, "pageSize": 100,
                   "rawResponseSha256": sha256(raw.encode("utf-8")).hexdigest(), "rawReportResponse": raw}
        del capture["salesContractNo"]
        # Formal pages require exact metadata. Zero sentinels from diagnostic
        # endpoints are never silently changed into page 1 / size 100.
        checked = extract_garment_observation_page(capture)
        if checked["reportedTotal"] > 100:
            fail("garment_collection_pagination_unverified")
        captures.append(capture)
    if transport.http_attempts != 3 or transport.report_requests != 2:
        fail("garment_collection_sequence_refused")
    return {"schemaVersion": SCHEMA, "result": "complete", "captures": captures,
            "counts": {"httpAttempts": 3, "reportRequests": 2}}


def safe_failure(error, transport):
    candidate = error.args[0] if error.args else None
    allowed = FAILURE_CODES | EXTRA_CODES
    code = candidate if isinstance(candidate, str) and candidate in allowed else "garment_collection_failed"
    return {"schemaVersion": SCHEMA, "result": "failed", "code": code,
            "counts": {"httpAttempts": transport.http_attempts, "reportRequests": transport.report_requests}}


def main():
    transport = GarmentCollectionTransport()
    try:
        if sys.argv[1:] != ["--stdin-request"]:
            fail("garment_collection_scope_refused")
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            fail("garment_collection_input_invalid")
        result = collect(strict_json(raw.decode("utf-8")), transport)
        print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
        return 0
    except Exception as error:
        print(json.dumps(safe_failure(error, transport), ensure_ascii=True, allow_nan=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
