# SalesOrder Persistence Ownership Audit

## Status and scope

- Phase: PostgreSQL Persistence Phase 2A audit completed by PR #14; Order Discovery foundation is the current follow-up Gate.
- Baseline: `13620491cf56605cadf57c90c6cdf389f0919297` (PR #13 and PR #14 merged).
- No PostgreSQL SalesOrder table/API was created, no Repository was switched, and no Browser DEV data was read or imported.
- The boundary below is **Proposed / Needs Decision**, not an Active architecture decision and not authorization to begin Phase 2B.

## Confirmed implementation facts

- Current `SalesOrder` is a browser-local aggregate with stable string `id`; it is not the legacy PostgreSQL `orders` row.
- `sourceType` / `creationSource` support `manual | quote | reorder | ainuoke`. Quote conversion persists Quote/Revision/PriceVersion IDs; reorder persists `sourceOrderId`.
- Ainuoke contract sync derives current contract facts from reports 6086103/6086997. It updates `salesContractNo`, customer/brand/style/factory-style snapshots, contract quantity projection, contract delivery, source DeliveryPlan rows and source OrderColorLine rows.
- Ainuoke resync preserves non-Ainuoke quantity adjustments and manual DeliveryPlan rows. It does not rebuild price history, execution material snapshots, attachments, scheduling, closing, Quote/reorder provenance or other Zhixu edits.
- Existing detail/unified query DTO still requires exactly one non-empty `insideOrderNo`. Separately, the Order Discovery Gate verified the actual 6086103 “成衣销售合同” empty-condition list and added a fixed `order_discovery` read foundation. It can enumerate the current bound account's visible rows from empty state; it does not prove company-wide visibility or decide which raw statuses are formally effective.
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
| Ainuoke mirror/import/sync metadata | Report/source hashes, fetched time, disposition, `boundOrderId`, ImportRun | Current snapshot can be reread only after discovery; historical runs cannot | Binding/disposition/audit policy are Zhixu-owned | Yes | Refresh current source metadata; never replace binding/history silently | Mapping + latest reconciliation metadata yes; raw retention policy needs decision |

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
- **Now confirmed:** empty state → fixed 6086103 empty-condition discovery → complete current-account-visible `InsideOrderNo` / `SalesContractNo` list. Two traversals returned the same 505 rows over 11 pages and the same normalized hash; identities were unique and D1935 plus five redacted samples entered the existing 6086103/6086997 pipeline.
- **Still undecided:** whether formal bootstrap includes `生效` only, `生效 + 草拟`, or another explicit lifecycle rule; whether the currently bound account has the intended organizational scope. Discovery preserves raw status and makes no hidden time/status filter.
- Source disappearance cannot authorize hard deletion. Future reconciliation needs last-seen/missing/tombstone state and review.

## Browser migration necessity

- Current Browser Order Center and Scheduling data is test data. It is not a formal migration source, bootstrap authority, stable-ID continuity requirement, or prerequisite classifier inventory.
- The historically observed 464 is only a past browser-profile count. Do not migrate it wholesale and do not infer A/B/C counts.
- Formal SalesOrder bootstrap direction is clean: discovery → detail reads → new PostgreSQL SalesOrder identity/source mapping → later Zhixu-owned facts and new formal Scheduling.
- Quote Center is real business data and must be preserved, including Quote/Revision/PriceVersion/provenance/attachments. Future Quote → Order conversion still requires stable PostgreSQL SalesOrder identity and provenance, but this Gate does not implement it.
- Style Progress/Material is outside the Order/Scheduling retirement scope and remains protected. Closing retirement status is Needs Decision.
- Browser test-data deletion is not authorized. A separate Test Business Data Retirement Gate must first export a complete backup, audit dependencies, list precise delete/protect scopes, and obtain explicit destructive confirmation.

## Recommended PostgreSQL boundary — Proposed / Needs Decision

Use a composed model: **Ainuoke source facts + Zhixu-owned SalesOrder aggregate**, not a monolithic Ainuoke Mirror and not a byte-for-byte Browser JSON copy.

- `sales_orders`: immutable UUID identity, unique normalized `order_no`, creation/workflow provenance, Zhixu-owned commercial/execution fields, timestamps and optimistic version.
- `sales_order_source_links`: unique `(source_system, source_entity_type, external_id)` → `sales_order_id`, storing verified `sales_contract_no` and `inside_order_no` identities without using mutable style/customer fields as keys.
- Ainuoke current mirror tables: contract header, color lines and proven source delivery facts with source identity/hash/fetched-at. Resync replaces only this source-owned slice.
- Zhixu child tables: quantity/color adjustments, manual/voided delivery plans, price versions/current pointer, execution snapshots, attachment references and provenance. These are never overwritten by source refresh.
- Existing server OperationLog records mutations after successful domain transactions and references stable SalesOrder identity with business snapshots.
- Scheduling, Closing, Style Progress, Quote and Blob storage remain separate domain cutovers. Phase 2B must not claim their browser stores are migrated merely because SalesOrder IDs are reserved.

## Proposed Phase 2B gates

1. **Decision/evidence gate:** approve the source/owned boundary, formal bootstrap statuses and intended Ainuoke account visibility scope. Discovery protocol/source evidence is now available; Browser Backup classification is no longer a clean-bootstrap prerequisite.
2. **Schema/repository gate:** add only SalesOrder/source-link/source-mirror/owned-child migrations, transactional service and API in disposable PostgreSQL; preserve stable IDs and reject broken pointers/owners.
3. **Clean bootstrap dry run:** discover the approved current-account-visible scope, read details, create only new formal PostgreSQL identities/source links in disposable data, and report duplicates, omissions, lifecycle selection and reconciliation outcomes. Do not import Browser Order/Scheduling records.
4. **Owned-state/API gate:** define how formal manual/Quote/reorder orders and later Zhixu-owned facts are created transactionally, including immutable provenance and append-only OperationLog. Quote data remains in its protected current repository until its own cutover.
5. **Two-profile read acceptance:** point Chrome Profiles A and B at the same Node/PostgreSQL instance with separate trusted sessions; assert the same SalesOrder stable ID/version/projection, verify a permitted Zhixu-owned mutation from A is visible to B after reread, verify unauthorized writes fail, and verify the server OperationLog actor. Browser SalesOrder localStorage must not be a read fallback during this test.
6. **Cutover decision:** only after reconciliation and user approval decide whether to perform real bootstrap/read cutover. Write cutover and browser-store retirement require their own explicit Gate; no unbounded dual write.

## Decisions requiring user confirmation

1. Which observed statuses define formal “effective orders”: `生效`, `生效 + 草拟`, or another explicit rule.
2. Whether `current_account_visible` is the intended bootstrap scope or another approved account/organizational visibility proof is required.
3. Raw Ainuoke snapshot/import-run retention duration versus retaining only current mirror plus hashes/reconciliation metadata; disappearance/tombstone review policy.
4. Whether Phase 2B ends at schema/API/disposable dry-run or later includes a separately approved real bootstrap/read cutover.
5. Closing test-data retirement classification. Browser Order/Scheduling retirement also requires a later explicit destructive confirmation; it is not implied by this architecture direction.

## Readiness

**READY FOR PHASE 2B CLEAN BOOTSTRAP SCHEMA/API DESIGN: YES.** The fixed discovery source is proven for `current_account_visible`, and Browser Backup is no longer a bootstrap prerequisite. This is not permission to start Phase 2B or run a real bootstrap; lifecycle/scope/retention decisions and explicit Phase 2B approval remain required.
