"""Fixed 6086979 / D1933 first-page candidate evidence; not a source catalog entry."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from hashlib import sha256
from typing import Mapping, cast

from .ainuoke_client import AinuokeClient, UpstreamSchemaError
from .contracts import ReportDefinition, ReportKey, build_report_request
from .garment_contract_verification import screen as screen_garment_report
from .payment_request_observations import PaymentObservationError
from .payment_request_probe import (
    BoundedPaymentTransport, MAX_RESPONSE_BYTES, FAILURE_CODES as BASE_FAILURE_CODES,
    report_metadata, safe_failure as base_safe_failure,
    validate_input as base_validate_input,
)

REPORT_ID = "6086979"
PAGE_SIZE = 100
ACTION = "read-6086979-d1933-first-page-only"
QUERY = {"insideOrderNo": "D1933"}
SCHEMA = "ainuoke-garment-shipment-candidate-page.v1"
DEFINITION = ReportDefinition(
    key=cast(ReportKey, "garment_shipment_candidate"), report_id=REPORT_ID,
    label="6086979候选报表（固定首页诊断）", future_consumer="private diagnostic only",
    query_kind="inside_order", query_field="insideorderno", query_compare_type="contains", query_flow_name="[内层]",
)


def request_body():
    return build_report_request(DEFINITION, page=1, page_size=PAGE_SIZE, query_context=QUERY)


class BoundedGarmentShipmentTransport(BoundedPaymentTransport):
    def report_body_allowed(self, body):
        return body == request_body()


def validate_input(data):
    if not isinstance(data, dict) or data.get("action") != ACTION:
        raise ValueError("shipment_probe_explicit_action_required")
    # Reuse proven origin, credential and exact-key validation without widening its own action.
    return base_validate_input({**data, "action": "read-first-page-only"})


def _pairs(values):
    result = {}
    for key, value in values:
        if key in result:
            raise UpstreamSchemaError("shipment_probe_duplicate_json_key")
        result[key] = value
    return result


def strict_json(value):
    try:
        return json.loads(value, object_pairs_hook=_pairs)
    except (ValueError, RecursionError):
        raise UpstreamSchemaError("shipment_probe_invalid_json") from None


def object_value(value):
    value = strict_json(value) if isinstance(value, str) else value
    if not isinstance(value, Mapping):
        raise UpstreamSchemaError("shipment_probe_invalid_evidence")
    return value


def probe(data, transport=None):
    data = validate_input(data)
    transport = transport or BoundedGarmentShipmentTransport()
    client = AinuokeClient(base_url=data["baseUrl"], transport=transport, network_retries=0, timeout_seconds=15)
    transport.phase = "login"
    session = client.login(data["username"], data["password"])
    transport.phase = "report"
    page = client.read_report(DEFINITION, jwt_token=session.jwt_token, page=1, page_size=PAGE_SIZE, query_context=QUERY)
    transport.phase = "validation"
    raw_text = transport.last_report_text
    if not isinstance(raw_text, str) or len(raw_text.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise UpstreamSchemaError("shipment_probe_invalid_evidence")
    raw = object_value(raw_text)
    rows = object_value(raw.get("dataList"))
    meta_value = raw.get("reportObj")
    if isinstance(meta_value, str) and meta_value.strip():
        meta_value = object_value(meta_value)
    if isinstance(meta_value, Mapping) and isinstance(meta_value.get("cellList"), str) and meta_value["cellList"].strip():
        meta_value = {**meta_value, "cellList": strict_json(meta_value["cellList"])}
    metadata = report_metadata(meta_value)
    for container in (raw, metadata):
        if container is not None and "reportId" in container and str(container["reportId"]) != REPORT_ID:
            raise UpstreamSchemaError("shipment_probe_report_mismatch")
    for value in (raw, rows, metadata):
        if value is not None:
            try:
                screen_garment_report(value, (data["password"], session.jwt_token, session.session_id))
            except PaymentObservationError as error:
                code = {"payment_observation_duplicate_json_key": "shipment_probe_duplicate_json_key",
                        "payment_observation_invalid_json": "shipment_probe_invalid_json"}.get(
                            error.args[0] if error.args else None, "shipment_probe_invalid_evidence")
                raise UpstreamSchemaError(code) from None
    if (len(page.rows) > PAGE_SIZE or len(page.rows) > page.total
            or transport.http_attempts != 2 or transport.report_requests != 1):
        raise UpstreamSchemaError("shipment_probe_invalid_evidence")
    return {"schemaVersion": SCHEMA, "reportId": REPORT_ID, "queryContext": dict(QUERY),
            "page": 1, "pageSize": PAGE_SIZE, "reportedTotal": page.total, "returnedRows": len(page.rows),
            "fetchedAt": datetime.now(timezone.utc).isoformat(), "httpAttempts": 2, "reportRequests": 1,
            "rawResponseSha256": sha256(raw_text.encode("utf-8")).hexdigest(), "rawReportResponse": raw_text}


FAILURE_CODES = frozenset(code.replace("payment_probe", "shipment_probe") for code in BASE_FAILURE_CODES) | frozenset({
    "shipment_probe_explicit_action_required", "shipment_probe_duplicate_json_key", "shipment_probe_invalid_json",
    "shipment_probe_invalid_evidence", "shipment_probe_report_mismatch", "shipment_probe_failed",
})


def safe_failure(error, transport):
    # Legacy helper errors stay closed static codes; never emit arbitrary exception text.
    candidate = error.args[0] if error.args else None
    base = base_safe_failure(error, transport)
    if candidate == "garment_filter_structure_limit":
        candidate = "shipment_probe_structure_limit"
    code = candidate if isinstance(candidate, str) and candidate in FAILURE_CODES else str(base["code"]).replace("payment_probe", "shipment_probe")
    return {**base, "schemaVersion": "ainuoke-garment-shipment-candidate-failure.v1",
            "code": code if code in FAILURE_CODES else "shipment_probe_failed"}


def main():
    transport = BoundedGarmentShipmentTransport()
    try:
        if sys.argv[1:] != ["--stdin-request"]:
            raise ValueError("shipment_probe_explicit_action_required")
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("shipment_probe_invalid_evidence")
        result = probe(strict_json(raw.decode("utf-8")), transport)
        print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
    except Exception as error:
        print(json.dumps(safe_failure(error, transport), ensure_ascii=True))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
