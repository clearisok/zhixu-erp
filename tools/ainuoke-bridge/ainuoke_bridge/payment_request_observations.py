"""Lossless, offline extraction of a captured 6086941 page. No IO or collector."""
from __future__ import annotations

import json
import re
from hashlib import sha256

from .payment_request_probe import MAX_RESPONSE_BYTES, reject_reflected_secrets
from .ainuoke_client import UpstreamSchemaError

SCHEMA = "ainuoke-payment-observation-page.v1"


class PaymentObservationError(ValueError):
    pass


def fail(code):
    raise PaymentObservationError(code)


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail("payment_observation_duplicate_json_key")
            result[key] = value
        return result

    def constant(_value):
        fail("payment_observation_invalid_json")

    try:
        return json.loads(text, parse_int=str, parse_float=str, parse_constant=constant, object_pairs_hook=pairs)
    except (ValueError, RecursionError) as error:
        if isinstance(error, PaymentObservationError):
            raise
        fail("payment_observation_invalid_json")


def object_value(value):
    if isinstance(value, str):
        value = strict_json(value)
    if not isinstance(value, dict):
        fail("payment_observation_invalid_shape")
    return value


def count(value):
    if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9][0-9]*)", value) or len(value) > 16:
        fail("payment_observation_invalid_count")
    result = int(value)
    if result > 9007199254740991:
        fail("payment_observation_invalid_count")
    return result


def extract_payment_observation_page(private_report):
    """Caller checks file ACL/hash; this pure boundary rechecks raw bytes and scope.

    JSON numbers become their exact original text, not floats. A receipt is neither
    live authorization nor a stable financial-event identity. No currency guessing.
    """
    if not isinstance(private_report, dict) or private_report.get("schemaVersion") != "ainuoke-payment-request-private.v1":
        fail("payment_observation_invalid_capture")
    if (private_report.get("reportId") != "6086941" or type(private_report.get("page")) is not int or private_report.get("page") != 1
            or type(private_report.get("pageSize")) is not int or private_report.get("pageSize") != 100):
        fail("payment_observation_invalid_scope")
    source = private_report.get("sourceFingerprint")
    raw = private_report.get("rawReportResponse")
    raw_hash = private_report.get("rawResponseSha256")
    captured = private_report.get("capturedAt")
    if (not isinstance(source, str) or not re.fullmatch(r"[0-9a-f]{64}", source)
            or not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_RESPONSE_BYTES
            or not isinstance(captured, str) or len(captured) > 40
            or raw_hash != sha256(raw.encode("utf-8")).hexdigest()):
        fail("payment_observation_invalid_capture")
    response = object_value(strict_json(raw))
    data = object_value(response.get("dataList"))
    metadata = object_value(response.get("reportObj"))
    if (not isinstance(response.get("reObj"), dict) or response["reObj"].get("isOk") is not True
            or metadata.get("reportId") != "6086941"
            or "reportId" in response and response["reportId"] != "6086941"):
        fail("payment_observation_report_mismatch")
    if count(response.get("pageIndex")) not in (0, 1) or count(response.get("pageSize")) not in (0, 100):
        fail("payment_observation_invalid_scope")
    total = count(response["dataCount"] if "dataCount" in response else data.get("total"))
    rows = data.get("rows")
    if (not isinstance(rows, list) or len(rows) > 100 or len(rows) > total
            or any(not isinstance(row, dict) for row in rows)):
        fail("payment_observation_invalid_rows")
    # The accepted private report was secret screened at collection. Recheck any
    # decoded embedded containers here; this function never consumes credentials.
    try:
        for value in (response, data, metadata):
            reject_reflected_secrets(value, ())
    except UpstreamSchemaError:
        fail("payment_observation_secret_or_structure")
    for row in rows:
        if any(value is not None and (not isinstance(value, str) or len(value) > 2048) for value in row.values()):
            fail("payment_observation_exact_strings_required")
    return {"schemaVersion": SCHEMA, "reportId": "6086941", "sourceFingerprint": source,
            "capturedAt": captured, "rawResponseSha256": raw_hash, "page": 1, "pageSize": 100,
            "reportedTotal": total, "rows": rows}
