# SalesOrder Browser Cutover Readiness

## Current boundary

Phase 2B3C0 established read-path/model/UI readiness, C1 activated real Server RBAC plus authenticated API acceptance, C2.1 implemented a separate Browser trusted Server session boundary, and C2.2 completed real Browser same-origin shadow acceptance. C3.1 cut production `/order-center` base-list reads to PostgreSQL, and C3.2 completed real production-route Browser acceptance. Real PostgreSQL is authoritative for the 511 bootstrapped Ainuoke SalesOrder masters, immutable source bindings and current contract/color mirrors. Browser OrderRepository remains retained for its existing test/execution dataset and legacy write/detail paths, but it is no longer the production base-list source.

The C4.0 ownership decisions are recorded in D-082–D-084. C4.1 authoritative base-detail read cutover is implemented and has passed real production Browser acceptance; Browser full-detail/write paths remain separate and no new server mutation exists. C4 overall remains incomplete.

The recommended architecture is:

`PostgreSQL typed read DTO → OrderCenterServerViewModel adapter → dedicated read-only UI → staged Order Center adoption`

Do not cast the incomplete server DTO to the writable Browser `SalesOrder` type and do not invent customer IDs, price versions, delivery plans, execution snapshots or other meaningful defaults.

## Browser SalesOrder field matrix

Classification meanings:

- `AVAILABLE_FROM_PG`: already stored in the SalesOrder aggregate/current mirrors; the note says when the present read DTO does not yet expose it.
- `DERIVABLE`: a lossless display alias/projection can be produced without inventing business facts.
- `NOT_YET_PERSISTED`: a real field with no authoritative server persistence yet.
- `BROWSER_EXECUTION_DATA`: currently coupled to Browser execution behavior and cannot be copied into the PG master DTO.
- `NEEDS_SEPARATE_SERVER_DOMAIN`: requires a separately designed server-owned collection/domain or master-data relationship.
- `LEGACY/TEST_ONLY`: compatibility duplication rather than a new authoritative server fact.
- `DEFER_DECISION`: business semantics remain insufficiently confirmed; no server ownership choice may be inferred yet.

