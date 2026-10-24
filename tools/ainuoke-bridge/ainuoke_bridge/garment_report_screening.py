"""Pure garment report definition and strict screening; no diagnostic IO or CLI."""
from __future__ import annotations

import json
from typing import cast

from .ainuoke_client import UpstreamSchemaError
from .contracts import ReportDefinition, ReportKey
from .payment_request_observations import strict_json
from .payment_request_probe import reject_reflected_secrets

DEFINITION = ReportDefinition(key=cast(ReportKey, "garment_contract_verification"), report_id="6086979",
    label="成衣合同筛选核验", future_consumer="private diagnostic only", query_kind="sales_contract",
    query_field="ExpContractNo", query_compare_type="is", query_flow_name="[内层]")
def fail(code):
    raise UpstreamSchemaError(code)


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
