# Ainuoke Order Discovery

## Status and scope

- Gate: Ainuoke Order Discovery — Clean PostgreSQL Bootstrap Foundation.
- Baseline: `13620491cf56605cadf57c90c6cdf389f0919297` (`main`, PR #13 and PR #14 merged).
- Stage A protocol discovery: **PASS** on 2026-09-10.
- Stage B fixed read-only foundation: implemented on `chore/ainuoke-order-discovery`.
- Proven scope is only **all rows visible to the currently bound Ainuoke account** (`current_account_visible`). Company-wide or department-wide visibility was not proven.
- Every contract returned by a complete `current_account_visible` Discovery snapshot is a future clean-bootstrap candidate. Ainuoke `Status` does not include or exclude a discovered contract.
- This Gate does not create PostgreSQL SalesOrder, bootstrap orders, switch a Repository, write Ainuoke, or read/change Browser SalesOrder/Scheduling/Quote/Style Progress/Closing data.

## Confirmed source and request

The observed Ainuoke page was **成衣销售合同**. Its normal list refresh used the existing generic read endpoint:

- Method/path: `POST /kaijin/report/report/getReportObjAndData`
- Fixed report ID: `6086103`
- Read-only evidence: the request is the same report/list read used by the page, returns report metadata plus `dataList`, and contains no save/submit/update/delete/approve/close/cancel action. The audit issued no Ainuoke business write.
- Sort metadata: report metadata declares `ContractDate*2*1` and SQL order `ContractDate DESC`.
- Empty-state request: no InsideOrderNo or SalesContractNo is required. `conditionList`, `sqlParamList`, and `orderFieldList` are empty arrays.

The Bridge owns the fixed body below; Browser code can only select the allowlisted `order_discovery` key and paging values. It cannot submit report ID, endpoint, SQL condition, raw body, authorization, token, or cookie.

```json
{
  "reportId": 6086103,
  "sqlCdtn": {
    "targetId": 6086103,
    "entId": 6086103,
    "currentPage": 1,
    "pageIndex": 1,
    "pageSize": 50,
    "targetType": 1,
    "conditionList": [],
    "sqlParamList": [],
    "orderFieldList": []
  },
  "isFirstTime": true,
  "isIniPage": false
}
```

`currentPage` and `pageIndex` advance together. The observed response exposes a constant `total`; the client reads consecutive pages until the accumulated row count equals it, with a maximum-page guard. It fails closed on total changes, wrong page/page size, premature short/empty page, excess rows, malformed protocol, repeated source-row identity, duplicate source ID, blank BillNo, or duplicate normalized `SalesContractNo` / `BillNo`.

## Live completeness evidence

Two complete consecutive traversals were performed with the same bound account and fixed request:

| Evidence | Result |
| --- | --- |
| Total | 505 on every fetched page in both traversals |
| Pagination | 11 pages at page size 50; pages 1–10 returned 50 and page 11 returned 5 |
| Rows read | 505 per traversal |
| Unique report `id` | 505; duplicates 0; blank 0 |
| Unique `InsideOrderNo` | 505; duplicates 0; blank 0 |
| Unique `SalesContractNo` (`BillNo`) | 505; duplicates 0; blank 0 |
| Unique `(InsideOrderNo, SalesContractNo)` | 505; duplicates 0 |
| Mapping anomalies | one InsideOrderNo → many contracts: 0; one contract → many InsideOrderNo: 0 |
| Repeated-page anomalies | 0 |
| Contract date range | 2025-05-29 through 2026-09-10 |
| Delivery date range | 2025-08-07 through 2027-02-17 |
| Normalized SHA-256 | `37d8e7860e3157cb3022657a4b4ce2223a53876383aec701c685431a5945b744` in both traversals |

These counts and dates are an observed upstream snapshot, not permanent business constants. Full discovery therefore means complete traversal of the current account's visible report result at that moment; it does not prove all company orders.

## Fields, identity, and status

2026-10-09: Discovery BillNo normalization uses the same NFKC/whitespace removal/uppercase convention as formal 6087105 exact filtering. Whitespace-only BillNo variants therefore cannot form two Discovery identities. This does not change the current-account visibility or status inclusion policy.

Observed list fields include stable report `id`, `InsideOrderNo`, `BillNo`, `Status`, `ContractDate`, `DeliveryDate`, `GoodsDesc`, and additional report columns such as customer/brand data. The minimal domain boundary intentionally maps only:

- `sourceId`
- `sourceRowIdentity`
- `insideOrderNo`
- `salesContractNo`
- raw lifecycle status
- contract/delivery dates
- style number

`AinuokeOrderDiscoveryRow` is a discovery fact, not a SalesOrder. The normalized snapshot sorts rows deterministically and hashes stable mapped fields; it excludes fetch time, page grouping/order, request IDs, headers, credentials, tokens, cookies, and transport-only row fingerprints.

At the observed snapshot, statuses were:

- `生效`: 143
- `草拟`: 362

All contracts in a complete current-account-visible snapshot participate as future clean-bootstrap candidates, including both observed statuses. `Status` has no bootstrap inclusion/exclusion meaning. It remains an Ainuoke source fact for display, audit, troubleshooting, and possible future rules. The observed 505/143/362 values describe this one snapshot only; every future run uses that run's complete snapshot and does not treat 505 as a permanent constant. No time/status filter is applied.

## Detail cross-check

- D1935 was discovered. Its discovered InsideOrderNo/SalesContractNo pair matched report 6086103, and 6086997 returned readable color/quantity details (187 rows over 4 pages at page size 50).
- Five additional deterministic redacted samples spanning different dates/statuses were cross-checked through both 6086103 and 6086997. All five had matching contract identity and readable color details.
- Cross-check total: 6; result: PASS.
- No samples were selected or filtered to manufacture parity, and no raw business rows were committed to the repository.

This proves the discovered identifiers can feed the existing detail pipeline. It does not authorize detail commit, SalesOrder creation, or Material import.

## Visibility and disappearance semantics

Account permissions may constrain what the report returns. The audit did not prove whether this account represents the whole company, a department, a salesperson, or another permission scope. Any future bootstrap must record the source account/scope and cannot claim coverage beyond `current_account_visible` without additional evidence.

The list does not provide a trustworthy deletion event. A row missing on a later traversal could mean actual deletion/inactivation, permission change, lifecycle filtering, pagination inconsistency, or upstream failure. Future reconciliation therefore **must not hard-delete a SalesOrder from absence alone**. Proposed future metadata is `last_seen_at`, `missing_since`, `reconciliation_status`, and an explicit tombstone/retirement decision. This Gate implements none of it.

## Clean-bootstrap implication

The verified source direction is:

`empty PostgreSQL → fresh current-account-visible discovery → 6086103 contract detail + approved color-source detail → candidate projection/reconciliation → separately authorized future formal PostgreSQL SalesOrder`

Phase 2B2 historically used 6086997 for color detail. Phase 2B2.2 records the approved current rule: normalized `SalesContractNo` / `BillNo` is the stable cross-report association, while `InsideOrderNo` is mutable. Fixed report 6087105 now uses `{ salesContractNo }` → `BillNo contains`, exact-filters `row.BillNo`, and formally replaces 6086997 for current SalesOrder color/size sourcing. 6086997 remains legacy/historical. 6087050 remains an independent Material source; only its current InsideOrderNo transport query is proven.

Current Browser Order Center and Scheduling records are test data and are not the bootstrap authority or a required migration inventory. Quote Center contains real business data and remains protected. Style Progress/Material is outside this retirement scope and must be preserved. Closing retirement status remains undecided.

The old Browser Order/Scheduling data is not authorized for deletion. A later independent Test Business Data Retirement Gate must first take a complete backup, audit dependencies, enumerate delete/protect scopes, and obtain explicit destructive confirmation.

## Confirmed policies and remaining decisions

The user has confirmed `current_account_visible` as the formal bootstrap scope, measured by each fresh complete Discovery rather than a fixed count. A missing source row retains the SalesOrder UUID, immutable binding and history; it is marked missing rather than deleted or cancelled, and returns to seen when rediscovered. Long-term retention keeps normalized current mirrors, hashes, necessary timestamps and reconciliation metadata, but not complete raw upstream payload by default.

Remaining decisions are:

1. Run a fresh Bootstrap Preview using the approved BillNo identity and 6087105 color/size source; do not execute real bootstrap.
2. Separate approval and precise scope for any real bootstrap/read cutover.
3. Closing data retirement classification; Browser Order/Scheduling retirement remains a later separately confirmed destructive Gate.

## Readiness

The read-only Discovery source is stable foundation evidence. Phase 2B1 server foundation, historical Phase 2B2 Preview, Phase 2B2.1 candidate validation and Phase 2B2.2 stable BillNo identity/source migration are complete. **Ready for a fresh Bootstrap Preview; no real bootstrap or Browser cutover is approved.**