| Browser `SalesOrder` field | Classification | PostgreSQL/server evidence and cutover note |
| --- | --- | --- |
| `id` | AVAILABLE_FROM_PG | Stable PostgreSQL UUID, exposed by list/detail. |
| `orderNo` | AVAILABLE_FROM_PG | Immutable `SO-########`, exposed. |
| `customerId` | NEEDS_SEPARATE_SERVER_DOMAIN | Only customer name snapshot exists; no server customer master FK/mapping. |
| `customerNameSnapshot` | AVAILABLE_FROM_PG | `customerName` from current contract mirror. |
| `customerPoNo` | NOT_YET_PERSISTED | Ainuoke-owned and read-only, but the concrete Direct API mapping is **NOT YET PROVEN** (`QuotationNo` is not PO). Keep null/read-only until actual metadata/rows prove a mapping; it is not unique identity or a user-maintained fallback. |
| `sourceType` | LEGACY/TEST_ONLY | Browser duplicate of `creationSource`; dedicated view uses only `creationSource`. |
| `creationSource` | AVAILABLE_FROM_PG | Aggregate field, exposed. |
| `sourceOrderId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `sourceQuoteId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `sourceRevisionId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `sourcePriceVersionId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `orderDate` | NOT_YET_PERSISTED | `contractDate` is a distinct Ainuoke source fact and must not be relabeled. |
| `salespersonId` | NEEDS_SEPARATE_SERVER_DOMAIN | Business salesperson means brand/customer-side personnel, never `app_users`; a future customer/brand personnel master relation is permitted but not designed. |
| `salespersonNameSnapshot` | NEEDS_SEPARATE_SERVER_DOMAIN | Future order-time snapshot of the brand/customer-side salesperson; not currently persisted. |
| `merchandiserId` | DEFER_DECISION | Semantics may differ from brand salesperson and must not be silently mapped to `app_users`. |
| `merchandiserNameSnapshot` | DEFER_DECISION | Snapshot/ownership remains pending with merchandiser semantics. |
| `orderType` | NOT_YET_PERSISTED | Processing/distribution semantics are absent from current PG master. |
| `status` | DERIVABLE | Exact alias of exposed `lifecycleState`; do not substitute raw Ainuoke status. |
| `salesContractNo` | AVAILABLE_FROM_PG | Normalized BillNo from immutable source link/mirror, exposed. |
| `ainuokeSyncStatus` | NOT_YET_PERSISTED | `sourceLifecycleStatus` is upstream lifecycle text, not sync disposition. |
| `ainuokeLastSyncedAt` | AVAILABLE_FROM_PG | Mirror `fetched_at` exists but current read DTO intentionally omits it. |
| `styleNo` | AVAILABLE_FROM_PG | Contract mirror field, exposed. |
| `factoryStyleNo` | DERIVABLE | Dedicated server view aliases exposed `insideOrderNo`; it remains mutable source data. |
| `styleName` | NOT_YET_PERSISTED | No authoritative server field. |
| `brandId` | NEEDS_SEPARATE_SERVER_DOMAIN | Only brand snapshot exists; no server brand master FK/mapping. |
| `brandNameSnapshot` | AVAILABLE_FROM_PG | `brandName` from current contract mirror. |
| `productionCountry` | LEGACY/TEST_ONLY | Browser legacy/test field only for this migration. Production country belongs to Quote/Quote PriceVersion; formal SalesOrder must not gain this field. Scheduling `ProductionSite` is a distinct execution-location concept. |
| `processDescription` | NOT_YET_PERSISTED | No authoritative server field. |
| `customerRequirement` | NOT_YET_PERSISTED | No authoritative server field. |
| `remark` | NOT_YET_PERSISTED | No authoritative server field. |
| `businessConfirmedDeliveryDate` | LEGACY/TEST_ONLY | A single Browser scalar must not become a second authoritative delivery value. Ainuoke delivery remains source mirror; editable customer delivery requirements belong to multi-row `DeliveryPlan`. |
| `contractDeliveryDate` | AVAILABLE_FROM_PG | Current Ainuoke contract mirror field, exposed. |
| `inspectionDate` | NOT_YET_PERSISTED | No authoritative server field. |
| `initialQuantity` | DERIVABLE | Dedicated view currently uses this Browser-shaped alias for exposed Ainuoke source quantity. The value is source-authoritative/read-only; do not turn the alias into an editable commercial baseline. |
| `orderColorLines` | DERIVABLE | Detail colors can populate a dedicated simplified view; Browser IDs/audit/hash fields are not fabricated. |
| `purchasedTrimUnitCostSnapshot` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; not in PG master. |
| `purchasedTrimCurrencySnapshot` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; not in PG master. |
| `purchasedTrimRuleId` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; needs future server ownership. |
| `purchasedTrimCostOverride` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; needs future server ownership. |
| `factorySettlementUnitPrice` | BROWSER_EXECUTION_DATA | Settlement/execution value; not a bootstrap master fact. |
| `averageDailyOutput` | BROWSER_EXECUTION_DATA | Scheduling/execution projection, not SalesOrder master data. |
| `fabricExecutionSnapshots` | BROWSER_EXECUTION_DATA | Requires future execution snapshot persistence. |
| `trimExecutionSnapshots` | BROWSER_EXECUTION_DATA | Requires future execution snapshot persistence. |
| `quantityChanges` | NEEDS_SEPARATE_SERVER_DOMAIN | Do not migrate the Browser editable commercial-quantity baseline for Ainuoke orders. Source quantity drift is reconciliation evidence; existing color-adjustment rules remain separate, while any broader server history model still needs a later decision. |
| `deliveryPlans` | NEEDS_SEPARATE_SERVER_DOMAIN | Zhixu-owned editable multi-row customer delivery plan. A valid source date initializes one system-derived default; only an untouched collection may track later source-date changes, and any user intervention permanently protects the collection from source overwrite. Exact technical markers remain unfrozen. |
| `priceVersions` | NEEDS_SEPARATE_SERVER_DOMAIN | Do not live-link full Quote/Order PriceVersions. Linked Quote/Order share only the two current confirmed commercial terms; historical Quote snapshots and all other pricing facts stay independent. |
| `currentPriceVersionId` | NEEDS_SEPARATE_SERVER_DOMAIN | Browser legacy pointer is not the future cross-domain shared-value authority. Exact server price-history design remains later work. |
| `imageAttachmentIds` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server attachment/blob ownership and references. |
| `fileAttachmentIds` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server attachment/blob ownership and references. |
| `styleImageAttachmentId` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server attachment/blob ownership and references. |
| `createdAt` | AVAILABLE_FROM_PG | Aggregate timestamp, exposed. |
| `updatedAt` | AVAILABLE_FROM_PG | Aggregate timestamp, exposed. |
| `createdBy` | NOT_YET_PERSISTED | Trusted first-create OperationLog actor exists, but no aggregate creator field/API contract. |
| `updatedBy` | NOT_YET_PERSISTED | No aggregate updater field/API contract. |

