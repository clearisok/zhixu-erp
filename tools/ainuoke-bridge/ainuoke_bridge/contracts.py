from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
from json import dumps
from typing import Any, Literal, Mapping

from .security import sanitize_mapping


ReportKey = Literal["sales_contracts", "sales_contract_color_sizes", "material_purchase_statistics"]
SOURCE_SCHEMA_VERSION = "ainuoke-direct-read.v1"


@dataclass(frozen=True)
class ReportDefinition:
    key: ReportKey
    report_id: str
    label: str
    future_consumer: str


REPORT_CATALOG: dict[ReportKey, ReportDefinition] = {
    "sales_contracts": ReportDefinition(
        key="sales_contracts",
        report_id="6086103",
        label="销售合同",
        future_consumer="AinuokeContractMirror",
    ),
    "sales_contract_color_sizes": ReportDefinition(
        key="sales_contract_color_sizes",
        report_id="6086997",
        label="销售合同颜色尺码明细",
        future_consumer="AinuokeContractMirror",
    ),
    "material_purchase_statistics": ReportDefinition(
        key="material_purchase_statistics",
        report_id="6087050",
        label="面辅料申购统计",
        future_consumer="Material Normalize -> Dedup -> Validate -> Preview",
    ),
}


class SourceContractError(ValueError):
    pass


@dataclass(frozen=True)
class SourceRow:
    source_row_identity: str
    values: dict[str, Any]


@dataclass(frozen=True)
class ReportSnapshot:
    schema_version: str
    report_id: str
    fetched_at: str
    page: int
    page_size: int
    total: int
    query_context: dict[str, Any]
    snapshot_hash: str
    rows: list[SourceRow]

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "reportId": self.report_id,
            "fetchedAt": self.fetched_at,
            "page": self.page,
            "pageSize": self.page_size,
            "total": self.total,
            "queryContext": self.query_context,
            "snapshotHash": self.snapshot_hash,
            "rows": [
                {"sourceRowIdentity": row.source_row_identity, "values": row.values}
                for row in self.rows
            ],
        }


def resolve_report(report_key: str) -> ReportDefinition:
    try:
        return REPORT_CATALOG[report_key]  # type: ignore[index]
    except KeyError as error:
        raise SourceContractError("unknown_report") from error


def reject_raw_report_id(value: str) -> None:
    if value in {definition.report_id for definition in REPORT_CATALOG.values()}:
        raise SourceContractError("raw_report_id_not_accepted")


def _canonical_json(value: Any) -> str:
    return dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _row_identity(report_id: str, row: Mapping[str, Any]) -> str:
    for key in ("id", "ID", "rowId", "rowID", "billId", "billID", "dataId"):
        candidate = row.get(key)
        if candidate is not None and str(candidate).strip():
            return f"{report_id}:{str(candidate).strip()}"
    return f"{report_id}:sha256:{sha256(_canonical_json(row).encode('utf-8')).hexdigest()}"


def build_report_snapshot(
    *,
    report_key: str,
    rows: list[Mapping[str, Any]],
    page: int,
    page_size: int,
    total: int,
    query_context: Mapping[str, Any],
    fetched_at: str | None = None,
) -> ReportSnapshot:
    definition = resolve_report(report_key)
    if page < 1 or page_size < 1 or total < 0:
        raise SourceContractError("invalid_paging")
    clean_query = sanitize_mapping(query_context)
    clean_rows = [sanitize_mapping(row) for row in rows]
    source_rows = [SourceRow(source_row_identity=_row_identity(definition.report_id, row), values=row) for row in clean_rows]
    hash_payload = {
        "schemaVersion": SOURCE_SCHEMA_VERSION,
        "reportId": definition.report_id,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "queryContext": clean_query,
        "rows": [asdict(row) for row in source_rows],
    }
    snapshot_hash = sha256(_canonical_json(hash_payload).encode("utf-8")).hexdigest()
    return ReportSnapshot(
        schema_version=SOURCE_SCHEMA_VERSION,
        report_id=definition.report_id,
        fetched_at=fetched_at or datetime.now(timezone.utc).isoformat(),
        page=page,
        page_size=page_size,
        total=total,
        query_context=clean_query,
        snapshot_hash=snapshot_hash,
        rows=source_rows,
    )


def sanitized_source_error(code: str) -> dict[str, str]:
    allowed = {
        "network_timeout": "艾诺科连接超时",
        "network_unavailable": "艾诺科暂时不可访问",
        "invalid_credential": "艾诺科账号或密码无效",
        "auth_expired": "艾诺科登录已失效",
        "upstream_schema_error": "艾诺科报表响应格式无法识别",
        "unknown_report": "不支持该报表",
    }
    normalized = code if code in allowed else "upstream_error"
    return {"code": normalized, "message": allowed.get(normalized, "艾诺科请求失败")}
