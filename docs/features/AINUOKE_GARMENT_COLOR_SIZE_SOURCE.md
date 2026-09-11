# Ainuoke 6087105 Garment Color / Size Source

## Decision status and safety boundary

- Status: **candidate source validated / pending explicit user approval** (`Needs User Decision`).
- Report: `6087105` — 成衣分色分码明细; source view `v_cyfsfmmx`.
- This Gate adds a fixed read-only Bridge catalog entry, typed client, independent adapter, reconciliation report and sanitized tests. It does **not** switch the existing/default Bootstrap Color Source away from 6086997.
- No real PostgreSQL bootstrap, Browser Order Center cutover/write, Ainuoke write, 6087050 read, Quote/Style Progress/Scheduling/Closing write or Phase 2B3 occurred.
- 6086997 catalog/adapter/tests and the historical Phase 2B2 evidence remain intact.

## Fixed read contract

Browser code selects only `garment_color_size_details`. The Bridge owns the following upstream definition:

| Property | Fixed value |
| --- | --- |
| report ID | `6087105` |
| label | 成衣分色分码明细 |
| query kind | `inside_order` |
| field | `insideorderno` |
| compare type | `contains` |
| flow name | `[内层]` |

The browser/request cannot supply a raw report ID, endpoint, `sqlCdtn` or `conditionList`. Paging reuses the existing credential/session, bounded timeout, one auth-expiry replay, sanitization and secret-redaction boundary. The typed client fails closed on page drift, total drift, incomplete pagination, unexpected report ID, query-context mismatch and page-limit exhaustion.

Because upstream uses `contains`, every completed result is post-filtered again:

```text
normalize(row.insideorderno) === normalize(requestedInsideOrderNo)
```

Normalization uses NFKC, trim, case normalization and whitespace normalization. Non-exact rows are counted as `containsFalsePositiveRows` and never enter the target order projection. Upstream rows with no exact match mean `colorDetailStatus=missing`; they do not mean the SalesOrder is absent.

## Typed source facts

The independent adapter maps only evidenced fields:

| Typed field | 6087105 field |
| --- | --- |
| `salesContractNo` | `BillNo` |
| `styleNo` | `GoodsNo` |
| `insideOrderNo` | `insideorderno` |
| `customerOrderNo` | `CustomerOrderNo` |
| `sizeRuleRaw` | `SizeRule` |
| `colorName` | `CnColor` |
| `quantity` | `SizeNum` |
| `deliveryDate` | `DeliveryDate` |
| `sizeAllocations[n]` | `SizeRule token[n]` + `Size(n+1)` |

`SizeRule` is an ordered CSV-like list. Only trim/Unicode normalization is allowed. The adapter does not alphabetically/numerically sort, remove intermediate zero slots, reorder, or guess names. Each color row uses its own rule. It maps at most Size1…Size26 and never invents Size27+.

`SizeNum=0` with all SizeN absent/zero is legal and the color remains present. Positive rows with size allocations validate `sum(SizeN) == SizeNum`; mismatch, missing allocation, missing SizeRule and populated SizeN beyond the rule are explicit typed evidence and never silently corrected.

## Identity and fail-closed semantics

The upstream `id` is not line identity: D1935's five distinct color rows all carry `id=6204`. Stable trace identity therefore remains the Bridge canonical identity:

```text
SHA-256(normalized whole sanitized source row)
```

Array index, page, fetchedAt, random values and color name alone are prohibited as identity. A usable color slice must have no duplicate canonical identities. Blank `CnColor`, invalid `SizeNum`, BillNo mismatch or duplicate canonical identity makes the entire order color slice `invalid`; partial apparently valid rows are not emitted as a supposedly complete slice. GoodsNo/style differences are reported without invented correction.

Color enrichment is not a SalesOrder existence gate. `missing` or `invalid` color detail becomes an enrichment warning/invalid result while the 6086103 SalesOrder Candidate may still exist.

## Authoritative live validation — 2026-09-11

The authoritative run used one complete Discovery before, all 511 fixed 6087105 queries at concurrency 4, then one complete Discovery after.

| Metric | Result |
| --- | ---: |
| Discovery before / after | 511 / 511 |
| Discovery pages before / after | 11 / 11 |
| Status distribution | 草拟 368; 生效 143 |
| Before / after hash | `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78` |
| Added / removed / changed identity | 0 / 0 / 0 |
| Snapshot stable | YES |
| 6087105 queries success / failure | 511 / 0 |
| 6087105 pages | 511 |
| Orders with exact rows / no exact detail | 503 / 8 |
| Exact rows | 1,378 |
| Contains false-positive rows excluded | 174 |
| Usable-color orders | 497 |
| Blank-color rows / invalid-quantity rows | 6 / 15 |
| Duplicate canonical identity groups | 3 |
| Duplicate usable source identities | 0 |
| Cross-order contamination after filter | 0 |
| BillNo / InsideOrderNo / GoodsNo mismatch | 0 / 0 / 0 |
| Zero-quantity color rows | 2 |
| Same-color repeated orders | 97 |

