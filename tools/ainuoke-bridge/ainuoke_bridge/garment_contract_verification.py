"""Fixed C1 / zero-control / C1 diagnostic. Never a catalog entry or collector.

The Node owner verifies the frozen candidate file before supplying this private
stdin selection. No arbitrary report, page or query parameters are accepted.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from hashlib import sha256
from time import monotonic
from typing import cast

from .ainuoke_client import AinuokeClient, UpstreamSchemaError
from .contracts import ReportDefinition, ReportKey, build_report_request
from .payment_request_observations import strict_json, object_value, count
from .payment_request_probe import BoundedPaymentTransport, FAILURE_CODES, reject_reflected_secrets
from .payment_request_contract_probe import canonical, fingerprint
from .server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY

ACTION = "verify-frozen-d1933-contract-first-page"
SCHEMA = "ainuoke-garment-filter-evidence.v1"
ZERO_CONTRACT = "ZHIXU-6086979-NO-MATCH-G7B"
MAX_BYTES = 12 * 1024 * 1024
TIMEOUT = 180
# The field/flow/comparator are hypotheses to verify, not catalog registration.
DEFINITION = ReportDefinition(key=cast(ReportKey, "garment_contract_verification"), report_id="6086979",
    label="成衣合同筛选核验", future_consumer="private diagnostic only", query_kind="sales_contract",
    query_field="ExpContractNo", query_compare_type="is", query_flow_name="[内层]")
CODES = frozenset(FAILURE_CODES | {
    "garment_filter_input_invalid", "garment_filter_scope_refused", "garment_filter_selection_invalid",
    "garment_filter_account_mismatch", "garment_filter_deadline", "garment_filter_sequence_refused",
    "garment_filter_response_limit", "garment_filter_structure_limit", "garment_filter_report_mismatch", "garment_filter_page_mismatch",
    "garment_filter_count_mismatch", "garment_filter_page_limit", "garment_filter_empty_unverified",
    "garment_filter_contract_mismatch", "garment_filter_row_invalid", "garment_filter_duplicate_row",
    "garment_filter_witness_missing", "garment_filter_control_nonempty", "garment_filter_source_changed",
    "garment_filter_failed", "payment_observation_duplicate_json_key", "payment_observation_invalid_json",
    "payment_observation_invalid_shape", "payment_observation_invalid_count",
})


def fail(code):
    raise UpstreamSchemaError(code)


def validate_selection(selection):
    keys = {"schemaVersion", "sourceFingerprint", "candidateSha256", "rawResponseSha256", "toolingCommit", "salesContractNo", "witness"}
    if (not isinstance(selection, dict) or set(selection) != keys
            or selection["schemaVersion"] != "ainuoke-garment-filter-selection.v1"
            or any(not isinstance(selection[k], str) or not re.fullmatch(r"[0-9a-f]{64}", selection[k])
                   for k in ("sourceFingerprint", "candidateSha256", "rawResponseSha256"))
            or not isinstance(selection["toolingCommit"], str) or not re.fullmatch(r"[0-9a-f]{40}", selection["toolingCommit"])
            or not isinstance(selection["salesContractNo"], str)
            or not re.fullmatch(r"[A-Z0-9][A-Z0-9/._-]{0,79}", selection["salesContractNo"])
            or selection["salesContractNo"] == ZERO_CONTRACT):
        fail("garment_filter_selection_invalid")
    witness = selection["witness"]
    if (not isinstance(witness, dict) or set(witness) != {"id", "billno"}
            or any(not isinstance(v, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/._-]{0,127}", v) for v in witness.values())):
        fail("garment_filter_selection_invalid")
    return selection


def validate_input(value):
    if (not isinstance(value, dict) or set(value) != {"baseUrl", "transportPolicy", "username", "password", "action", "selection"}
            or value["baseUrl"] != APPROVED_HTTP_ORIGIN or value["transportPolicy"] != APPROVED_HTTP_POLICY
            or value["action"] != ACTION):
        fail("garment_filter_scope_refused")
    for key in ("username", "password"):
        text = value[key]
        if not isinstance(text, str) or not text.strip() or len(text) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in text):
            fail("garment_filter_input_invalid")
    selection = validate_selection(value["selection"])
    if selection["sourceFingerprint"] != fingerprint(value["baseUrl"], value["username"]):
        fail("garment_filter_account_mismatch")
    return value


def request_queue(selection):
    validate_selection(selection)
    return tuple(build_report_request(DEFINITION, page=1, page_size=100, query_context={"salesContractNo": contract})
                 for contract in (selection["salesContractNo"], ZERO_CONTRACT, selection["salesContractNo"]))


class VerificationTransport(BoundedPaymentTransport):
    MAX_HTTP_ATTEMPTS = 4
    MAX_REPORT_REQUESTS = 3

    def __init__(self, selection):
        super().__init__()
        self.queue = request_queue(selection)
        self.total_report_bytes = 0
        self.deadline = monotonic() + TIMEOUT
        self.stopped = False

    def report_body_allowed(self, body):
        return (not self.stopped and self.http_attempts == self.report_requests + 1
                and self.report_requests < 3 and body == self.queue[self.report_requests])

    def response_byte_limit(self, is_report):
        return min(4 * 1024 * 1024, MAX_BYTES - self.total_report_bytes) if is_report else 4 * 1024 * 1024

    def request(self, **kwargs):
        if (self.stopped or kwargs["method"] == "GET" and self.http_attempts != 0
                or kwargs["method"] == "POST" and not self.report_body_allowed(kwargs["body"])):
            self.stopped = True
            fail("garment_filter_sequence_refused")
        remaining = self.deadline - monotonic()
        if remaining <= 0:
            self.stopped = True
            fail("garment_filter_deadline")
        try:
            result = super().request(**{**kwargs, "timeout": min(kwargs["timeout"], remaining)})
            if kwargs["method"] == "POST":
                self.total_report_bytes += len(self.last_report_text.encode("utf-8"))
                if self.total_report_bytes > MAX_BYTES:
                    fail("garment_filter_response_limit")
            if monotonic() > self.deadline:
                fail("garment_filter_deadline")
            return result
        except Exception:
            self.stopped = True
            raise


def decoded_page(text, secrets):
    raw = object_value(strict_json(text))
    data = object_value(raw.get("dataList"))
    meta = object_value(raw.get("reportObj"))
    columns = meta.get("cellList")
    if isinstance(columns, str):
        columns = strict_json(columns) if columns.strip() else None
    if columns is not None and not isinstance(columns, list):
        fail("garment_filter_row_invalid")
    for value in (raw, data, meta, columns):
        screen(value, secrets)
    return raw, data, meta


def screen(value, secrets, depth=0):
    # One bound includes both object edges and JSON encoded inside text. Reuse
    # the secret policy shallowly, without its smaller generic subtree limit.
    if depth > 64:
        fail("garment_filter_structure_limit")
    if isinstance(value, dict):
        reject_reflected_secrets({key: None for key in value}, secrets)
    elif not isinstance(value, list):
        reject_reflected_secrets(value, secrets)
    if isinstance(value, str) and value.lstrip().startswith(("{", "[")):
        def invalid_constant(_value):
            raise ValueError()
        try:
            json.loads(value, parse_int=str, parse_float=str, parse_constant=invalid_constant)
        except RecursionError:
            fail("garment_filter_structure_limit")
        except ValueError:
            return  # Ordinary labels such as [内层] are not encoded JSON.
        screen(strict_json(value), secrets, depth + 1)
    elif isinstance(value, dict):
        for child in value.values():
            screen(child, secrets, depth + 1)
    elif isinstance(value, list):
        for child in value:
            screen(child, secrets, depth + 1)


def checked_page(text, selection, control, secrets):
    raw, data, meta = decoded_page(text, secrets)
    if (not isinstance(raw.get("reObj"), dict) or raw["reObj"].get("isOk") is not True
            or meta.get("reportId") != "6086979" or "reportId" in raw and raw["reportId"] != "6086979"):
        fail("garment_filter_report_mismatch")
    # Zero is an observed legacy response sentinel, not a different request page.
    if count(raw.get("pageIndex")) not in (0, 1) or count(raw.get("pageSize")) not in (0, 100):
        fail("garment_filter_page_mismatch")
    total = count(raw["dataCount"] if "dataCount" in raw else data.get("total"))
    if "dataCount" in raw and "total" in data and count(data["total"]) != total:
        fail("garment_filter_count_mismatch")
    if total > 100:
        fail("garment_filter_page_limit")
    rows = data.get("rows")
    if not isinstance(rows, list) or len(rows) != total or any(not isinstance(row, dict) for row in rows):
        fail("garment_filter_count_mismatch")
    if control:
        if total != 0:
            fail("garment_filter_control_nonempty")
        return total, rows
    if total == 0:
        fail("garment_filter_empty_unverified")
    ids = set()
    for row in rows:
        if row.get("ExpContractNo") != selection["salesContractNo"]:
            fail("garment_filter_contract_mismatch")
        if (any(v is not None and (not isinstance(v, str) or len(v) > 2048) for v in row.values())
                or not isinstance(row.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/._-]{0,127}", row["id"])):
            fail("garment_filter_row_invalid")
        if row["id"] in ids:
            fail("garment_filter_duplicate_row")
        ids.add(row["id"])
    if not any(all(row.get(k) == v for k, v in selection["witness"].items()) for row in rows):
        fail("garment_filter_witness_missing")
    return total, rows


def safe_code(error):
    candidate = error.args[0] if error.args else None
    if not isinstance(candidate, str) or candidate not in CODES:
        candidate = getattr(error, "code", None)
    return candidate if isinstance(candidate, str) and candidate in CODES else "garment_filter_failed"


def collect(value, transport=None):
    value = validate_input(value)
    selection = value["selection"]
    transport = transport or VerificationTransport(selection)
    pages = []
    secrets = (value["password"],)
    try:
        transport.phase = "login"
        client = AinuokeClient(base_url=value["baseUrl"], transport=transport, network_retries=0, timeout_seconds=15)
        session = client.login(value["username"], value["password"])
        secrets = (value["password"], session.jwt_token, session.session_id)
        original = None
        for index, contract in enumerate((selection["salesContractNo"], ZERO_CONTRACT, selection["salesContractNo"])):
            transport.phase = "report"
            client.read_report(DEFINITION, jwt_token=session.jwt_token, page=1, page_size=100, query_context={"salesContractNo": contract})
            transport.phase = "validation"
            text = transport.last_report_text
            decoded_page(text, secrets)  # Only secret-screened, parseable text may be retained.
            pages.append({"sequence": index + 1, "alias": "C0" if index == 1 else "C1", "capturedAt": datetime.now(timezone.utc).isoformat(),
                          "rawReportResponse": text, "rawResponseSha256": sha256(text.encode("utf-8")).hexdigest()})
            total, rows = checked_page(text, selection, index == 1, secrets)
            if index == 0:
                original = (total, canonical(sorted(rows, key=lambda row: row["id"])))
            elif index == 2 and original != (total, canonical(sorted(rows, key=lambda row: row["id"]))):
                fail("garment_filter_source_changed")
        return envelope(selection, transport, pages, "complete", None)
    except Exception as error:
        # AinuokeClient can fail after receipt but before returning its parsed page.
        if (getattr(transport, "last_report_request_number", 0) == transport.report_requests
                and len(pages) < transport.report_requests and isinstance(transport.last_report_text, str)):
            try:
                text = transport.last_report_text
                decoded_page(text, secrets)
                number = transport.report_requests
                pages.append({"sequence": number, "alias": "C0" if number == 2 else "C1", "capturedAt": datetime.now(timezone.utc).isoformat(),
                              "rawReportResponse": text, "rawResponseSha256": sha256(text.encode("utf-8")).hexdigest()})
            except Exception:
                pass
        return envelope(selection, transport, pages, "failed", safe_code(error))


def envelope(selection, transport, pages, result, code):
    return {"schemaVersion": SCHEMA, "result": result, "code": code, "workerStage": transport.phase,
            "selectionHash": sha256(canonical(selection).encode("utf-8")).hexdigest(),
            "httpAttempts": transport.http_attempts, "reportRequests": transport.report_requests, "pages": pages}


def main():
    try:
        if sys.argv[1:] != ["--stdin-request"]:
            fail("garment_filter_scope_refused")
        raw = sys.stdin.buffer.read(32769)
        if len(raw) > 32768:
            fail("garment_filter_input_invalid")
        value = validate_input(json.loads(raw.decode("utf-8")))
        result = collect(value)
    except Exception as error:
        result = {"schemaVersion": SCHEMA, "result": "failed", "code": safe_code(error), "workerStage": "not-started",
                  "selectionHash": None, "httpAttempts": 0, "reportRequests": 0, "pages": []}
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(",", ":")))
    return 0 if result["result"] == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(main())
