# Ainuoke 6087105 Garment Color / Size Source

## 2026-10-24 保存证据的 Server 只读投影（本地前向候选）

现有接纳已保存的颜色metadata通过白名单验证后返回typed sizeEvidence，保留slot顺序、
quantity pending/null/显式0及记录时matrix状态；缺失、结构无效、过大和来源不可信各有状态，
不清空颜色、不推算尺码或过期时间。额外metadata/价格/hash/凭据不出DTO。
合同颜色摘要时间仅为已保存Discovery/颜色批次最大时间，不称逐颜色读取时间。
复用a187原Gate4A，当前验收见[前移任务](../tasks/active/order-source-readchain-current-2026-10-24.md)。
未接4B页面、真实采集/绑定/激活或部署；下列历史阶段事实保留原日期。

## 2026-10-14 后续用户修订（D-117，当前工程规则）
具名且总量/所有尺码数量均空的颜色投影为0，保留sourceQuantity:null与quantityPendingConfirmation:true；对应PENDING_COLOR_QUANTITY_ZERO不阻断颜色可用。原始null与明确0在hash、metadata和订单提醒中可区分。负数/非法值/总量空但尺码已有值不转换。下文D-116“具名数量null”的旧规则由此替代；无名纯空占位规则保持。六份旧异常报告离线重放已全部usable，保留九条待定0颜色并排除六条纯空占位；不是实时采集或真实激活。

## 2026-10-14 用户确认规则（D-116，工程候选）

`CnColor`、`SizeNum`、所有 `SizeN` 均为真正空值才是可排除占位；0、非法值和具名颜色不排除。Adapter `rows`/`exactRows` 保留所有 exact 原始证据，`usableRows` 只排除批准的空占位，逐行 `excludedAsEmptyPlaceholder` 与 `EMPTY_PLACEHOLDER_EXCLUDED` 记录原因，来源 hash 包含排除身份。重复的纯空占位允许排除；与实际颜色共用身份仍阻断。仅有占位时为 missing，不冒称 usable。

具名空数量仍保留 null 及 INVALID_SIZE_NUM，未迁移正式颜色模型、未放宽完整首绑。离线复用旧六份私有报告：三个合同各排除两条空占位后 usable，另外三个合同合计九条具名空数量仍 invalid。无需重跑558合同。此为本地工程重放结果，不代表 GitHub 合并、实时读取或真实激活。

## Current status

- Phase: **Phase 2B2.3 final fresh Bootstrap Preview complete; 6087105 remains the Active source**.
- Active source decision: report `6087105`（成衣分色分码明细）is the formal current SalesOrder color/size source.
- Stable Ainuoke business association: normalized `SalesContractNo` / `BillNo`.
- `InsideOrderNo` is a mutable source attribute, not long-term source identity.
- Report `6086997` remains in catalog/code/tests as the legacy / historical Phase 2B2 color source; it is not the formal current SalesOrder color source.
- This phase performed read-only Ainuoke validation only. It did not execute real PostgreSQL bootstrap, Browser Order Center cutover, or any Ainuoke/Browser/business write.

## Fixed read contract

| Property | Contract |
| --- | --- |
| catalog key | `garment_color_size_details` |
| report ID | `6087105` |
| query kind | `sales_contract` |
| browser query context | `{ salesContractNo }` |
| fixed upstream field | `BillNo` |
| fixed compare type | `contains` |
| flow | `[内层]` |
| page size / concurrency | 50 / 4 in validation |

The Bridge owns reportId, endpoint, fieldName, compareType and conditionList. Browser callers cannot supply or override these controls, and `insideOrderNo` cannot be mixed with `salesContractNo` for this report.

The adapter performs this exact post-filter after complete bounded pagination:

```text
normalize(row.BillNo) === normalize(requestedSalesContractNo)
```

`contains` false positives are counted but excluded from projection. `row.insideorderno` never decides whether a row belongs to the target contract.

## Identity and drift

Full 6086103 empty-query Discovery remains the main-fact source. The formal path builds a local normalized BillNo index and fails closed if BillNo is blank or duplicated in the current Discovery.

For every exact 6087105 row the adapter preserves:

- `requestedSalesContractNo`
- `discoveryInsideOrderNo`
- `detailInsideOrderNos`
- row-level and source-level `insideOrderNoDrift`

Same BillNo with a changed InsideOrderNo is valid detail and produces informational `inside_order_no_drift` evidence. It must not invalidate the color slice, classify it missing, create a second SalesOrder, replace PostgreSQL UUID/order_no, unbind the source, or lose source-owned detail.

`GoodsNo` differences remain explicit non-blocking evidence. No field is guessed or silently corrected.

## Typed row mapping

2026-10-09 hardening: the adapter independently checks nonnegative integer total, positive integer pageSize, contiguous constant-size/total pages and full nonfinal pages, including valid single-page empty results. A SizeRule with more than 26 tokens retains all tokens and produces existing `SIZE_MATRIX_RULE_OVERFLOW` evidence; slots beyond the proven Size1..26 receive null allocation rather than throwing or inventing quantities. This remains a non-blocking size anomaly, preserving the existing color missing/invalid/usable policy.

| Typed fact | 6087105 field |
| --- | --- |
| `salesContractNo` | `BillNo` |
| `insideOrderNo` | `insideorderno` |
| `styleNo` | `GoodsNo` |
| `customerOrderNo` | `CustomerOrderNo` |
| `colorName` | `CnColor` |
| `quantity` | `SizeNum` |
| `deliveryDate` | `DeliveryDate` |
| `sizeRuleTokens` | ordered `SizeRule` CSV |
| size allocations | `Size1..Size26` mapped by token position |

