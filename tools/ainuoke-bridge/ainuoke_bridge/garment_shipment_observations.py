"""Offline lossless 6086979 extraction. No IO, credentials, network or activation.

An exact query declaration is checked, not proof the upstream executed a filter.
The fixed contains/first-page diagnostic is deliberately not this contract.
"""
from __future__ import annotations

import re
import json
from copy import deepcopy
from hashlib import sha256

from .payment_request_observations import strict_json, object_value, count, PaymentObservationError
from .payment_request_probe import reject_reflected_secrets
from .ainuoke_client import UpstreamSchemaError
from .contracts import build_report_request
from .garment_report_screening import DEFINITION


class GarmentObservationError(ValueError):
    pass


def fail(code):
    raise GarmentObservationError(code)


def checked_executed_request(value, contract, ordinal=None):
    if (not isinstance(value, dict) or set(value) != {"reportRequestNumber", "body"}
            or type(value["reportRequestNumber"]) is not int or value["reportRequestNumber"] not in (1, 2)
            or ordinal is not None and value["reportRequestNumber"] != ordinal):
        fail("shipment_observation_invalid_paging_evidence")
    expected = build_report_request(DEFINITION, page=1, page_size=100, query_context={"salesContractNo": contract})
    canonical = lambda body: json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    # Canonical comparison also distinguishes booleans from integers (True == 1).
    if canonical(value["body"]) != canonical(expected):
        fail("shipment_observation_invalid_paging_evidence")
    return {"reportRequestNumber": value["reportRequestNumber"], "body": deepcopy(expected)}


def extract_garment_observation_page(capture):
    keys = {"schemaVersion", "reportId", "sourceFingerprint", "queryContext", "capturedAt", "page", "pageSize", "rawResponseSha256", "rawReportResponse"}
    v2 = isinstance(capture, dict) and capture.get("schemaVersion") == "ainuoke-garment-shipment-capture.v2"
    if (not isinstance(capture, dict) or set(capture) != keys | ({"executedRequest"} if v2 else set())
            or capture["schemaVersion"] not in ("ainuoke-garment-shipment-capture.v1", "ainuoke-garment-shipment-capture.v2")):
        fail("shipment_observation_invalid_capture")
    query = capture["queryContext"]
    if (capture["reportId"] != "6086979" or type(capture["page"]) is not int or not 1 <= capture["page"] <= 20
            or capture["pageSize"] != 100 or type(capture["pageSize"]) is not int
            or not isinstance(query, dict) or set(query) != {"match", "salesContractNo"} or query["match"] != "exact"
            or not isinstance(query["salesContractNo"], str) or not 1 <= len(query["salesContractNo"]) <= 80
            or query["salesContractNo"] != query["salesContractNo"].strip()):
        fail("shipment_observation_scope_mismatch")
    executed = checked_executed_request(capture["executedRequest"], query["salesContractNo"]) if v2 else None
    if v2 and capture["page"] != 1:
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
        paging = (count(response.get("pageIndex")), count(response.get("pageSize")))
        if (paging not in ((1, 100), (0, 0)) if v2 else paging != (capture["page"], 100)):
            fail("shipment_observation_page_mismatch")
        total = count(response["dataCount"] if "dataCount" in response else data.get("total"))
        if "dataCount" in response and "total" in data and count(data["total"]) != total:
            fail("shipment_observation_count_mismatch")
        rows = data.get("rows")
        if v2 and total > 100:
            fail("garment_collection_pagination_unverified")
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
    evidence = {"pagingEvidence": {"schemaVersion": "ainuoke-garment-first-page-evidence.v1",
                "reportRequestNumber": executed["reportRequestNumber"],
                "requestBodySha256": sha256(json.dumps(executed["body"], sort_keys=True, ensure_ascii=False,
                    separators=(",", ":")).encode("utf-8")).hexdigest(),
                "responsePageIndex": paging[0], "responsePageSize": paging[1]}} if executed else {}
    return {"schemaVersion": "ainuoke-garment-shipment-page.v2" if v2 else "ainuoke-garment-shipment-page.v1", "reportId": "6086979", **evidence,
            "sourceFingerprint": capture["sourceFingerprint"], "queryContext": dict(query), "capturedAt": capture["capturedAt"],
            "page": capture["page"], "pageSize": 100, "rawResponseSha256": capture["rawResponseSha256"], "reportedTotal": total, "rows": rows}