Server-only facts retained by the dedicated view include `version`, `companyName`, `contractDate`, `sourceLifecycleStatus` and `colorCount`. They must not be discarded merely to fit the Browser type.

## C4.0 confirmed ownership decisions

The following C4.0 audit questions are no longer pending. These are user-confirmed business rules, not implementation claims:

| Audit decision | Status | Confirmed outcome |
| --- | --- | --- |
| C4-D01 Customer PO | CONFIRMED | Ainuoke-owned, read-only, non-unique and never a user-maintained replacement. Concrete Direct API mapping is not yet proven; `QuotationNo` is known not to be PO, so the value stays null/read-only until actual evidence proves a field. |
| C4-D03 brand salesperson identity | CONFIRMED | Means brand/customer-side salesperson, not a Zhixu authenticated user and never `app_users`. Future customer/brand personnel master + order-time snapshot is permitted; merchandiser remains pending if its semantics differ. |
| C4-D06 production country | CONFIRMED | Quote/Quote PriceVersion only. `SalesOrder.productionCountry` is absent from the formal target; Browser legacy/test data is not migrated. Scheduling `ProductionSite` is a distinct execution-location fact. |
| C4-D07 order quantity | CONFIRMED | Ainuoke source quantity is authoritative/read-only and no editable formal commercial baseline is introduced. Scheduling quantities remain separate; source changes may surface drift but never authorize user overwrite. |
| C4-D09 delivery semantics | CONFIRMED | Ainuoke contract/process delivery is immutable source; `DeliveryPlan` is a Zhixu-owned editable multi-row collection. A valid source date initializes one derived default; only an untouched collection may follow source changes, and any user intervention protects the collection from later overwrite. |
| C4-D10 shared current confirmed commercial terms | CONFIRMED | A linked Quote/SalesOrder shares the current customer-confirmed price and confirmed labor price. Both surfaces may edit the same current values with trusted actor/time/old/new audit. Historical Quote snapshots stay immutable; the full PriceVersion and all other price facts remain independent. |

For Ainuoke-backed orders, source mirror and Zhixu-owned values must remain structurally distinguishable. Proven BillNo/InsideOrderNo/source lifecycle/contract dates/source quantity/style/customer/brand/company/color facts are source-owned; an operational value with different semantics must use a separate owned field/domain. Drift is explicit evidence and must not be silently resolved by overwriting user-owned data.

Delivery detail must eventually show the multi-row DeliveryPlan collection and retain source delivery as subdued secondary/reference text (for example `工艺单交期：YYYY年MM月DD日`). The implementation must deterministically identify an untouched system-derived default versus a user-managed collection, but this docs-only decision intentionally does not freeze a flag, column or API name.

