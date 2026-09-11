# SalesOrder PostgreSQL Persistence Foundation

## Status and scope

- Phase: PostgreSQL Phase 2B1 SalesOrder Server Foundation complete; Phase 2B2 Bootstrap Preview / Dry Run complete on `feat/postgres-salesorder-bootstrap-preview`.
- Phase 2B2 baseline: `f424a9b78f66dffdd47075f8ff29ea5f3590717b` (`main`, Phase 2B1 PR #17 merged).
- Phase 2B1 implements PostgreSQL schema, parameterized repository, transactional Ainuoke-created SalesOrder service, typed read API and disposable PostgreSQL integration tests.
- This is not a Browser Order Center cutover and not a real bootstrap. Browser runtime remains on its existing Repository; no Browser DEV data was read, imported, modified or deleted.
- No live Ainuoke read/write or real 505 bootstrap occurred. Quote, Style Progress, Scheduling and Closing were not migrated or mutated.

Phase 2B2 subsequently performed authorized live **reads only** for Discovery/6086103/6086997, built no UUID, and made no real PostgreSQL or Browser write. Its complete evidence and blockers are recorded in `SALES_ORDER_BOOTSTRAP_PREVIEW.md`.

Phase 2B2.1 subsequently validated 6087105 as a cleaner candidate garment color/size source. The fixed support and evidence do not change the current/default 6086997 Preview path; source replacement remains pending explicit user approval. No PostgreSQL schema or business write was added.

## Phase 2B2 Bootstrap Preview result

- Final Discovery observed 507 current-account-visible contracts: `草拟=364`, `生效=143`. Status was preserved without filtering; historical 505 is not a constant.
- Ten mapped-field parity samples passed, so the Preview reused 6086103 Discovery rows and performed only ten additional 6086103 detail page reads. Every row still received complete 6086997 pagination through the existing adapter.
- The second complete Discovery matched the first: hash `95b36d6375ab8061731ef976debffa41b46995da6e8c8146b32960e9ff616261`, total 507, added/removed/changed identity all zero.
- All 507 rows remained bootstrap scope candidates. 473 formed strict in-memory `SalesOrderBootstrapCandidate` projections; 34 were blocked by 6086997 structure (29 missing required `stylecolor`, 5 duplicate canonical source-row identity). There were 26 uncorrected color/contract quantity-difference warnings.
- The 473 valid projections passed `createAinuokeSalesOrder` in a disposable PG16 database: created 473, idempotent returns 473, rejected/schema/source-link conflicts 0, rollback probe 1, trusted OperationLogs 473. The database was destroyed.
- Formal `order_no` policy is still `NEEDS_USER_DECISION`; `PREVIEW-######` values were disposable-test-only. Therefore real bootstrap readiness is **NO**, despite stable snapshots and successful subset dry-run.

## Phase 2B1 implemented boundary

### Migration and tables

Forward-only migration `database/migrations/0002_sales_order_foundation.sql` adds exactly four domain tables:

- `sales_orders`: stable PostgreSQL UUID identity, normalized unique `order_no`, immutable creation provenance, Zhixu-owned lifecycle state, optimistic `version`, `created_at` and `updated_at`.
- `sales_order_source_links`: immutable `(source_system, source_entity_type, external_id) → sales_order_id` binding with current `sales_contract_no` and `inside_order_no` lookup facts. Database uniqueness and trigger protection prevent one source identity from binding two orders or refresh from silently moving a binding.
- `ainuoke_sales_order_contract_mirrors`: one current typed contract source slice per SalesOrder, including verified identity, raw lifecycle status, contract/delivery dates, style, company/customer/brand snapshots, quantity, source hash/fetched-at and sanitized object metadata.
- `ainuoke_sales_order_color_mirrors`: normalized current color children with stable source-line identity, color, source quantity, optional proven delivery date and sanitized metadata.

`order_no` reuses the existing NFKC + trim + uppercase normalization before insert and has a database functional unique index/check. SalesOrder identity/creation provenance cannot be updated; an owned aggregate update must supply the expected version and increment it by exactly one. Source mirror refresh never updates that UUID, provenance or version.

### Repository, transaction and read model

- `server/sales-orders/repository.ts` provides create, get-by-ID, get-by-source-identity, get-by-sales-contract-number, deterministic list, source-link create/update, current contract mirror upsert, current color slice replacement and optimistic lifecycle update. All values use PostgreSQL parameters; there is no generic SQL API.
- `createAinuokeSalesOrder(pool, trustedIdentity, input)` executes in one PostgreSQL transaction under a source-scoped advisory lock. It checks the source binding first; an existing binding returns the original SalesOrder ID/version without creating another aggregate or log. A new binding creates the SalesOrder, link, contract mirror, color slice and server OperationLog, then commits. Any failing step rolls everything back.
- Actor is not part of `CreateAinuokeSalesOrderInput`; it is a separate `TrustedIdentity` argument. OperationLog derives actor FK/public-ID/name snapshots only from that trusted identity, so request/body/extra input fields cannot impersonate the actor.
- `GET /api/v1/sales-orders` and `GET /api/v1/sales-orders/:id` require an existing trusted session plus `order.view`. They return a typed composed DTO of stable SalesOrder fields plus current Ainuoke projection; DB rows, raw source payload, source hash and source metadata are not exposed. Responses enforce 401 unauthenticated, 403 unauthorized and 404 missing detail.
- Disposable PG16 integration tests prove transactional create, duplicate-source idempotency, rollback, trusted actor, list/detail reads and two different trusted sessions observing the same PostgreSQL SalesOrder UUID/version.

Final Phase 2B1 validation: PostgreSQL integration 12/12, Full Tests 577/577, TypeScript, zero-warning ESLint, server build, frontend Production Build 30 routes and `git diff --check` all pass. The frontend build retains a non-failing chunk-size advisory.

## Confirmed implementation facts

- Current `SalesOrder` is a browser-local aggregate with stable string `id`; it is not the legacy PostgreSQL `orders` row.
- `sourceType` / `creationSource` support `manual | quote | reorder | ainuoke`. Quote conversion persists Quote/Revision/PriceVersion IDs; reorder persists `sourceOrderId`.
- Ainuoke contract sync derives current contract facts from reports 6086103/6086997. It updates `salesContractNo`, customer/brand/style/factory-style snapshots, contract quantity projection, contract delivery, source DeliveryPlan rows and source OrderColorLine rows.
- Ainuoke resync preserves non-Ainuoke quantity adjustments and manual DeliveryPlan rows. It does not rebuild price history, execution material snapshots, attachments, scheduling, closing, Quote/reorder provenance or other Zhixu edits.
- Existing detail/unified query DTO still requires exactly one non-empty `insideOrderNo`. Separately, the Order Discovery Gate verified the actual 6086103 “成衣销售合同” empty-condition list and added a fixed `order_discovery` read foundation. It can enumerate the current bound account's visible rows from empty state; it does not prove company-wide visibility. Every discovered visible contract is a clean-bootstrap candidate, and raw Ainuoke `Status` is not an inclusion filter.
- Current Browser `SalesOrder.id` is referenced by order child records, Ainuoke `boundOrderId`, `ScheduleAssignment`, `OrderExecutionTracking`, `ScheduleBatchAllocation`, `ClosingAllocation`, OperationLog context and reorder provenance. That proves identity must be stable inside any retained dataset. It does **not** require future formal PostgreSQL orders to inherit IDs from the current Browser Order/Scheduling test dataset; newly bootstrapped PostgreSQL identities must instead remain stable from their creation onward.
- Style Progress is different: current operational facts bind primarily by `salesContractNo`, while optional OperationLog context can also contain `orderId`.
- The repository contains no committed real Browser Backup. The historical `464` count describes one acceptance profile at a point in time; it is not a migration inventory and cannot be divided into A/B/C counts from repository evidence.

## Field-level ownership matrix

| Field / child entity | Current source of truth | Ainuoke-rebuildable? | Zhixu-owned? | Stable internal ID needed? | May resync overwrite? | PostgreSQL persistence required? |
| --- | --- | --- | --- | --- | --- | --- |
| `SalesOrder.id` / aggregate identity | Zhixu-generated stable ID | No | Yes | Yes; cross-domain anchor | Never | Yes |
| `orderNo` | Zhixu generated/manual value; normalized unique | No | Yes | Yes as stable business key, but not a replacement for `id` | Never | Yes |
| `creationSource`, `sourceType`, lifecycle `status` | Zhixu creation/workflow provenance | No | Yes | Aggregate ID anchors it | Never from source sync | Yes |
| `salesContractNo` and source binding | Ainuoke contract fact plus Zhixu binding decision | Conditionally, after discovery/known `insideOrderNo` | Binding is Zhixu-owned | Yes; source-to-order mapping must be stable | Only through validated source binding/reconciliation | Yes |
| `styleNo` | Ainuoke for bound orders; Quote/manual for native orders | Conditional | Conditional | No separate child ID | Yes only for Ainuoke-owned source projection | Yes |
| `factoryStyleNo` / current API `InsideOrderNo` | Ainuoke source | Conditional | No for bound orders | Stable source mapping needed | Yes for source projection | Yes, including discovery/mapping use |
| customer / brand snapshots and resolved IDs | Ainuoke source for bound orders; Quote/manual otherwise; brand ID is Zhixu master-data resolution | Conditional | Resolution and native snapshots are Zhixu-owned | Referenced master IDs must stay stable | Source snapshot may refresh; resolved ID only via deterministic reconciliation | Yes |
| `customerPoNo` | Quote/manual/user input; current API adapter deliberately leaves `poNo` empty | No with current reports | Yes | Aggregate ID anchors it | No | Yes |
| order date, salesperson and merchandiser snapshots | Quote/manual/Ainuoke-create defaults plus Zhixu edits | No | Yes | Referenced master IDs should stay stable | No | Yes |
| `initialQuantity` | Immutable Zhixu baseline; equals source quantity only when an Ainuoke order is first created | Current value only conditionally; historical baseline cannot generally be reconstructed | Yes as baseline semantics | Aggregate ID anchors it | Never; current code appends changes | Yes |
| current Ainuoke contract quantity | Ainuoke contract mirror | Yes after discovery | No | Source identity/link needed | Yes, source-owned | Persist current mirror; raw history policy is a decision |
| `OrderQuantityChange[]` and color adjustments | Mixed: Ainuoke sync deltas plus manual/system append-only decisions | Current source total is rebuildable; event history/timestamps are not | Manual/system adjustments are yes | Yes for audit and color references | Never overwrite manual/system adjustments | Yes; proposed schema should separate source total from owned adjustments |
| `OrderColorLine[]` | Ainuoke 6086997 source; deterministic current IDs | Yes after discovery and complete detail read | No, except manual adjustments stored elsewhere | Stable line/source identity needed for adjustments | Replace source lines only; preserve adjustments | Persist current mirror/projection |
| `contractDeliveryDate` | Ainuoke 6086103 | Yes after discovery | No for bound orders | Aggregate/source link anchors it | Yes, source-owned | Persist current mirror/projection |
| `DeliveryPlan[]` | Mixed source/manual collection | Current API can rebuild only the fallback contract-date plan because 6086997 adapter currently has no proven per-color delivery date | Manual plans are yes | Yes for manual/history references | Replace only `source=ainuoke_sync`; preserve manual/voided history | Yes |
| `OrderPriceVersion[]` | Quote snapshot plus Zhixu price adjustments | No | Yes | Yes; append-only child identity | Never | Yes |
| `currentPriceVersionId` | Zhixu authoritative pointer | No | Yes | Yes; must reference same order | Never | Yes, with enforced same-owner FK/invariant |
| fabric/trim execution snapshots | Quote conversion or Zhixu entry; current Ainuoke contract adapter does not populate them | No | Yes | Stable child IDs useful for audit | Never | Yes |
| purchased-trim / settlement price snapshots | Zhixu rules and price state | No | Yes | Aggregate/rule references must remain stable | Source sync may refresh only the deterministic rule snapshot under current override semantics | Yes |
| `averageDailyOutput` | Zhixu order reference used to initialize assignments | No | Yes | Aggregate ID anchors it | Never | Yes |
| `businessConfirmedDeliveryDate`, `inspectionDate` | Zhixu user input | No | Yes | Aggregate ID anchors it | Never | Yes |
| production country, process/customer requirements, remarks | Quote/manual defaults plus Zhixu edits; not supplied by current contract reports | No in general | Yes | Aggregate ID anchors it | Never | Yes |
| attachment references and Blob | Quote-derived or Zhixu uploads; order stores attachment IDs | No | Yes | Yes; attachment IDs must survive | Never | References in PostgreSQL; Blob in future object storage |
| Scheduling references | Separate Zhixu `ScheduleAssignment` / tracking / batch facts keyed by `salesOrderId` | No | Yes | Yes | Never by Ainuoke resync | Yes for future formal Scheduling; current Browser test Scheduling will not be migrated |
| Closing references | Separate Zhixu allocation/snapshot facts keyed by `salesOrderId` and optional assignment ID | No | Yes | Yes | Never by Ainuoke resync | Yes when Closing domain migrates; ID continuity required now |
| OperationLog references | Append-only Zhixu audit context with `orderId` and snapshots | No | Yes | Yes | Never | Yes; server append-only log |
| Quote provenance | `sourceQuoteId/sourceRevisionId/sourcePriceVersionId` | No | Yes | Yes | Never | Yes; until Quote cutover, retain stable external IDs without pretending a PG FK exists |
| reorder provenance | `sourceOrderId` self-reference | No | Yes | Yes | Never | Yes, self-FK once both orders exist |
| Ainuoke mirror/import/sync metadata | Report/source hashes, fetched time, disposition, `boundOrderId`, ImportRun | Current snapshot can be reread only after discovery; historical runs cannot | Binding/disposition/audit policy are Zhixu-owned | Yes | Refresh current source metadata; never replace binding/history silently | Retain normalized mirror, hashes, necessary timestamps and reconciliation metadata; do not retain complete raw payload by default |

## Historical logical classification of Browser SalesOrder

> The A/B/C predicates below remain useful ownership-analysis history, but are **Superseded for current Browser Order/Scheduling migration strategy**. The user has confirmed those stores are test data and are not the formal PostgreSQL bootstrap authority. This Gate does not read, classify, migrate, or delete them.

The classes are predicates, not counts:

### A. Pure Ainuoke rebuildable

An order has a verified Ainuoke source link and contains no Zhixu-owned business state beyond a replaceable projection: no manual/system quantity adjustment, manual DeliveryPlan, meaningful price history, execution snapshot, attachment, Quote/reorder provenance, scheduling, closing or retained order-linked audit requirement. Its source facts can be rebuilt only after a complete discovery source exists. Once PostgreSQL uses its stable SalesOrder ID, the identity mapping remains durable even when the source mirror is rebuilt.

### B. Ainuoke + Zhixu-owned state

An order has a verified Ainuoke source link and at least one Zhixu-owned fact or stable-ID dependency: manual quantity/color adjustment, manual/voided delivery plan, price/version pointer, execution material snapshot, user-entered dates/requirements, attachment, scheduling, closing, OperationLog, or Quote/reorder provenance. Rebuild Ainuoke facts and import owned facts; never replace the aggregate wholesale.

### C. Zhixu-native

An order has no verified Ainuoke source link and originates from `manual`, `quote` or `reorder`. It must be imported/re-entered from a Zhixu authority because current Ainuoke reports cannot reconstruct it. A later explicit Ainuoke binding would move it to B, not erase its provenance.

## Rebuildability and bootstrap gap

- **Confirmed:** known `InsideOrderNo` → fully paged 6086103/6086997/6087050 detail reads works.
- **Now confirmed:** empty state → fixed 6086103 empty-condition discovery → complete current-account-visible `InsideOrderNo` / `SalesContractNo` list. Phase 2B2's final two traversals returned the same 507 rows over 11 pages and the same normalized hash; D1935 plus nine date/status-spanning samples proved strict 6086103 Discovery/detail mapped-field parity.
- **Confirmed rule:** formal clean bootstrap includes every contract in the complete `current_account_visible` Discovery snapshot. `生效` and `草拟` both participate; raw status remains a source fact but is not an inclusion/exclusion rule. Observed totals such as 505 and 507 are snapshots, never fixed constants.
- **Confirmed scope:** `current_account_visible` is the formal organizational bootstrap scope. Discovery makes no hidden time/status filter and every run measures a fresh complete snapshot rather than expecting 505/507 or another constant.
- **Confirmed disappearance/retention:** source absence cannot authorize hard deletion, cancellation, UUID replacement or binding removal. Future reconciliation marks missing, retains history and restores seen on reappearance; long-term storage keeps normalized mirrors, hashes, necessary timestamps and reconciliation metadata without full raw upstream payload by default.

## Browser migration necessity

- Current Browser Order Center and Scheduling data is test data. It is not a formal migration source, bootstrap authority, stable-ID continuity requirement, or prerequisite classifier inventory.
- The historically observed 464 is only a past browser-profile count. Do not migrate it wholesale and do not infer A/B/C counts.
- Formal SalesOrder bootstrap direction is clean: discovery → detail reads → new PostgreSQL SalesOrder identity/source mapping → later Zhixu-owned facts and new formal Scheduling.
- Quote Center is real business data and must be preserved, including Quote/Revision/PriceVersion/provenance/attachments. Future Quote → Order conversion still requires stable PostgreSQL SalesOrder identity and provenance, but this Gate does not implement it.
- Style Progress/Material is outside the Order/Scheduling retirement scope and remains protected. Closing retirement status is Needs Decision.
- Browser test-data deletion is not authorized. A separate Test Business Data Retirement Gate must first export a complete backup, audit dependencies, list precise delete/protect scopes, and obtain explicit destructive confirmation.

## PostgreSQL boundary after Phase 2B1

Use a composed model: **Ainuoke source facts + Zhixu-owned SalesOrder aggregate**, not a monolithic Ainuoke Mirror and not a byte-for-byte Browser JSON copy.

- Phase 2B1 implements `sales_orders`, immutable `sales_order_source_links`, and Ainuoke current contract/color mirror tables with the source/owned separation above.
- Quantity/color adjustments, manual/voided delivery plans, price versions/current pointer, execution snapshots, attachment references and full Quote/reorder provenance remain future Zhixu-owned gates. They were intentionally not added to `0002`.
- Existing server OperationLog records mutations after successful domain transactions and references stable SalesOrder identity with business snapshots.
- Scheduling, Closing, Style Progress, Quote and Blob storage remain separate domain cutovers. Phase 2B must not claim their browser stores are migrated merely because SalesOrder IDs are reserved.

## Phase progression

1. **Phase 2A evidence/decision:** complete. Source/owned boundary, clean-bootstrap direction and Discovery semantics are recorded; Browser Order/Scheduling test data is not a migration source.
2. **Phase 2B1 Server Foundation:** complete. Migration/schema/repository/transactional create/read API are verified only in disposable PostgreSQL; there is no runtime cutover.
3. **Phase 2B2 Bootstrap Preview / Dry Run:** complete. The stable 507-row scope yielded 473 projectable candidates, 34 blocking color-detail issues and 26 warnings; the valid subset passed disposable PostgreSQL. No real bootstrap occurred.
4. **Phase 2B2.1 6087105 candidate validation:** complete. The old 34 are retained historically and reclassified as 31 resolved + 3 invalid under 6087105; order number, scope, disappearance and retention policies are confirmed. The default source was not switched. Final gates passed: Bridge 36/36, targeted 40/40, Full Tests 595/595, typecheck, lint, server/frontend builds and diff-check.
5. **Next user source decision:** decide whether 6087105 supersedes 6086997, then run a separate fresh full Bootstrap Preview if approved. This Gate does not perform that Preview.
6. **Later owned-state/API and cutover gates:** manual/Quote/reorder creation, remaining owned facts, separately authorized real bootstrap/read/write cutover and Browser retirement each require their own decisions and authorization.

## Decisions requiring user confirmation

The user has now confirmed these formal rules:

- server/PostgreSQL generates globally increasing, non-editable `SO-00000001` style order numbers while UUID remains the technical identity;
- `current_account_visible` is the formal organizational bootstrap scope, always measured by fresh complete Discovery rather than a fixed row count;
- source disappearance marks missing and retains UUID/binding/history; it does not hard-delete or auto-cancel, and reappearance restores seen;
- retain normalized current mirrors, source/discovery hashes, necessary fetched/last-seen/missing timestamps and reconciliation metadata, but not complete raw upstream payload by default.

Implementation of the sequence and missing/tombstone storage remains a later independent schema/service Gate. Decisions still requiring confirmation are:

1. Whether 6087105 formally supersedes 6086997 as the Bootstrap Preview color source. Current evidence recommends YES, but the default has not switched.
2. Whether a future phase proceeds beyond preview/dry-run to a separately approved real bootstrap/read cutover.
3. Closing test-data retirement classification. Browser Order/Scheduling retirement also requires a later explicit destructive confirmation; it is not implied by this architecture direction.

## Readiness

**PHASE 2B2 BOOTSTRAP PREVIEW COMPLETE; PHASE 2B2.1 CANDIDATE SOURCE VALIDATED. READY FOR REAL BOOTSTRAP: NO.** The original 6086997 run retains its 34 historical blockers. 6087105 now resolves/reclassifies them as 31 resolved + 3 invalid, and the order-number/scope/disappearance/retention policies are confirmed, but switching the Preview source still requires explicit user approval and a later fresh full Preview. No real bootstrap, Browser cutover or other domain migration is authorized.
