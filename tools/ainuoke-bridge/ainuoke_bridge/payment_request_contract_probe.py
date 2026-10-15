"""Explicit two-contract 6086941 diagnostic; no catalog, database or scheduler."""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from hashlib import sha256
from typing import cast

from .ainuoke_client import AinuokeClient, UpstreamSchemaError
from .contracts import ReportDefinition, ReportKey, build_report_request
from .payment_request_observations import strict_json, object_value, count
from .payment_request_probe import (BoundedPaymentTransport, FAILURE_CODES as FIRST_PAGE_FAILURES,
                                    report_metadata, reject_reflected_secrets)
from .server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY

SCHEMA = "ainuoke-payment-contract-evidence.v1"
PAGE_SIZE = 100
MAX_PAGES = 2
MAX_REPORT_BYTES = 16 * 1024 * 1024
DEFINITION = ReportDefinition(key=cast(ReportKey, "payment_contract_diagnostic"), report_id="6086941",
    label="面辅料货款申请明细（定向诊断）", future_consumer="private diagnostic only",
    query_kind="sales_contract", query_field="ExpContractNo", query_compare_type="is")
CODES = frozenset(FIRST_PAGE_FAILURES | {
    "payment_contract_input_invalid", "payment_contract_selection_invalid", "payment_contract_account_mismatch",
    "payment_contract_scope_refused", "payment_contract_response_limit", "payment_contract_identity_mismatch",
    "payment_contract_count_mismatch", "payment_contract_page_limit", "payment_contract_repeated_page",
    "payment_contract_source_changed", "payment_contract_witness_missing", "payment_contract_empty_unverified",
    "payment_contract_paging_mismatch", "payment_contract_failed",
    "payment_observation_duplicate_json_key", "payment_observation_invalid_json",
    "payment_observation_invalid_shape", "payment_observation_invalid_count",
})