The shared current terms may be described conceptually as `ConfirmedCommercialTerms`, without freezing a storage/API name. An unlinked SalesOrder receives no fabricated Quote relationship. Fabric/trim costs, margin, exchange rate, processing assumptions, production country and every other Quote/Order PriceVersion field are not live-synchronized by this decision.

Still pending unless an existing Active decision already governs the narrow behavior: Customer/Brand master mapping, `orderDate` semantics, source style versus a future Zhixu Style master, manual color modeling beyond current source/adjustment rules, settlement/pricing basis beyond the two shared terms, execution snapshots, attachments, process/customer requirement/inspection/remark semantics and Browser retirement details.

Current Browser code is not proof of C4 implementation: it still contains a `SalesOrder.productionCountry`, independent Quote/Order price structures, a mutable quantity-history baseline and refresh-time `source="ainuoke_sync"` DeliveryPlan reconstruction. Those are retained legacy/test behaviors and must not be promoted into the formal server model merely because they exist.

## Read API audit

Phase 2B3C0 adds bounded read-only list querying:

- `limit`: default 100, maximum 200;
- `offset`: default 0;
- `search`: parameterized search over order number, BillNo, InsideOrderNo, style, company, customer and brand;
- exact `lifecycleState` and `creationSource` filters;
- allowlisted `sortBy=orderNo|updatedAt|contractDeliveryDate|salesContractNo` and `sortDirection=asc|desc`;
- response page metadata: `limit`, `offset`, `total`, `hasMore`.

List rows expose `colorCount` only. Full typed color rows remain detail-only. Raw source payload, hashes and metadata remain private. Invalid query values return structured 400; auth/permission/missing detail remain 401/403/404. The former all-511 equivalent JSON projection is approximately 329,925 bytes; a 100-row page is approximately 64,776 bytes. An unpaginated 511-row response was temporarily workable but is not the cutover contract.

## Real auth/RBAC readiness

C1 used the merged guarded existing-admin runner on `zhixu` PostgreSQL 16.14. The real catalog now contains all 54 current permissions; `role-server-admin` has all 54, the existing admin is bound, and `order.view` resolves. The idempotency rerun produced no duplicates. `app_users` remains 2 and the admin core fingerprint is unchanged; no user was created and no password was modified. Server startup used an empty `ZHIXU_ADMIN_PASSWORD`, so `bootstrapAdmin()` was a no-op.

Trusted local admin acceptance passed login, `/auth/me`, `/auth/permissions`, six pages containing all 511 unique SalesOrder UUIDs/orderNos, fuzzy orderNo/BillNo/style search, draft lifecycle and ainuoke source filters, orderNo/updatedAt sorting, representative details, structured invalid-query 400, missing detail 404 and logout. SalesOrder counts remained `511/511/511/1348/511` and sequence remained `511/true`.

`SERVER_AUTH_READY_FOR_SHADOW_READ = YES` and C1 `AUTHENTICATED_SHADOW_ACCEPTANCE = PASS`.

C2.1 adds same-origin login/logout/me/permissions, an independent `ServerSessionProvider`, explicit login-required/403 states, 401 expiry invalidation and trusted Server identity labeling to `/order-center/server-preview`. Session remains an opaque HttpOnly cookie; Browser storage contains no token/password. The existing Browser `PermissionProvider` and `orderRepository` remain separate and unchanged.

C2.2 used PR #30 merged main `5fee5ebb04f04219a9da064cd683aaba8536663a` against the real target. Anonymous/login-required, user-entered admin login, trusted identity, `order.view`, total 511/source PostgreSQL/first `SO-00000001`, hard-refresh restore, orderNo/BillNo/style search, `draft` and `ainuoke` filters (511 each), 50-row pagination, normal one-color detail, zero-color master detail, logout and post-logout anonymous refresh all passed. Only normal auth/session metadata changed; SalesOrder counts stayed `511/511/511/1348/511`, master fingerprint and sequence `511/true` stayed unchanged, and all non-auth business writes were 0. `BROWSER_TRUSTED_SESSION_READY=YES` and `REAL_BROWSER_SHADOW_ACCEPTANCE=PASS`.