The upstream `id` is not a color-line identity. Trace uses deterministic SHA-256 of the normalized sanitized whole row. Blank color, invalid SizeNum, or duplicate canonical row identity fail the complete exact color slice closed as `invalid`. SizeRule/matrix anomalies stay typed evidence and do not invent facts.

`SizeNum=0` with absent/zero SizeN is legal and retained. Size tokens preserve upstream order; they are not sorted or gap-filled.

## Missing / invalid semantics

6087105 color data is enrichment, not the SalesOrder existence gate:

- zero exact BillNo rows → `colorDetailStatus = missing`
- critical exact-row anomaly → `colorDetailStatus = invalid`
- both states still allow the SalesOrder main candidate / creation

Discovery `ContractDate`, `DeliveryDate` and `Status` remain source facts. `contractAgeDays` may be recorded for future policy, but no “N days is normal” threshold is hard-coded.

## Phase 2B2.2 authoritative read-only validation

The run performed complete Discovery before, all current-account-visible 6087105 BillNo queries at concurrency 4, then complete Discovery after.

| Metric | Result |
| --- | ---: |
| Discovery before / after | 511 / 511 |
| Discovery pages before / after | 11 / 11 |
| status distribution | 草拟 368 / 生效 143 |
| before / after normalized hash | `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78` / same |
| added / removed / changed identity | 0 / 0 / 0 |
| snapshot stable | YES |
| 6087105 query success / failure | 511 / 0 |
| 6087105 pages | 511 |
| exact BillNo orders / no-detail | 511 / 0 |
| exact rows / contains false positives | 1,390 / 0 |
| usable / missing / invalid orders | 505 / 0 / 6 |
| usable color total = contract quantity | 505 |
| lower / higher | 0 / 0 |
| blank color / invalid quantity rows | 6 / 15 |
| duplicate canonical identity groups | 3 |
| zero-quantity color rows | 2 |
| orders with InsideOrderNo drift | 8 |
| GoodsNo mismatch | 0 |

Successful Ainuoke report-page reads for the authoritative run: 533 (`6086103` 22, `6087105` 511, `6086997` 0, `6087050` 0). Ainuoke writes and all business writes: 0.

## Former missing eight

All eight Phase 2B2.1 InsideOrderNo-query misses were recovered by BillNo. Each is usable, quantity-equal, and correctly classified as drift rather than missing/invalid.

| SalesContractNo | 6086103 InsideOrderNo | 6087105 InsideOrderNo(s) | Exact / usable | Color total / contract qty | SizeRule / matrix | Drift | Disposition |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| PI2608-257 | `6615/332-1(50899-N)` | `9184/332(50899-N)` | 1 / 1 | 15,000 / 15,000 | YES / VALID | YES | resolved |
| PI2608-069 | `5755/906(66200-N)` | `0590/906(66200-N)` | 1 / 1 | 950 / 950 | YES / VALID | YES | resolved |
| PI2608-026 | `6616/332-3(65981-N+65923-N)` | `9175/332(65981-N+65923-N)` | 2 / 2 | 18,000 / 18,000 | YES / VALID | YES | resolved |
| PI2608-006 | `3566/222-6(65986-N+65987-N+65988-N)` | `7282/222(65987-N+65988-N)` | 1 / 1 | 15,075 / 15,075 | YES / VALID | YES | resolved |
| PI2607-293 | `6755/226-3(65840-N)` | `7621/226(65840-N)` | 1 / 1 | 10,000 / 10,000 | YES / VALID | YES | resolved |
| PI2607-246 | `5794/904(65288-N+65405-N+65406-N+65847-N)` | `7994/904(65847-N)` | 4 / 4 | 35,500 / 35,500 | YES / VALID | YES | resolved |
| PI2603-127 | `2359/332-9(48767-N+48768-N+48769-N)` | `6590/332(49802-N+48767-N+48768-N+48769-N)` | 1 / 1 | 18,000 / 18,000 | YES / VALID | YES | resolved |
| PI2512-121 | `5384/086-1(46021-N)` | `5466/086(46021-N)` | 1 / 1 | 9,000 / 9,000 | YES / VALID | YES | resolved |

PI2512-121 is the explicit regression anchor: BillNo lookup finds its real color data despite the changed InsideOrderNo. Result: **PASS**.

## Detail-report query audit

| Report path | Proven transport query | Classification / rule |
| --- | --- | --- |
| 6086103 `order_discovery` | empty conditionList | formal main-fact Discovery; build unique BillNo index locally |
| 6086103 `sales_contracts` | `InsideOrderNo contains` | retained legacy detail capability; formal bootstrap need not call it per order |
| 6087105 | `BillNo contains` | supports SalesContractNo query; formal SalesOrder color/size source |
| 6086997 | `InsideOrderNo is` | BillNo query not independently proven; legacy/historical color source |
| 6087050 | `insideorderno is` | BillNo query not independently proven; current InsideOrderNo may be transport-only, final identity remains SalesContractNo |

No fieldName/compareType was guessed, and 6087050 was not business-read in this phase.

## Boundaries and next step

No PostgreSQL schema/table/identity model changed. Existing `sales_orders` UUID and immutable `sales_order_source_links` remain authoritative. Browser Order Center still uses the Browser Repository.

The Phase 2B2.3 fresh Preview is complete: 511 BillNo queries yielded 505 usable, 0 missing and 6 invalid candidates; all 511 aggregates passed the disposable PostgreSQL service path. A real bootstrap still requires separate explicit authorization. Browser cutover remains a separate later Gate.
