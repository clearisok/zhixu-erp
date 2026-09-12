# SalesOrder Browser Cutover Readiness

## Current boundary

Phase 2B3C0 is read-path/model/UI readiness only. Real PostgreSQL is authoritative for the 511 bootstrapped Ainuoke SalesOrder masters, their immutable source bindings and current contract/color mirrors. Browser Order Center remains the active UI repository for its existing test/execution dataset. No Browser repository selection, business write path, schema, migration or real RBAC state changes in this phase.

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

| Browser `SalesOrder` field | Classification | PostgreSQL/server evidence and cutover note |
| --- | --- | --- |
| `id` | AVAILABLE_FROM_PG | Stable PostgreSQL UUID, exposed by list/detail. |
| `orderNo` | AVAILABLE_FROM_PG | Immutable `SO-########`, exposed. |
| `customerId` | NEEDS_SEPARATE_SERVER_DOMAIN | Only customer name snapshot exists; no server customer master FK/mapping. |
| `customerNameSnapshot` | AVAILABLE_FROM_PG | `customerName` from current contract mirror. |
| `customerPoNo` | NOT_YET_PERSISTED | No authoritative PG/API field. |
| `sourceType` | LEGACY/TEST_ONLY | Browser duplicate of `creationSource`; dedicated view uses only `creationSource`. |
| `creationSource` | AVAILABLE_FROM_PG | Aggregate field, exposed. |
| `sourceOrderId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `sourceQuoteId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `sourceRevisionId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `sourcePriceVersionId` | AVAILABLE_FROM_PG | Aggregate column exists but current read DTO does not expose it. |
| `orderDate` | NOT_YET_PERSISTED | `contractDate` is a distinct Ainuoke source fact and must not be relabeled. |
| `salespersonId` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server user/master-data association. |
| `salespersonNameSnapshot` | NOT_YET_PERSISTED | No authoritative SalesOrder snapshot. |
| `merchandiserId` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server user/master-data association. |
| `merchandiserNameSnapshot` | NOT_YET_PERSISTED | No authoritative SalesOrder snapshot. |
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
| `productionCountry` | NOT_YET_PERSISTED | SalesOrder-owned fact requires a later mutation/storage Gate. |
| `processDescription` | NOT_YET_PERSISTED | No authoritative server field. |
| `customerRequirement` | NOT_YET_PERSISTED | No authoritative server field. |
| `remark` | NOT_YET_PERSISTED | No authoritative server field. |
| `businessConfirmedDeliveryDate` | NOT_YET_PERSISTED | Must remain distinct from source contract delivery. |
| `contractDeliveryDate` | AVAILABLE_FROM_PG | Current Ainuoke contract mirror field, exposed. |
| `inspectionDate` | NOT_YET_PERSISTED | No authoritative server field. |
| `initialQuantity` | DERIVABLE | Dedicated view aliases exposed source `quantity`; quantity history is not present. |
| `orderColorLines` | DERIVABLE | Detail colors can populate a dedicated simplified view; Browser IDs/audit/hash fields are not fabricated. |
| `purchasedTrimUnitCostSnapshot` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; not in PG master. |
| `purchasedTrimCurrencySnapshot` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; not in PG master. |
| `purchasedTrimRuleId` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; needs future server ownership. |
| `purchasedTrimCostOverride` | BROWSER_EXECUTION_DATA | Current execution/cost behavior; needs future server ownership. |
| `factorySettlementUnitPrice` | BROWSER_EXECUTION_DATA | Settlement/execution value; not a bootstrap master fact. |
| `averageDailyOutput` | BROWSER_EXECUTION_DATA | Scheduling/execution projection, not SalesOrder master data. |
| `fabricExecutionSnapshots` | BROWSER_EXECUTION_DATA | Requires future execution snapshot persistence. |
| `trimExecutionSnapshots` | BROWSER_EXECUTION_DATA | Requires future execution snapshot persistence. |
| `quantityChanges` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires append/history model plus optimistic mutation API. |
| `deliveryPlans` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires a server collection/lifecycle and audit model. |
| `priceVersions` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires version/current-pointer storage and mutation rules. |
| `currentPriceVersionId` | NEEDS_SEPARATE_SERVER_DOMAIN | Cannot exist honestly before server price versions. |
| `imageAttachmentIds` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server attachment/blob ownership and references. |
| `fileAttachmentIds` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server attachment/blob ownership and references. |
| `styleImageAttachmentId` | NEEDS_SEPARATE_SERVER_DOMAIN | Requires server attachment/blob ownership and references. |
| `createdAt` | AVAILABLE_FROM_PG | Aggregate timestamp, exposed. |
| `updatedAt` | AVAILABLE_FROM_PG | Aggregate timestamp, exposed. |
| `createdBy` | NOT_YET_PERSISTED | Trusted first-create OperationLog actor exists, but no aggregate creator field/API contract. |
| `updatedBy` | NOT_YET_PERSISTED | No aggregate updater field/API contract. |

Server-only facts retained by the dedicated view include `version`, `companyName`, `contractDate`, `sourceLifecycleStatus` and `colorCount`. They must not be discarded merely to fit the Browser type.

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

Read-only inspection on 2026-09-12 found two active `app_users`, both with password hashes, so credential authentication can be attempted. However `app_roles`, `app_permissions`, `app_user_roles` and `app_role_permissions` are all empty; `order.view` has zero catalog rows and no user assignment. Full server startup would call `synchronizePermissionCatalog()` and `bootstrapAdmin()`, which is a forbidden real DB write in C0, so it was not started.

`SERVER_AUTH_READY_FOR_SHADOW_READ = NO`.

Exact blockers:

1. real permission catalog has not been synchronized;
2. no real roles or user-role/role-permission assignments exist;
3. no Browser-to-Node trusted login/session UX is active;
4. therefore authenticated real API list/detail cannot be exercised without a separately authorized RBAC activation Gate.

Disposable PostgreSQL tests remain the evidence for 401, 403, pagination/query behavior, permitted list/detail and two-session stable identity.

## Real read reconciliation

Because real authenticated server startup is unsafe in C0, direct parameter-free read-only SQL verified total=511 and these stable samples:

| Sample | UUID | orderNo | BillNo | InsideOrderNo | styleNo | colors |
| --- | --- | --- | --- | --- | --- | ---: |
| first | `cae075db-e0b7-4d2c-8648-db092c7501a3` | `SO-00000001` | `PI2505-075` | `2359/332-3(29020-N)` | `2359/332` | 1 |
| middle | `cd0df2c0-43ed-4634-b523-2410236d6e8c` | `SO-00000256` | `PI2601-210` | `5320/226-10(47476-N)` | `5320/226` | 1 |
| last | `1870ff38-528b-4e67-96de-8b86b69d1d47` | `SO-00000511` | `PI2609-103` | `9202/332(66643-N)` | `9202/332` | 1 |
| invalid color | `a92c28e0-ca18-4689-a2b1-6e682671eaee` | `SO-00000015` | `PI2507-010` | `423891 高个码-19` | `422965` | 0 |
| InsideOrderNo drift | `220779e9-0b77-4ae0-9f19-e97c91731e1c` | `SO-00000215` | `PI2512-121` | `5384/086-1(46021-N)` | `5384/086` | 1 |

All five have version 1; their detail color counts match the mirror table. No Browser repository was read or written for this verification.

## Cutover blockers

### BLOCKING before list cutover

- activate trusted server permission catalog/roles and grant `order.view` under a separately authorized real DB Gate;
- add Browser-to-Node login/session handling and explicit 401/403 UX;
- decide the production list information architecture for base PG facts versus unavailable price, delivery-plan, production and closing projections;
- prevent PG UUID list links from opening the current Browser-only detail loader.

### BLOCKING before detail cutover

- resolve the list blockers;
- adopt the dedicated server detail view rather than the full writable Browser `SalesOrder` type;
- implement or deliberately defer customer/brand IDs, PO, salesperson/merchandiser, business delivery, quantity history, delivery plans, price versions, execution snapshots and attachments;
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

1. **C1 — Server auth/RBAC activation:** separately authorize permission catalog synchronization and explicit real role assignments; validate login/session + `order.view` without bootstrap/admin side effects.
2. **C2 — Authenticated shadow acceptance:** run the existing DEV-only PostgreSQL preview against the real GET APIs; reconcile all pages and representative details with the 511-row SQL baseline.
3. **C3 — Base list cutover:** switch only the production Order list to the dedicated server view, with PG detail navigation and honest omission of unavailable execution facts. Keep Browser writes disabled for PG masters.
4. **C4 — Base detail plus server extensions:** move base identity/contract/colors to PG detail, then add separately owned delivery, price, execution and attachment read models without manufacturing Browser defaults.
5. **C5 — Server mutation Gates:** add narrowly scoped create/update APIs, optimistic concurrency, trusted audit and domain-specific authorization.
6. **C6 — Browser repository retirement:** only after data classification, export/recovery evidence and explicit destructive authorization.

Phase 2B3C0 executes none of these cutovers.