def fail(code):
    raise UpstreamSchemaError(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint(origin, username):
    return sha256(canonical({"origin": origin, "username": unicodedata.normalize("NFKC", username).strip()}).encode()).hexdigest()


def validate_selection(value):
    if (not isinstance(value, dict) or set(value) != {"schemaVersion", "sourceFingerprint", "samplesSha256", "targets"}
            or value["schemaVersion"] != "ainuoke-payment-contract-selection.v1"
            or not all(isinstance(value[k], str) and re.fullmatch(r"[0-9a-f]{64}", value[k]) for k in ("sourceFingerprint", "samplesSha256"))
            or not isinstance(value["targets"], list) or len(value["targets"]) != 2):
        fail("payment_contract_selection_invalid")
    contracts = set()
    for index, target in enumerate(value["targets"]):
        if (not isinstance(target, dict) or set(target) != {"alias", "salesContractNo", "witness"}
                or target["alias"] != "S" + str(index + 1)
                or not isinstance(target["salesContractNo"], str)
                or not re.fullmatch(r"[A-Z0-9][A-Z0-9/._-]{0,79}", target["salesContractNo"])
                or target["salesContractNo"] in contracts):
            fail("payment_contract_selection_invalid")
        contracts.add(target["salesContractNo"])
        witness = target["witness"]
        if (not isinstance(witness, dict) or set(witness) != {"id", "BillNo", "PurContractNo"}
                or any(not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/._-]{0,79}", v) for v in witness.values())):
            fail("payment_contract_selection_invalid")
    return value


def validate_input(value):
    if not isinstance(value, dict) or set(value) != {"baseUrl", "username", "password", "transportPolicy", "action", "selection"}:
        fail("payment_contract_input_invalid")
    if (value["baseUrl"] != APPROVED_HTTP_ORIGIN or value["transportPolicy"] != APPROVED_HTTP_POLICY
            or value["action"] != "read-two-verified-contracts"):
        fail("payment_contract_scope_refused")
    for key in ("username", "password"):
        v = value[key]
        if not isinstance(v, str) or not v.strip() or len(v) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in v):
            fail("payment_contract_input_invalid")
    selection = validate_selection(value["selection"])
    if selection["sourceFingerprint"] != fingerprint(value["baseUrl"], value["username"]):
        fail("payment_contract_account_mismatch")
    return value


class ContractTransport(BoundedPaymentTransport):
    MAX_HTTP_ATTEMPTS = 9
    MAX_REPORT_REQUESTS = 8

    def __init__(self, selection):
        super().__init__()
        self.total_report_bytes = 0
        self.allowed_bodies = tuple(build_report_request(DEFINITION, page=page, page_size=PAGE_SIZE,
            query_context={"salesContractNo": target["salesContractNo"]})
            for target in selection["targets"] for page in (1, 2))

    def response_byte_limit(self, is_report):
        return min(4 * 1024 * 1024, MAX_REPORT_BYTES - self.total_report_bytes) if is_report else 4 * 1024 * 1024

    def report_body_allowed(self, body):
        return any(body == candidate for candidate in self.allowed_bodies)

    def request(self, **kwargs):
        result = super().request(**kwargs)
        if kwargs["method"] == "POST":
            self.total_report_bytes += len(self.last_report_text.encode("utf-8"))
            if self.total_report_bytes > MAX_REPORT_BYTES:
                fail("payment_contract_response_limit")
        return result


def decode_page(text, *, secrets):
    raw = object_value(strict_json(text))
    data = object_value(raw["dataList"]) if raw.get("dataList") is not None else {}
    meta = report_metadata(raw.get("reportObj"))
    for container in (raw, data, meta):
        if container is not None:
            reject_reflected_secrets(container, secrets)
    return raw, data, meta


def checked_page(raw, data, meta, target, requested_page):
    if not isinstance(raw.get("reObj"), dict) or raw["reObj"].get("isOk") is not True:
        fail("payment_contract_identity_mismatch")
    if (not isinstance(meta, dict) or str(meta.get("reportId")) != "6086941"
            or "reportId" in raw and str(raw["reportId"]) != "6086941"):
        fail("payment_contract_identity_mismatch")
    total = count(raw["dataCount"] if "dataCount" in raw else data.get("total"))
    if total == 0:
        fail("payment_contract_empty_unverified")
    if total > PAGE_SIZE * MAX_PAGES:
        fail("payment_contract_page_limit")
    rows = data.get("rows")
    expected = min(PAGE_SIZE, max(0, total - (requested_page - 1) * PAGE_SIZE))
    if (not isinstance(rows, list) or len(rows) != expected or expected == 0
            or any(not isinstance(row, dict) for row in rows)):
        fail("payment_contract_count_mismatch")
    # Zero is a legacy response sentinel, never a substitute request page.
    if count(raw.get("pageIndex")) not in (0, requested_page) or count(raw.get("pageSize")) not in (0, PAGE_SIZE):
        fail("payment_contract_paging_mismatch")
    for row in rows:
        if (row.get("ExpContractNo") != target["salesContractNo"]
                or any(v is not None and (not isinstance(v, str) or len(v) > 2048) for v in row.values())):
            fail("payment_contract_identity_mismatch")
    return total, rows


def collect(value, transport=None):
    value = validate_input(value)
    selection = value["selection"]
    transport = transport or ContractTransport(selection)
    pages = []
    active_request = None
    secrets = (value["password"],)
    transport.phase = "login"
    try:
        client = AinuokeClient(base_url=value["baseUrl"], transport=transport, network_retries=0, timeout_seconds=15)
        session = client.login(value["username"], value["password"])
        secrets = (value["password"], session.jwt_token, session.session_id)
        originals = {}
        for pass_number in (1, 2):
            for target in selection["targets"]:
                contract_rows, page_hashes, total = [], set(), None
                page_number = 1
                while True:
                    transport.phase = "report"
                    active_request = (target["alias"], pass_number, page_number)
                    client.read_report(DEFINITION, jwt_token=session.jwt_token, page=page_number,
                        page_size=PAGE_SIZE, query_context={"salesContractNo": target["salesContractNo"]})
                    transport.phase = "validation"
                    text = transport.last_report_text
                    raw, data, meta = decode_page(text, secrets=secrets)
                    # Safe rejected pages are retained privately too; never treated as a projection.
                    pages.append({"alias": target["alias"], "pass": pass_number, "page": page_number,
                        "capturedAt": datetime.now(timezone.utc).isoformat(), "rawReportResponse": text,
                        "rawResponseSha256": sha256(text.encode("utf-8")).hexdigest()})
                    page_total, rows = checked_page(raw, data, meta, target, page_number)
                    if total is not None and total != page_total:
                        fail("payment_contract_source_changed")
                    total = page_total
                    content = canonical(rows)
                    content_hash = sha256(content.encode()).hexdigest()
                    if content_hash in page_hashes:
                        fail("payment_contract_repeated_page")
                    page_hashes.add(content_hash)
                    contract_rows.extend(rows)
                    if page_number * PAGE_SIZE >= total:
                        break
                    page_number += 1
                if not any(all(row.get(k) == v for k, v in target["witness"].items()) for row in contract_rows):
                    fail("payment_contract_witness_missing")
                content = canonical(contract_rows)
                if pass_number == 1:
                    originals[target["alias"]] = (total, content)
                elif originals[target["alias"]] != (total, content):
                    fail("payment_contract_source_changed")
        return envelope(selection, transport, pages, "complete", None)
    except Exception as error:
        if (active_request is not None and getattr(transport, "last_report_request_number", 0) == transport.report_requests
                and len(pages) < transport.report_requests and isinstance(transport.last_report_text, str)):
            try:
                text = transport.last_report_text
                decode_page(text, secrets=secrets)
                alias, pass_number, page_number = active_request
                pages.append({"alias": alias, "pass": pass_number, "page": page_number,
                    "capturedAt": datetime.now(timezone.utc).isoformat(), "rawReportResponse": text,
                    "rawResponseSha256": sha256(text.encode("utf-8")).hexdigest()})
            except Exception:
                pass  # Unparseable or secret-bearing failures never become private artifacts.
        return envelope(selection, transport, pages, "failed", safe_code(error))


def safe_code(error):
    candidate = error.args[0] if error.args else None
    if not isinstance(candidate, str) or candidate not in CODES:
        candidate = getattr(error, "code", None)
    return candidate if isinstance(candidate, str) and candidate in CODES else "payment_contract_failed"


def envelope(selection, transport, pages, result, code):
    phase = transport.phase if transport.phase in ("not-started", "login", "report", "validation") else "not-started"
    return {"schemaVersion": SCHEMA, "result": result, "code": code, "workerStage": phase,
        "selectionHash": sha256(canonical(selection).encode()).hexdigest(),
        "httpAttempts": transport.http_attempts, "reportRequests": transport.report_requests, "pages": pages}


def main():
    transport = None
    try:
        if sys.argv[1:] != ["--stdin-request"]:
            fail("payment_contract_scope_refused")
        raw = sys.stdin.buffer.read(32769)
        if len(raw) > 32768:
            fail("payment_contract_input_invalid")
        value = validate_input(json.loads(raw.decode("utf-8")))
        transport = ContractTransport(value["selection"])
        result = collect(value, transport)
    except Exception as error:
        result = {"schemaVersion": SCHEMA, "result": "failed", "code": safe_code(error), "workerStage": "not-started",
            "selectionHash": None, "httpAttempts": 0, "reportRequests": 0, "pages": []}
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
    return 0 if result["result"] == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(main())
