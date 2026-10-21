"""Offline lossless 6086979 extraction. No IO, credentials, network or activation.

An exact query declaration is checked, not proof the upstream executed a filter.
The fixed contains/first-page diagnostic is deliberately not this contract.
"""
from __future__ import annotations

import re
from hashlib import sha256

from .payment_request_observations import strict_json, object_value, count, PaymentObservationError
from .payment_request_probe import reject_reflected_secrets
from .ainuoke_client import UpstreamSchemaError


class GarmentObservationError(ValueError):
    pass


def fail(code):
    raise GarmentObservationError(code)


def extract_garment_observation_page(capture):
    keys = {"schemaVersion", "reportId", "sourceFingerprint", "queryContext", "capturedAt", "page", "pageSize", "rawResponseSha256", "rawReportResponse"}
    if not isinstance(capture, dict) or set(capture) != keys or capture["schemaVersion"] != "ainuoke-garment-shipment-capture.v1":
        fail("shipment_observation_invalid_capture")
    query = capture["queryContext"]
    if (capture["reportId"] != "6086979" or type(capture["page"]) is not int or not 1 <= capture["page"] <= 20
            or capture["pageSize"] != 100 or type(capture["pageSize"]) is not int
            or not isinstance(query, dict) or set(query) != {"match", "salesContractNo"} or query["match"] != "exact"
            or not isinstance(query["salesContractNo"], str) or not 1 <= len(query["salesContractNo"]) <= 80
            or query["salesContractNo"] != query["salesContractNo"].strip()):
        fail("shipment_observation_scope_mismatch")
    raw = capture["rawReportResponse"]
    if (not isinstance(raw, str) or len(raw.encode("utf-8")) > 4 * 1024 * 1024
            or capture["rawResponseSha256"] != sha256(raw.encode("utf-8")).hexdigest()
            or not isinstance(capture["sourceFingerprint"], str) or not re.fullmatch(r"[0-9a-f]{64}", capture["sourceFingerprint"])
            or not isinstance(capture["capturedAt"], str)):
        fail("shipment_observation_invalid_capture")
    try:
        response = object_value(strict_json(raw))
        data = object_value(response.get("dataList"))
        metadata = object_value(response.get("reportObj"))
        if (not isinstance(response.get("reObj"), dict) or response["reObj"].get("isOk") is not True
                or metadata.get("reportId") != "6086979"
                or "reportId" in response and response["reportId"] != "6086979"):
            fail("shipment_observation_report_mismatch")
        if count(response.get("pageIndex")) != capture["page"] or count(response.get("pageSize")) != 100:
            fail("shipment_observation_page_mismatch")
        total = count(response["dataCount"] if "dataCount" in response else data.get("total"))
        rows = data.get("rows")
        if (total > 2000 or not isinstance(rows, list) or capture["page"] > max(1, (total + 99) // 100)
                or len(rows) != min(100, max(0, total - (capture["page"] - 1) * 100))):
            fail("shipment_observation_invalid_rows")
        for value in (response, data, metadata):
            reject_reflected_secrets(value, ())
        for row in rows:
            if (not isinstance(row, dict) or row.get("ExpContractNo") != query["salesContractNo"]
                    or any(value is not None and (not isinstance(value, str) or len(value) > 2048) for value in row.values())):
                fail("shipment_observation_exact_contract_rows_required")
    except (PaymentObservationError, UpstreamSchemaError, RecursionError) as error:
        raise GarmentObservationError("shipment_observation_invalid_raw_response") from error
    return {"schemaVersion": "ainuoke-garment-shipment-page.v1", "reportId": "6086979",
            "sourceFingerprint": capture["sourceFingerprint"], "queryContext": dict(query), "capturedAt": capture["capturedAt"],
            "page": capture["page"], "pageSize": 100, "rawResponseSha256": capture["rawResponseSha256"], "reportedTotal": total, "rows": rows}