C3.2 used PR #32 merged main `1c5b8e1680ac5f49cda3df532cb7ae9509d73a0b` at the formal `http://127.0.0.1:3002/order-center` route. Anonymous/login-required, user-entered admin login, trusted public identity, `order.view`, total 511/source PostgreSQL/page size 50, hard-refresh restore, orderNo/BillNo/style search, `draft`/`ainuoke` filters, ASC/DESC server sorting, pagination, same-page one-color and zero-color inspectors, logout and post-logout anonymous refresh all passed. Actual 1280×800 and 1600×900 visual acceptance also passed. PG UUID never entered `/order-center/detail`, and no Browser fallback or mutation control appeared. Only authorized auth/session metadata changed; SalesOrder count/fingerprint/sequence, app_users and RBAC remained unchanged. `PRODUCTION_ORDER_LIST_POSTGRESQL_READY=YES`, `REAL_PRODUCTION_ORDER_LIST_ACCEPTANCE=PASS`, and C3 is complete.

## Real read reconciliation

C0 direct SQL and C1 authenticated API acceptance both verified total=511 and these stable samples:

| Sample | UUID | orderNo | BillNo | InsideOrderNo | styleNo | colors |
| --- | --- | --- | --- | --- | --- | ---: |
| first | `cae075db-e0b7-4d2c-8648-db092c7501a3` | `SO-00000001` | `PI2505-075` | `2359/332-3(29020-N)` | `2359/332` | 1 |
| middle | `cd0df2c0-43ed-4634-b523-2410236d6e8c` | `SO-00000256` | `PI2601-210` | `5320/226-10(47476-N)` | `5320/226` | 1 |
| last | `1870ff38-528b-4e67-96de-8b86b69d1d47` | `SO-00000511` | `PI2609-103` | `9202/332(66643-N)` | `9202/332` | 1 |
| invalid color | `a92c28e0-ca18-4689-a2b1-6e682671eaee` | `SO-00000015` | `PI2507-010` | `423891 高个码-19` | `422965` | 0 |
| InsideOrderNo drift | `220779e9-0b77-4ae0-9f19-e97c91731e1c` | `SO-00000215` | `PI2512-121` | `5384/086-1(46021-N)` | `5384/086` | 1 |

All five have version 1; their detail color counts match the mirror table. No Browser repository was read or written for this verification.

## C4.2 ConfirmedCommercialTerms implementation

C4.2 implements only the two D-084 shared current business facts. `confirmed_commercial_terms` owns a UUID, exact decimal amounts, labor currency, optimistic version and timestamps; `confirmed_commercial_terms_sales_orders` associates one or more formal SalesOrders. Exact Quote provenance is unique per terms context, not per SalesOrder, because current formal schema permits multiple SalesOrders with the same Quote/Revision/PriceVersion provenance.

Order Detail reads/writes this domain through its formal UUID with `order.view`/`order.edit`. Quote Center resolves by exact `quoteId/revisionId/priceVersionId` and uses `quote.view`/`quote.confirm`. Both mutate the same current row, use `expectedVersion`, receive 409 on stale state and atomically append one trusted old/new OperationLog. Unlinked Quote continues legacy local confirmation; linked Quote has no local numeric fallback. Unlinked SalesOrder can have order-owned terms but receives no fake Quote relation.

The new Order card displays null as “未确认” and never reads Browser `salePrice` or `processingUnitPrice`. It cannot edit source facts, lifecycle or DeliveryPlans. Historical Quote snapshots and all other Quote/Order PriceVersion fields remain independent and unchanged.

This implementation and its 0001→0004 migration validation ran only on disposable PostgreSQL. Real `zhixu` migration, real data reconciliation and real Browser write acceptance are not authorized or executed. Because Server startup applies pending migrations, this PR must stay open until a separate rollout Gate.

