from __future__ import annotations

from dataclasses import asdict, dataclass
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from json import dumps
from math import isfinite
from typing import Any, Literal, Mapping

from .security import sanitize_mapping


ReportKey = Literal[
    "order_discovery",
    "sales_contracts",
    "sales_contract_color_sizes",
    "garment_color_size_details",
    "material_purchase_statistics", "material_contract_statistics", "fabric_purchase_units", "trim_purchase_units", "fabric_inbound_units", "trim_inbound_units",
]
ReportQueryKind = Literal["empty", "sales_contract", "inside_order"]
SOURCE_SCHEMA_VERSION = "ainuoke-direct-read.v2"


@dataclass(frozen=True)
class ReportDefinition:
    key: ReportKey
    report_id: str
    label: str
    future_consumer: str
    query_kind: ReportQueryKind
    query_field: str | None = None
    query_compare_type: str | None = None
    query_flow_name: str | None = None


REPORT_CATALOG: dict[ReportKey, ReportDefinition] = {
    "order_discovery": ReportDefinition(
        key="order_discovery",
        report_id="6086103",
        label="成衣销售合同发现",
        future_consumer="AinuokeOrderDiscoverySnapshot",
        query_kind="empty",
    ),
    "sales_contracts": ReportDefinition(
        key="sales_contracts",
        report_id="6086103",
        label="销售合同",
        future_consumer="AinuokeContractMirror",
        query_kind="inside_order",
        query_field="InsideOrderNo",
        query_compare_type="contains",
        query_flow_name="[内层]",
    ),
    "sales_contract_color_sizes": ReportDefinition(
        key="sales_contract_color_sizes",
        report_id="6086997",
        label="销售合同颜色尺码明细",
        future_consumer="AinuokeContractMirror",
        query_kind="inside_order",
        query_field="InsideOrderNo",
        query_compare_type="is",
    ),
    "garment_color_size_details": ReportDefinition(
        key="garment_color_size_details",
        report_id="6087105",
        label="成衣分色分码明细",
        future_consumer="AinuokeGarmentColorSizeSource",
        query_kind="sales_contract",
        query_field="BillNo",
        query_compare_type="contains",
        query_flow_name="[内层]",
    ),
    "material_purchase_statistics": ReportDefinition(
        key="material_purchase_statistics",
        report_id="6087050",
        label="面辅料申购统计",
        future_consumer="Material Normalize -> Dedup -> Validate -> Preview",
        query_kind="inside_order",
        query_field="insideorderno",
        query_compare_type="is",
        query_flow_name="[内层]",
    ),
}
# Fixed, observed queries from the 2026-11-05 knowledge-base evidence. Only an
# explicitly configured Server capture uses these; no arbitrary report IDs.
REPORT_CATALOG.update({
    "material_contract_statistics": ReportDefinition("material_contract_statistics", "6087051", "面辅料申购统计-IT", "Material Normalize -> Dedup -> Validate -> Preview", "sales_contract", "ExpContractNo", "contains", "[内层]"),
    **{key: ReportDefinition(key, report, "物料单位核对", "Material unit evidence", "inside_order", "InsideOrderNo", compare, "[内层]")
       for key, report, compare in (("fabric_purchase_units", "6086405", "contains"), ("trim_purchase_units", "6086408", "contains"),
          ("fabric_inbound_units", "6086875", "contains"), ("trim_inbound_units", "6086354", "is"))},
})


class SourceContractError(ValueError):
    pass


def parse_non_negative_integer(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("invalid_integer")
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, float) and isfinite(value) and value.is_integer():
        parsed = int(value)
    elif isinstance(value, str) and value.strip().isascii() and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        raise ValueError("invalid_integer")
    if parsed < 0:
        raise ValueError("invalid_integer")
    return parsed


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
            "queryContext": deepcopy(self.query_context),
            "snapshotHash": self.snapshot_hash,
            "rows": [
                {"sourceRowIdentity": row.source_row_identity, "values": deepcopy(row.values)}
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


def build_report_request(
    definition: ReportDefinition,
    *,
    page: int,
    page_size: int,
    query_context: Mapping[str, Any],
) -> dict[str, Any]:
    if page < 1 or page_size < 1:
        raise SourceContractError("invalid_paging")
    normalized_query = validate_query_for_report(definition, query_context)
    conditions: list[dict[str, Any]] = []
    if definition.query_kind != "empty":
        query_key = "salesContractNo" if definition.query_kind == "sales_contract" else "insideOrderNo"
        query_value = normalized_query[query_key]
        condition: dict[str, Any] = {
            "conditionRelation": "and",
            "cuHaiType": 0,
            "dbTableName": "",
            "fieldName": definition.query_field,
            "compareType": definition.query_compare_type,
            "dataType": "varchar",
            "dataTypeId": 2,
            "valueType": 1,
            "dealWithType": 0,
            "compareValue": query_value,
        }
        if definition.query_flow_name:
            condition["flowName"] = definition.query_flow_name
        conditions.append(condition)
    report_id = int(definition.report_id)
    return {
        "reportId": report_id,
        "sqlCdtn": {
            "targetId": report_id,
            "entId": report_id,
            "currentPage": page,
            "pageIndex": page,
            "pageSize": page_size,
            "targetType": 1,
            "conditionList": conditions,
            "sqlParamList": [],
            "orderFieldList": [],
        },
        "isFirstTime": True,
        "isIniPage": False,
    }


def _validate_single_text_query(query_context: Mapping[str, Any], key: str) -> dict[str, str]:
    if set(query_context) != {key}:
        raise SourceContractError("invalid_query")
    value = query_context.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 80:
        raise SourceContractError("invalid_query")
    return {key: value.strip()}


def validate_report_query(query_context: Mapping[str, Any]) -> dict[str, str]:
    return _validate_single_text_query(query_context, "insideOrderNo")


def validate_sales_contract_query(query_context: Mapping[str, Any]) -> dict[str, str]:
    return _validate_single_text_query(query_context, "salesContractNo")


def validate_discovery_query(query_context: Mapping[str, Any]) -> dict[str, Any]:
    if query_context:
        raise SourceContractError("invalid_query")
    return {}


def validate_query_for_report(definition: ReportDefinition, query_context: Mapping[str, Any]) -> dict[str, Any]:
    if definition.query_kind == "empty":
        return validate_discovery_query(query_context)
    if definition.query_kind == "sales_contract":
        return validate_sales_contract_query(query_context)
    return validate_report_query(query_context)


def _row_identity(report_id: str, row: Mapping[str, Any]) -> str:
    # Captured report/view responses do not prove `id` uniqueness; 6087050 is
    # known to repeat it. This fingerprint is independent of page and sort order.
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
        # loginsys2 uses isOk=false for every refusal, not only a bad password.
        "invalid_credential": "艾诺科登录被拒绝；原因未识别，请查看登录诊断",
        "auth_expired": "艾诺科登录已失效",
        "upstream_schema_error": "艾诺科报表响应格式无法识别",
        "unknown_report": "不支持该报表",
        "invalid_query": "报表查询条件无效",
    }
    normalized = code if code in allowed else "upstream_error"
    return {"code": normalized, "message": allowed.get(normalized, "艾诺科请求失败")}