All 497 usable-color orders had exact color quantity parity with their 6086103 contract quantity: equal 497, lower 0, higher 0. Repeated color names are retained as separate source rows because color name alone is not identity.

The six invalid orders separate into two explainable fail-closed structures:

- three non-anchor orders contain 9 invalid `SizeNum` rows in total while other rows carry valid quantities;
- old blockers T1829-2, T1795-2 and T2017-2 each contain two identical empty placeholder rows. Across these three orders the placeholders account for 6 blank colors, 6 invalid SizeNum values and 3 duplicate canonical identity groups. Their nonblank rows sum to contract quantity, but the complete slice correctly remains invalid rather than silently dropping the placeholders.

Eight orders returned no upstream/exact detail. This is recorded as missing color enrichment, not missing SalesOrder.

## SizeRule / matrix evidence

| Metric | Result |
| --- | ---: |
| Rows with / without SizeRule | 1,372 / 6 |
| Distinct SizeRule patterns | 41 |
| Token count range | 1…25 |
| Highest populated SizeN within rule / beyond rule | 1,378 / 0 |
| Positive SizeNum: valid / mismatch / no allocation | 1,361 / 0 / 0 |
| Zero SizeNum: with / without SizeN | 0 / 2 |
| Orders with multiple SizeRule patterns | 3 |

Token-count distribution:

| Tokens | Rows |
| ---: | ---: |
| 1 | 2 |
| 2 | 8 |
| 3 | 16 |
| 4 | 72 |
| 5 | 354 |
| 6 | 80 |
| 7 | 98 |
| 8 | 24 |
| 9 | 5 |
| 10 | 657 |
| 25 | 56 |

## PO and color-level delivery evidence

- `CustomerOrderNo`: non-empty on 332 rows across 221 orders; 30 orders expose more than one non-empty PO value. This is source evidence only and is not persisted by this Gate.
- `DeliveryDate`: present on all 1,378 exact rows across 503 orders; 20 orders expose multiple color-level dates. This Gate does not expand PostgreSQL PO or size-matrix schema.

## Anchor assertions

| InsideOrderNo | Exact/usable color rows | `sum(SizeNum)` | Matrix evidence | Result |
| --- | ---: | ---: | --- | --- |
| D1935 | 5 | 4,640 | positive rows valid; two zero rows without SizeN legal | PASS |
| T1826-4 | 3 | 3,730 | all valid | PASS |
| 1917U | 2 | 9,393 | all valid | PASS |

## Historical Phase 2B2 blocker comparison

`usable colors` below means usable 6087105 color rows. Difference is `sum(SizeNum) - contract quantity`.

