# SalesOrder Persistence Ownership Audit

## Status and scope

- Phase: PostgreSQL Persistence Phase 2A, analysis/design only.
- Baseline: `f1736f84496d2651b91e64e4584ad5f7fe055d49` (PR #13 merged).
- No PostgreSQL SalesOrder table/API was created, no Repository was switched, and no Browser DEV data was read or imported.
- The boundary below is **Proposed / Needs Decision**, not an Active architecture decision and not authorization to begin Phase 2B.

## Confirmed implementation facts

- Current `SalesOrder` is a browser-local aggregate with stable string `id`; it is not the legacy PostgreSQL `orders` row.
- `sourceType` / `creationSource` support `manual | quote | reorder | ainuoke`. Quote conversion persists Quote/Revision/PriceVersion IDs; reorder persists `sourceOrderId`.
- Ainuoke contract sync derives current contract facts from reports 6086103/6086997. It updates `salesContractNo`, customer/brand/style/factory-style snapshots, contract quantity projection, contract delivery, source DeliveryPlan rows and source OrderColorLine rows.
- Ainuoke resync preserves non-Ainuoke quantity adjustments and manual DeliveryPlan rows. It does not rebuild price history, execution material snapshots, attachments, scheduling, closing, Quote/reorder provenance or other Zhixu edits.
- Current API query DTO requires exactly one non-empty `insideOrderNo`. The unified flow reads the three fixed reports only after that identifier is already known. No verified list/discovery endpoint or report currently enumerates all effective contracts/orders from an empty database.
- `SalesOrder.id` is referenced by order child records, Ainuoke `boundOrderId`, `ScheduleAssignment`, `OrderExecutionTracking`, `ScheduleBatchAllocation`, `ClosingAllocation`, OperationLog context and reorder provenance. Recreating a business-equivalent order with a new ID would break identity continuity.
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
| Scheduling references | Separate Zhixu `ScheduleAssignment` / tracking / batch facts keyed by `salesOrderId` | No | Yes | Yes | Never by Ainuoke resync | Yes when Scheduling domain migrates; ID continuity required now |
| Closing references | Separate Zhixu allocation/snapshot facts keyed by `salesOrderId` and optional assignment ID | No | Yes | Yes | Never by Ainuoke resync | Yes when Closing domain migrates; ID continuity required now |
| OperationLog references | Append-only Zhixu audit context with `orderId` and snapshots | No | Yes | Yes | Never | Yes; server append-only log |
| Quote provenance | `sourceQuoteId/sourceRevisionId/sourcePriceVersionId` | No | Yes | Yes | Never | Yes; until Quote cutover, retain stable external IDs without pretending a PG FK exists |
| reorder provenance | `sourceOrderId` self-reference | No | Yes | Yes | Never | Yes, self-FK once both orders exist |
| Ainuoke mirror/import/sync metadata | Report/source hashes, fetched time, disposition, `boundOrderId`, ImportRun | Current snapshot can be reread only after discovery; historical runs cannot | Binding/disposition/audit policy are Zhixu-owned | Yes | Refresh current source metadata; never replace binding/history silently | Mapping + latest reconciliation metadata yes; raw retention policy needs decision |

## Logical classification of Browser SalesOrder

The classes are predicates, not counts:

### A. Pure Ainuoke rebuildable

An order has a verified Ainuoke source link and contains no Zhixu-owned business state beyond a replaceable projection: no manual/system quantity adjustment, manual DeliveryPlan, meaningful price history, execution snapshot, attachment, Quote/reorder provenance, scheduling, closing or retained order-linked audit requirement. Its source facts can be rebuilt only after a complete discovery source exists. Once PostgreSQL uses its stable SalesOrder ID, the identity mapping remains durable even when the source mirror is rebuilt.

### B. Ainuoke + Zhixu-owned state

An order has a verified Ainuoke source link and at least one Zhixu-owned fact or stable-ID dependency: manual quantity/color adjustment, manual/voided delivery plan, price/version pointer, execution material snapshot, user-entered dates/requirements, attachment, scheduling, closing, OperationLog, or Quote/reorder provenance. Rebuild Ainuoke facts and import owned facts; never replace the aggregate wholesale.

### C. Zhixu-native

An order has no verified Ainuoke source link and originates from `manual`, `quote` or `reorder`. It must be imported/re-entered from a Zhixu authority because current Ainuoke reports cannot reconstruct it. A later explicit Ainuoke binding would move it to B, not erase its provenance.

## Rebuildability and bootstrap gap

- **Confirmed:** known `InsideOrderNo` → fully paged 6086103/6086997/6087050 detail reads works.
- **Not available:** empty PostgreSQL → enumerate every current effective `InsideOrderNo` / `SalesContractNo`.
- Relaxing the current non-empty `insideOrderNo` validation or sending a wildcard is not evidence of full discovery and must not be treated as such.
- Phase 2B needs a new allowlisted Ainuoke discovery/list source (verified report or endpoint, not an invented report ID) that returns at least stable `InsideOrderNo`, `SalesContractNo`, lifecycle/status and preferably last-updated/cursor data. It must define the effective-order scope, paginate to a proven total, detect duplicates/deletions and then feed each discovered identifier into the existing detail adapters.

## Browser migration necessity

- A wholesale migration of the historically observed 464 Browser orders is not justified.
- A records should rebuild their Ainuoke source mirror through verified discovery; import only stable identity/source mapping or other continuity facts that cannot safely change.
- B records require a hybrid: API rebuild of source facts plus a validated Browser Backup import of Zhixu-owned facts and stable IDs.
- C records require Browser Backup import or an explicit authoritative manual re-entry process.
- Without a real validated Browser Backup, B/C data and cross-domain references cannot be inventoried or migrated safely. Repository evidence therefore supports no A/B/C counts.

## Recommended PostgreSQL boundary — Proposed / Needs Decision

Use a composed model: **Ainuoke source facts + Zhixu-owned SalesOrder aggregate**, not a monolithic Ainuoke Mirror and not a byte-for-byte Browser JSON copy.

- `sales_orders`: immutable UUID identity, unique normalized `order_no`, creation/workflow provenance, Zhixu-owned commercial/execution fields, timestamps and optimistic version.
- `sales_order_source_links`: unique `(source_system, source_entity_type, external_id)` → `sales_order_id`, storing verified `sales_contract_no` and `inside_order_no` identities without using mutable style/customer fields as keys.
- Ainuoke current mirror tables: contract header, color lines and proven source delivery facts with source identity/hash/fetched-at. Resync replaces only this source-owned slice.
- Zhixu child tables: quantity/color adjustments, manual/voided delivery plans, price versions/current pointer, execution snapshots, attachment references and provenance. These are never overwritten by source refresh.
- Existing server OperationLog records mutations after successful domain transactions and references stable SalesOrder identity with business snapshots.
- Scheduling, Closing, Style Progress, Quote and Blob storage remain separate domain cutovers. Phase 2B must not claim their browser stores are migrated merely because SalesOrder IDs are reserved.

## Proposed Phase 2B gates

1. **Decision/evidence gate:** approve the source/owned boundary, obtain a sanitized real Browser Backup for read-only inventory, and verify an Ainuoke discovery source and effective-order scope.
2. **Schema/repository gate:** add only SalesOrder/source-link/source-mirror/owned-child migrations, transactional service and API in disposable PostgreSQL; preserve stable IDs and reject broken pointers/owners.
3. **Classifier/reconciliation dry run:** classify backup records by predicates A/B/C, produce counts only from the supplied backup, detect duplicate source links and enumerate every inbound reference. No DEV write.
4. **Hybrid bootstrap dry run:** rebuild Ainuoke facts from discovery and transform only Zhixu-owned facts/stable identity from backup. Report field-level differences, orphans and source deletions; fail closed.
5. **Two-profile read acceptance:** point Chrome Profiles A and B at the same Node/PostgreSQL instance with separate trusted sessions; assert the same SalesOrder stable ID/version/projection, verify a permitted Zhixu-owned mutation from A is visible to B after reread, verify unauthorized writes fail, and verify the server OperationLog actor. Browser SalesOrder localStorage must not be a read fallback during this test.
6. **Cutover decision:** only after reconciliation and user approval decide whether to perform real bootstrap/read cutover. Write cutover and browser-store retirement require their own explicit Gate; no unbounded dual write.

## Decisions requiring user confirmation

1. Which verified Ainuoke report/endpoint is the authoritative discovery list, and what statuses define “current effective orders”?
2. Whether Phase 2B may use a user-exported Browser Backup as the source for stable IDs and Zhixu-owned facts.
3. Raw Ainuoke snapshot/import-run retention duration versus retaining only current mirror plus hashes/reconciliation metadata.
4. Whether the historical Browser `SalesOrder.id` strings are preserved verbatim or mapped once to new UUIDs through an immutable legacy-ID mapping. Preserving them verbatim minimizes current cross-domain migration risk.
5. Whether Phase 2B ends at schema/API/dry-run or includes an explicitly approved real bootstrap/read cutover.

## Readiness

**READY FOR PHASE 2B: NO.** The ownership boundary is analyzable, but full Ainuoke discovery, a real Browser Backup inventory and the decisions above are not yet available/approved.