## C4.1 production base-detail implementation

The production list now routes “查看” to the static-export-compatible Server-owned URL `/order-center/server-detail?id=<PG UUID>`. This route renders only `ServerSalesOrderDetailPage`; it never enters the legacy `/order-center/detail` / `OrderDetailLoader`, never calls Browser `orderRepository`, and has no Browser fallback or mutation control. The three exact Server-read paths `/order-center`, `/order-center/server-preview` and `/order-center/server-detail` skip Browser local-data initialization, while legacy new/detail and all other Browser-owned routes retain it.

The dedicated page keeps the trusted Server session + `order.view` boundary and explicit checking/anonymous/401-expired/403/404/server-unavailable states. The typed detail view uses exact `insideOrderNo` and source `quantity` names instead of Browser-shaped writable aliases. UI separates Zhixu-owned aggregate facts from Ainuoke-authoritative source facts and displays only the C4.1 allowlist: UUID/orderNo/version/creation source/lifecycle/timestamps, BillNo/InsideOrderNo/style/company/customer/brand/source quantity/contract dates/source lifecycle, color count and color name/quantity. SourceLineIdentity remains an internal row key. The typed 6087105 color-row delivery date remains available internally but is intentionally absent from the initial UI because its broader user-facing semantics are unresolved.

Zero-color orders remain valid and show an explicit valid-master/empty-color state. Customer PO, customer/brand master IDs, personnel, order date, production country, DeliveryPlans, single-value business delivery, quantity/color adjustments, shared confirmed commercial terms, OrderPriceVersion facts, attachments, execution/settlement, inspection and free-text fields remain absent. C4.1 adds no schema, migration, API mutation, permission or Browser migration.

Real acceptance used PR #35 merged main `c38e80a44eed384c0d09f9a0317bd14122763865` at `http://127.0.0.1:3002`. Anonymous protection, manual trusted admin login, 511-row PostgreSQL list, list → Server-detail UUID parity, normal authoritative source parity, hard refresh, return/reopen, zero-color valid empty state, explicit real 404, 1280/wide visual inspection, logout and post-logout detail protection all passed. PG UUIDs never entered `/order-center/detail`, and no Browser repository/mutation control mounted. Real 403 was not manufactured because that would require unauthorized RBAC changes; the existing automated 403 contract remains PASS.

SalesOrder aggregate/source-link/contract/color/log counts stayed `511/511/511/1348/511`; fingerprint `580696ff5c562493dea67f883df501cc` and sequence `511/true` were unchanged. `app_users=2`, permissions=54, user/RBAC fingerprints and admin `order.view` were unchanged. Only authorized auth/session metadata changed: successful/failed/sessions/active/revoked `6/0/0/0/0` → `8/0/2/1/1`; the tested session was revoked and the other active session was preserved. All business writes were 0.

`ConfirmedCommercialTerms` remains the required next Server domain: final Order Detail **must** show the shared current customer-confirmed price and confirmed labor price after that separately authorized implementation. Their C4.1 absence is not the desired final product state. Customer PO mapping remains unproven/not implemented and DeliveryPlan remains not implemented.

## Cutover blockers

### Production list cutover

- C3.1 code/disposable implementation and C3.2 real Browser acceptance are complete;
- production information architecture uses only PG facts, and PG UUIDs cannot open the Browser-only detail loader;
- Browser OrderRepository remains retained, unmigrated and unmodified, but is no longer the production base-list source.

### C4.1 base detail read implementation

- dedicated production detail route/view from the existing typed PostgreSQL detail DTO: implemented;
- trusted session + `order.view`, explicit 401/403/404/server-unavailable and zero-color semantics without Browser fallback or mutation: implemented;
- absent owned/master/domain fields remain absent rather than receiving invented defaults: implemented;
- real production-detail Browser acceptance: PASS on merged main; no Browser fallback or business write.

### BLOCKING before later C4 server extensions