| InsideOrderNo | Contract | Exact | Usable colors | Color total | Contract qty | Diff | SizeRule | Matrix | Duplicate identity | Disposition |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| 0924/904(37438-N) | PI2507-132 | 1 | 1 | 12,000 | 12,000 | 0 | YES | valid | 0 | resolved |
| 4190/288(37993-N) | PI2508-001 | 1 | 1 | 1,200 | 1,200 | 0 | YES | valid | 0 | resolved |
| 6221/227(38361-N) | PI2508-024 | 2 | 2 | 3,500 | 3,500 | 0 | YES | valid | 0 | resolved |
| T1826-4 | PI2508-025 | 3 | 3 | 3,730 | 3,730 | 0 | YES | valid | 0 | resolved |
| T1825-1 | PI2508-055 | 2 | 2 | 4,000 | 4,000 | 0 | YES | valid | 0 | resolved |
| T2073 | PI2508-068 | 6 | 6 | 19,870 | 19,870 | 0 | YES | valid | 0 | resolved |
| 7892W | PI2509-089 | 1 | 1 | 9,664 | 9,664 | 0 | YES | valid | 0 | resolved |
| 7894T | PI2509-114 | 3 | 3 | 8,554 | 8,554 | 0 | YES | valid | 0 | resolved |
| 1230/227-10(39623-N) | PI2510-036 | 2 | 2 | 2,900 | 2,900 | 0 | YES | valid | 0 | resolved |
| 8075-1 | PI2510-094 | 15 | 15 | 21,871 | 21,871 | 0 | YES | valid | 0 | resolved |
| 1917U | PI2511-141 | 2 | 2 | 9,393 | 9,393 | 0 | YES | valid | 0 | resolved |
| 3298/226-3(46026-N) | PI2512-115 | 1 | 1 | 680 | 680 | 0 | YES | valid | 0 | resolved |
| 8828 | PI2603-058 | 1 | 1 | 11,512 | 11,512 | 0 | YES | valid | 0 | resolved |
| TOWW26PBCUI | PI2603-116 | 2 | 2 | 21,000 | 21,000 | 0 | YES | valid | 0 | resolved |
| 4091 | PI2603-151 | 15 | 15 | 36,825 | 36,825 | 0 | YES | valid | 0 | resolved |
| 1053914-2 | PI2606-009 | 3 | 3 | 5,300 | 5,300 | 0 | YES | valid | 0 | resolved |
| 7759/332(66046-N+66045-N) | PI2608-143 | 2 | 2 | 22,000 | 22,000 | 0 | YES | valid | 0 | resolved |
| 5471-1 | PI2608-249 | 4 | 4 | 9,200 | 9,200 | 0 | YES | valid | 0 | resolved |
| 9017C | PI2608-251 | 1 | 1 | 11,306 | 11,306 | 0 | YES | valid | 0 | resolved |
| T2403 | PI2608-266 | 5 | 5 | 10,700 | 10,700 | 0 | YES | valid | 0 | resolved |
| T2397 | PI2608-267 | 5 | 5 | 10,606 | 10,606 | 0 | YES | valid | 0 | resolved |
| 2276C | PI2608-284 | 1 | 1 | 10,416 | 10,416 | 0 | YES | valid | 0 | resolved |
| 7621/226-1(66540-N) | PI2609-039 | 1 | 1 | 12,000 | 12,000 | 0 | YES | valid | 0 | resolved |
| 3923 | PI2609-077 | 4 | 4 | 50,607 | 50,607 | 0 | YES | valid | 0 | resolved |
| 9199/226(66591-N) | PI2609-084 | 1 | 1 | 12,000 | 12,000 | 0 | YES | valid | 0 | resolved |
| 9200/226(66645-N) | PI2609-085 | 1 | 1 | 1,000 | 1,000 | 0 | YES | valid | 0 | resolved |
| D1992 | PI2609-086 | 4 | 4 | 5,152 | 5,152 | 0 | YES | valid | 0 | resolved |
| 1864 | PI2609-096 | 2 | 2 | 32,584 | 32,584 | 0 | YES | valid | 0 | resolved |
| 4317 | PI2609-097 | 2 | 2 | 4,349 | 4,349 | 0 | YES | valid | 0 | resolved |
| 3298/226-2(29326-N) | PI2506-048 | 1 | 1 | 13,500 | 13,500 | 0 | YES | valid | 0 | resolved |
| 1400/332-16(38312-N ) | PI2508-023 | 2 | 2 | 4,400 | 4,400 | 0 | YES | valid | 0 | resolved |
| T1829-2 | PI2508-053 | 6 | 0 | 3,799* | 3,799 | — | PARTIAL | valid + rule missing | 1 | invalid |
| T1795-2 | PI2508-054 | 6 | 0 | 5,700* | 5,700 | — | PARTIAL | valid + rule missing | 1 | invalid |
| T2017-2 | PI2508-072 | 9 | 0 | 9,700* | 9,700 | — | PARTIAL | valid + rule missing | 1 | invalid |

`*` The numeric sum of nonblank rows happens to match the contract, but each result also contains two identical blank/invalid placeholder rows. Fail-closed semantics prohibit treating the partial rows as a usable complete slice.

Summary: resolved 31, still missing 0, invalid 3, quantity-warning-only 0.

## Read accounting and data protection

- Authoritative run: 533 successful report-page reads (22 × 6086103, 511 × 6087105).
- Two later safe aggregate/classification passes recovered terminal-truncated anomaly and token-distribution output: 1,044 successful pages (22 × 6086103, 1,022 × 6087105). They did not perform a second authoritative stale guard or persist raw payload.
- Phase 2B2.1 total: 1,577 successful report-page reads; 6086997 reads 0; 6087050 reads 0.
- Ainuoke writes, real PostgreSQL business writes, Browser writes and Quote/Style Progress/Scheduling/Closing writes: 0.
- Committed fixtures contain only sanitized color/size structures and no customer/contact/account/credential/token/cookie/raw 511-row payload.

## Recommendation and next boundary

`RECOMMEND_REPLACE_6086997_WITH_6087105 = YES`, based on stable Discovery, complete query success, exact post-filtering, zero usable identity collisions/cross-order contamination, 497/497 usable quantity parity, valid anchors, and 31/34 historical blockers resolved with the remaining three correctly fail-closed.

This recommendation is not approval. The current/default Bootstrap Preview still uses 6086997. The next step, only after explicit user confirmation, is a separate change that selects 6087105 for Preview and reruns a fresh full Bootstrap Preview. It still must not delete 6086997 or execute real bootstrap without separate authorization.

## Final automated validation

- Bridge Python tests: 36/36 PASS.
- Relevant Ainuoke/Discovery/6086997/Bootstrap Preview targeted tests: 40/40 PASS.
- Full npm tests: 595/595 PASS.
- TypeScript, zero-warning ESLint, server build and frontend Production Build: PASS; frontend prerendered 30 routes and retained the existing non-fatal chunk-size advisory.
- `git diff --check`: PASS.
- PostgreSQL integration and Style Progress benchmark were not rerun because this Gate changed neither PostgreSQL/server persistence nor Style Progress behavior.