- prove the concrete Customer PO source field before exposing any value;
- design customer/brand and brand-salesperson master/snapshot relationships while keeping merchandiser semantics pending;
- design multi-row DeliveryPlan persistence, deterministic derived-default ownership transition, drift projection and trusted audit;
- activate/reconcile the implemented linked Quote/SalesOrder shared-current-terms domain only through a separately authorized real rollout; implementation/disposable validation is complete, but real 0004 is not applied;
- decide the remaining Customer/Brand, orderDate, style-master, color, settlement, execution, attachment and free-text semantics before implementing those slices;
- design identity joins for future Scheduling/Closing/Style Progress extensions against stable PG UUID.

### BLOCKING before edit/write cutover

- dedicated authenticated POST/PATCH APIs with request validation, `order.*` permissions and trusted actors;
- optimistic version/conflict UX and append-only OperationLogs;
- server persistence for manual/quote/reorder creation and every editable owned slice;
- forward-only Browser data retirement/migration decision and recovery plan;
- cross-domain scheduling/closing/attachment mutation boundaries.

### NON-BLOCKING

- six bootstrap orders intentionally have zero color rows because invalid enrichment does not invalidate their master;
- customer/brand snapshots are sufficient for a base read-only list even though master IDs are not;
- 511 rows are operationally small, and bounded pagination is now available;
- raw Ainuoke metadata remains hidden;
- the existing Browser Repository can continue unchanged while shadow reads mature.

## Staged plan

1. **C1.1 — Guarded activation runner:** complete and merged in PR #28.
2. **C1.2 — Real activation + authenticated shadow acceptance:** complete; Server RBAC and trusted admin API reads passed without SalesOrder mutation.
3. **C2.1 — Browser Trusted Session UX:** complete and merged in PR #30, with separate ServerSession/Browser PermissionProvider boundaries, same-origin opaque-cookie auth, explicit 401/403 UX and disposable Browser-client E2E.
4. **C2.2 — Real Browser Authenticated Shadow Acceptance:** complete. The real static `server-preview` passed login/session restore/list/search/filter/pagination/detail/zero-color/logout acceptance with only authorized auth/session metadata writes. This is still not production Order Center cutover.
5. **C3.1 — Base list implementation:** complete in code/disposable validation. Production `/order-center` uses the dedicated Server view and has no Browser fallback. Its historical same-page inspector is replaced by the C4.1 dedicated Server detail route; Browser repositories and write paths remain retained and isolated from PG rows.
6. **C3.2 — Real production-list Browser acceptance:** complete. The formal route passed trusted session restore, list/search/filter/server-sort/pagination, same-page inspectors, zero-color semantics, 1280/wide visuals, logout and post-logout anonymous checks without business mutation.
7. **C4.0 — Ownership audit and decisions:** read-only audit complete; D-082–D-084 record the user-confirmed source, quantity/people/country, delivery-plan and shared-current-terms boundaries. Documentation is complete; implementation is not started.
8. **C4.1 — Server Base Detail Read Cutover:** complete. Implementation, automated validation and real Browser acceptance all passed with unchanged business fingerprint.
9. **C4.2 — ConfirmedCommercialTerms implementation:** complete in code/disposable validation and held in an unmerged PR. Real 0004 activation, Browser-data reconciliation and real write acceptance are not authorized or executed.
10. **C4.3+ — Separately authorized server extensions:** DeliveryPlan remains a separate later sub-gate; ambiguous fields stay deferred.
11. **C5 — Server mutation Gates:** add remaining narrowly scoped create/update APIs, trusted audit and domain-specific authorization; C4.2 terms mutation does not authorize general SalesOrder mutation.
12. **C6 — Browser repository retirement:** only after data classification, export/recovery evidence and explicit destructive authorization.

C4.1 does not migrate or retire Browser data. Production base-list and authoritative base-detail implementation/real acceptance are complete. C4.2 implementation adds only the terms slice and remains unactivated on real `zhixu`; C4 overall remains incomplete, with DeliveryPlan/C4.3 and C5 not started.
