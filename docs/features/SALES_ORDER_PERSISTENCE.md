> 2026-10-20 Server收敛Gate4A工程增量，未合并/部署/来源激活：正式详情新增保存颜色分码的白名单 `sizeEvidence` 与颜色来源摘要 `colorSource`，见[当前任务](../tasks/active/server-convergence-gate4-2026-10-20.md)。仍复用当前来源owner与单次RR查询，不输出任意source_metadata、hash或金额。保留旧无证据、结构异常、待定0与真实0；原矩阵不平/溢出不删除颜色，不凭部分槽位重算。无新迁移、采集或价格写入。DeliveryPlan只读客户端使用现有GET；自身计划与当前可信来源对照分别拥有，失配来源不作为数量/日期依据。旧日期能力按其当时状态阅读。

> 2026-10-15 本地Gate4消费者增量，未合并/部署：有效与历史读取、当前来源owner投影和新写归属保护见[ORDER_NORMALIZATION](ORDER_NORMALIZATION.md)及[任务](../tasks/active/order-effective-attribution.md)。原UUID/创建历史/绑定/各单价格和计划不变；公共归一执行仍未实现。下面历史bootstrap日期/环境能力仅按当时证据阅读。

<!-- Current bounded first-binding path; historical bootstrap evidence below is preserved. -->
> 2026-10-12（main db30c10bd4787d83cbd5dee51d9c9ae4b9b1b66e）：D106首次空订单账本绑定复用本域transaction helper，由server/ainuoke-source/binding.ts进行fresh Preview/目标/hash/权限/整批审计保护；旧bootstrap冻结guard不变。新增合同与主镜像持续刷新不在本轮。来源DATE在SQL转为日历字符串，修复时区偏移；未改schema或真实日期。详见[Server Source](AINUOKE_SERVER_SOURCE.md)。

# SalesOrder PostgreSQL Persistence Foundation

## Controlled bound-contract refresh (2026-10-22 engineering slice)

`server/ainuoke-source/bound-order-refresh.ts` promotes an already captured formal
Discovery/6087105 bundle. Preview is read-only; apply requires its exact hash and
an actor-scoped UUID request. It reuses formal mapping and the original source
writer in one caller-owned transaction. Source account/profile, connection target,
stable contract/link identity, current effective attribution, physical source owner,
both SO versions, full current mirrors and owner DeliveryPlan collection are bound
to that preview. Source identity is never selected by style or InsideOrderNo.

Missing/invalid color enrichment fails closed, preserving the prior mirror. This
first refresh slice does not treat an empty color result as permission to clear it.
Accepted quantity/date/size evidence remains source-owned. Explicit source changes
preserve manual DeliveryPlan rows, commercial versions, stable color identities and
execution snapshots; new/renamed colors do not inherit historical prices. Historical
source remains on its original owner. An existing link's InsideOrderNo may update,
without an INSERT/UPSERT or identity/provenance change; 0018 keeps historical alias
and effective-root plans unchanged. The original direct wrapper remains internal.

0041 adds one initially empty immutable success receipt relation; actor/request
uniqueness and exact payload matching serialize replay. No network IO occurs inside
or outside this promotion command. Receipt, mirrors and correlated trusted audit
commit together. Readback/replay refresh authorization and return historical results
without rerunning freshness/CAS. Unknown receipt absence does not prove failure.
Raw bundles and prices do not enter the receipt. Both physical and effective order
references participate in normalization's complete row fingerprints.

`source:ainuoke:bound-refresh` is an explicit private offline operator with
`--action=plan|apply|receipt`. Job and evidence use absolute protected ignored paths
and exact SHA256; apply also requires request ID, preview hash and explicit execute
token. The executable checks a clean committed checkout and verifies migrations
without applying them. It cannot load Source credentials, collect, activate, bind a
new order, start scheduling or deploy. Existing material `--execute`/`--schedule`
semantics remain unchanged. Actual tests and delivery limits are tracked in the
[Gate 4 follow-up](../tasks/active/server-convergence-bound-source-refresh-2026-10-22.md).

## PR93 integration verification — 2026-10-12

Ordinary main merge 070d958 preserves both optional Material GET and the commercial-terms-read.v1 CCT projection/partial PATCH. New Material HTTP negative audit reuses the shared synthetic security fixture and covers 401, viewer/cost/sale/labor/full read grants, no-store, read-only write rejection, immediate session revocation and default unconfigured Material503. CCT null/zero, exact provenance, linked/unlinked currencies, CAS and trustworthy audit/transaction behavior remain intact. No migration, roles policy change, live Source or production activation occurred. [Joint verification and current counts](../tasks/active/order-material-pr93-integration.md).

## Isolated material read HTTP contract — 2026-10-11 / PR #92 Draft

`GET /api/v1/sales-orders/:uuid/material-progress` requires trusted session, `order.view` and `style_progress.read`. Client supplies UUID only; all query selectors are rejected. An injected trusted `resolveVisibleOrder` must enforce the authorized order scope before fixed Discovery → BillNo relation → current InsideOrderNo → 6087050 `insideorderno is` Source read. The existing adapter/projection returns completeness, freshness, unknown/zero, canonical items and separate events; procurement Source prices are shared, protected commercial prices are absent. Success is `Cache-Control: no-store`; provider errors are replaced with fixed public messages.

The capability is optional and **not installed by server/index.ts**: default authenticated use returns 503 `material_read_not_connected`. A configured scope resolver without Source returns explicit `not_connected`; no Browser fallback, source-write API, new schema or live collection. Synthetic real-session HTTP11/11 and CCT regression7/7 passed on owned disposable PG16 only. The original CCT/Quote exposure was subsequently fixed by merged PR93 / Active D103: independent sale/labor field envelopes, Quote cost projection and partial PATCH. This does not activate Material collection or claim team-scoped production Order list/detail. [Full scope, evidence and activation prerequisites](../tasks/active/order-material-night-integration.md).


## C4.3 DeliveryPlan domain (2026-10-09)

`0009_sales_order_delivery_plans.sql` adds `sales_order_delivery_plan_sets` and `sales_order_delivery_plans`, without changing prior migrations or backfilling existing orders. The collection has an independent version and irreversible `source_derived → user_managed` transition. Rows use server UUIDs, exact NUMERIC quantity/API decimal strings, nullable date only for a suspended derived default, and retained void history. SalesOrder version/number/provenance and shared terms remain independent.

New source-mirror insertion initializes the collection and, only with a valid date, one default row. Its quantity snapshots first source quantity including zero; later quantity changes never reallocate. Date changes update only the untouched existing default. Null suspends that same ID, restoration resumes it. An initially empty collection receives no later fabricated default. Source date/quantity changes also increment collection version in the same transaction. Mirror updates on pre-C4.3 orders lacking evidence do not infer ownership or backfill plans.

The internal typed `refreshAinuokeSalesOrderSource` service preserves binding, checks source hash/fetch-time and collection CAS, and atomically updates source link/mirrors, source-follow projection and trusted audit. It has no HTTP source-write route. Human plan commands require order.view/order.edit, reject identity/ownership/source fields, preserve stable IDs and permanently claim the entire collection even for same-value intervention. Reconciliation reports actual source date/quantity, active plan dates and date drift/quantity balance; source disappearance does not rewrite human rows. A subsequent matching date projection resolves current drift while prior audit evidence remains append-only.

Gate 1: typecheck, Server build and disposable PostgreSQL 12/12 passed. Narrow HTTP API and final regression results are recorded in the [task report](../tasks/completed/2026-10-09-order-c43-delivery-plan.md). No real migration/deployment/Browser import is performed; D-096/D-098 remain unchanged.

### PR #87 integration verification (2026-10-10)

`test:delivery-plans` runs the isolated domain/session suite; it is also in regular `test:postgres` without adding Docker to `npm test`. The populated 0001–0008 upgrade preserves orders/colors/associated terms/logs/ledger with no backfill; deterministic root-lock barriers cover user-first/source-first/source-source, and deliberate audit failure compares all transactional domains. C4.3 source audit dates use the existing ISO date projection rather than the legacy Date DTO.

`demo:delivery-plans` runs the synthetic internal-source/authenticated GET/PATCH sequence in disposable PG16 with dynamic loopback API and explicit cleanup. Current evidence: DeliveryPlan17/17, PostgreSQL152/152, npm679/679, typecheck/lint/Server/frontend build and demo PASS. [Integration report and release risk](../tasks/completed/2026-10-10-pr87-delivery-plan-integration.md); [synthetic snapshots](../tasks/assets/pr87-delivery-plan-integration/README.md).

Release requires a separate coupled app/schema Activation Gate: new app + pre-0009 DB fails pending-migration startup; pre-0009 app + upgraded DB fails missing-ledger-file integrity. Image-only rollback is incompatible. No real activation was performed.

### C4.3 narrow API

- `GET /api/v1/sales-orders/:uuid/delivery-plans` requires trusted identity + `order.view`, returns `{ deliveryPlanSet }` with independent ownership/version, source references, stable rows (including void history) and reconciliation.
- `PATCH` on the same path additionally requires `order.edit`, allowlisted Origin and `X-Zhixu-Request: 1`. Body: `{ requestId?: UUID, expectedVersion, upserts: [{ id: UUID|null, deliveryDate: YYYY-MM-DD, quantity: decimal-string }], voidIds: [UUID] }`. Null row ID creates a server UUID; existing ID edits that same row. Upserts/voids are atomic and bounded to 100 affected rows per command. Empty commands, duplicate/foreign/voided IDs (including UUID case variants), invalid dates/amounts and caller actor/ownership/source fields fail closed. User amounts retain the established strictly positive plan-input rule; the explicitly confirmed zero exception belongs to system-derived defaults.
- Authentication/permission/invalid input/absent order/stale collection return 401/403/400/404/409. No generic SalesOrder PATCH/POST or source-refresh HTTP route is added. Raw source hashes/metadata remain internal. No UI cutover occurs in this Server-domain task.

### Reliable C4.3 command receipts (2026-10-22 engineering slice)

0042 adds an initially empty immutable `sales_order_delivery_plan_requests` ledger.
The existing writer and success envelope remain unchanged. Explicit request UUIDs
are actor-scoped. Legacy bodies use the same ledger with a deterministic key over
the original SO and complete normalized intent; replay returns the original result
rather than inventing a fresh request or adding another plan. Distinct requests
still compete on the collection CAS. Commands own their copied arrays before any
await. UUID case is canonical; decimal strings remain exact, not coerced to Number.

`POST /api/v1/sales-orders/:uuid/delivery-plans/receipt` takes the original complete
command body, requires the same fresh view/edit grants, Origin and trusted header,
and accepts no query selectors. `{receipt}` contains schemaVersion, original SO,
requestId/null, requestMode and status `unknown|applied|rejected`. Applied includes
the exact original full `deliveryPlanSet` and trusted operationId; rejected includes
the fixed original error. `unknown` can race an uncommitted command and is **not**
proof of failure or permission to automatically resubmit. Lookup itself writes no
plans, audit or receipts. No arbitrary hash, actor or receipt ID selector is added.

Fresh user/role/grant locks precede actor/request and original order/collection
locks. Prior results only require current authorization and exact original intent;
subsequent source/CAS/lifecycle/alias changes cannot invalidate a historical result.
New writes still require the original effective order. Plans, existing trusted
audit and success receipt commit together. Only the writer's fixed CAS/row/alias
409 and capacity422 become durable rejections. SQL, audit, lock timeout and unknown
transport failures roll back and remain unconfirmed; they are not recorded as
business rejection. No missing-ledger fallback is permitted.

The full original result includes retained void history, never only the first100
rows. Both compact JSON and actual PG jsonb text must fit16MiB (HTTP's fixed outer
identity/envelope adds less than1KiB). Capacity failure rolls back plans/audit to a
savepoint and commits a small explicit422 receipt. Commands are bounded64KiB.
The original SO FK and full receipt bytes participate in existing complete
normalization fingerprints. No legacy backfill, new UI, price/source/production
write or deployment is implied; [task and actual checks](../tasks/active/server-delivery-plan-receipts-2026-10-22.md).

### Approved DeliveryPlan maintenance client slice (2026-10-22)

The specifically approved UI scope is recorded in the
[maintenance task](../tasks/active/server-delivery-plan-maintenance-ui-2026-10-22.md).
Client helpers reuse this exact GET/PATCH/original-body receipt protocol and the
Server command validator. Full retained history is read within a16MiB+64KiB
transport bound;100 is a changed-row write budget, not a history read limit.
Applied results must reflect the exact edited IDs/date/decimal quantities and
voids; additions match distinct non-default active rows. A source-derived row's
historical marker remains legal after an explicit edit. Unknown is not rejection.

Draft comparison submits only actual differences, preserves unchanged null/zero
defaults, and requires explicit voids. Decimal preview uses exact integer scale;
oversized historical display facts are kept with comparison unavailable, not0.
The separate actor/tab pending slot is documented in DATA_LIFECYCLE. The approved
small title action now opens a Foundation edit/preview/confirm modal. Source facts
stay read-only; processing has no fabricated Ainuoke comparison. Actual session
object/order ownership invalidates replies at layout commit, and independent
source/delivery exit guards are combined. Success refreshes current plans and any
expanded saved disclosure; a historical receipt is never the current collection.

After an exact unknown receipt only, a second explicit human confirmation may
replay the identical original request. Recheck the original actor slot before
sending, with no new UUID/CAS or automatic retry. A new lost reply revokes that
permission and returns to receipt checking. Exact-source synthetic built UI,
seven-role/eight-width coverage and original P6 regression are recorded in the
[frozen engineering evidence](../tasks/completed/2026-10-22-delivery-plan-maintenance-ui-engineering.md).
The later Source CI caught a hidden mobile source action. Both actions now share
a scoped detail-header group: compact at desktop, paired below the identity on
mobile including narrow fine-pointer windows. The original source-context and
P6 regressions, actual hit-tests and new screenshots are frozen separately in
[the correction record](../tasks/completed/2026-10-22-order-maintenance-mobile-actions-correction.md).
This is not deployment or human acceptance. No new backend rule, SQL, source query
or runtime activation is introduced.

## C4.2 ConfirmedCommercialTerms extension

2026-10-09 linked follow-up: exact saved Server Quote provenance is now required for Quote mutation; both terms expectedVersion and positive expectedQuoteVersion must pass the locked saved-source check. Order current uses only its existing terms CAS/permissions and established currency, not the Quote's current/default edit eligibility. Multiple formal Orders read/write the same context; no source binding/aggregate/version/sequence/mirror mutation occurs. This does not expose Order creation or implement a new Order UI.

- Forward-only migration `0004_confirmed_commercial_terms.sql` adds a separate shared-current commercial-terms domain; it does not rewrite the four Phase 2B1 SalesOrder/source tables and performs no data backfill.
- Formal `sourceQuoteId/sourceRevisionId/sourcePriceVersionId` has no 1:1 guarantee. One unique exact Quote provenance terms context can therefore associate with multiple SalesOrder UUIDs; all such orders read and update the same context. An order with no Quote provenance uses an isolated SalesOrder-owned context and never receives fabricated provenance.
- Current customer-confirmed price is CNY/件. Current confirmed labor price retains explicit `CNY|USD`; values persist as PostgreSQL `NUMERIC` and cross the API as decimal strings. Null remains unconfirmed, not zero.
- For a Quote-linked context, the Quote surface establishes or changes labor currency from its exact PriceVersion. Order may edit current amounts but must preserve that qualifier; changing it or submitting labor before Quote establishes it returns 409 with no terms/log write. An unlinked SalesOrder-owned context permits explicit Order-selected currency.
- Terms have an independent optimistic version. Atomic service writes append exactly one trusted existing OperationLog with old/new values; they do not increment SalesOrder version or mutate source mirror/quantity/sequence.
- Order and Quote APIs use exact UUID/provenance lookup and existing `order.view`/`order.edit`/`quote.view`/`quote.confirm` permissions. There is no generic SQL/table endpoint and no fuzzy Quote relation.
- Default Browser linkage flag remains disabled; explicit Quote Server mode always resolves exact trusted linkage. Unknown fails closed; unlinked uses its appropriate snapshot path. Legacy Browser-linked mutation without a verifiable saved Server Quote is read-only, never a weak compatibility writer.
- HISTORICAL original C4.2 Gate was disposable-only without real activation/Browser acceptance, not a current migration-ledger statement; later activation is recorded in CURRENT_STATE/SERVER_PERSISTENCE. This linked-writer follow-up also performs no real activation/deployment; C4 overall remains incomplete.

## Status and scope

- Phase: PostgreSQL Phase 2B1 Server Foundation complete; Phase 2B2.3 final fresh Preview complete; Phase 2B3A.1 real PostgreSQL schema activation complete; Phase 2B3B.1 production runner merged; Phase 2B3B.2a transport hardening in progress.
- Phase 2B2 baseline: `f424a9b78f66dffdd47075f8ff29ea5f3590717b` (`main`, Phase 2B1 PR #17 merged).
- Phase 2B1 implements PostgreSQL schema, parameterized repository, transactional Ainuoke-created SalesOrder service, typed read API and disposable PostgreSQL integration tests.
- This is not a Browser Order Center cutover and not a real bootstrap. Browser runtime remains on its existing Repository; no Browser DEV data was read, imported, modified or deleted.
- No live Ainuoke read/write or real 505 bootstrap occurred. Quote, Style Progress, Scheduling and Closing were not migrated or mutated.

Phase 2B2 subsequently performed authorized live **reads only** for Discovery/6086103/6086997, built no UUID, and made no real PostgreSQL or Browser write. Its complete evidence and blockers are recorded in `SALES_ORDER_BOOTSTRAP_PREVIEW.md`.

Phase 2B2.1 validated 6087105 as a cleaner candidate garment color/size source. Phase 2B2.2 made the user-approved source/identity decision active: normalized `SalesContractNo` / `BillNo` is the stable Ainuoke cross-report business association, `InsideOrderNo` is mutable, and 6087105 formally replaces 6086997 for current SalesOrder color/size sourcing. 6086997 remains legacy/historical. Phase 2B2.3 added the formal order-number allocator and fresh disposable verification. Phase 2B3A.1 then applied 0001/0002/0003 to the real target through the migration-only runner; it performed no real business bootstrap.

## Phase 2B3A.1 real schema activation

- Fixed target: `zhixu-database / zhixu`, PostgreSQL 16.14, persistent named volume `preparesystem_zhixu_data`.
- The verified pre-mutation backup is `D:\workspace\preparesystem\backups\zhixu-20260912-000250.dump` (47,667 bytes; SHA-256 `4A6A11844E70943318760F1F8729E736656A1B5A8C97E9F04024FB87A335EF1C`; `pg_restore --list` PASS).
- The first compiled migration-only run applied 0001/0002/0003. Ledger filenames/checksums match the repository; the second run applied nothing and skipped all three.
- Read-only schema introspection confirms normalized unique order number, unique immutable source binding, normalized SalesContractNo uniqueness, SalesOrder identity/version and order-number protection, append-only OperationLog, and insert-time number assignment.
- `sales_orders`, `sales_order_source_links`, both Ainuoke current mirror tables and SalesOrder OperationLogs all remain empty. The sequence is unconsumed at `last_value=1, is_called=false`; the expected first real order number remains `SO-00000001`.
- Legacy user/session core data and legacy business tables passed deterministic pre/post reconciliation. RBAC catalog sync, bootstrap admin, Ainuoke reads, SalesOrder bootstrap and Browser cutover were not executed.

## Phase 2B3B.2a bootstrap Bridge transport boundary

- Two complete `--plan` runs against the real target produced the same stable 511-row Preview. Three later authorized `--execute` attempts stopped before PostgreSQL write orchestration: two surfaced fetch `TypeError`; one completed Discovery BEFORE and all 511 BillNo detail calls but failed the detail-query aggregate guard before Discovery AFTER. A separate complete 11-page Discovery diagnostic succeeded. No HTTP authentication rejection was observed; the failure class is transient pre-Response Bridge/fetch transport instability.
- The production bootstrap source layer now makes at most four attempts per Bridge request, with `250ms`, `750ms`, then `1500ms` backoff. Only a fetch rejection before any `Response` is received is eligible: `TypeError` or an allowlisted `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `EPIPE`, `UND_ERR_SOCKET`, or `UND_ERR_CONNECT_TIMEOUT` code.
- A received HTTP response is never retried, regardless of status. Bridge contract errors, report paging/data validation, BillNo mismatch, stale snapshot, adapter errors and business errors remain fail-closed. The cookie is preserved across a rejected attempt and updated only after a received Response supplies `Set-Cookie`.
- Safe `bootstrap_bridge_transport_retry` events contain only attempt/maxAttempts/errorClass/allowlisted transportCode/endpoint pathname. Successful 6086103/6087105 report pages remain counted as reads, while `transportRetries` is reported separately. No raw response, query/body, cookie, credential, token or error message is emitted.
- This is a bootstrap-only wrapper; global Bridge/app behavior is unchanged. Fixed 6086103 and 6087105 contracts, BillNo identity/exact filter, stale guard, Preview/candidate mapping, detail concurrency 4, database service, migrations and sequence semantics are unchanged.
- This PR does not run `--execute`. Real SalesOrder tables and logs remain empty and the real sequence remains unconsumed. The authorized Phase 2B3B.2 operational retry is the next Gate only after this hardening is merged.
- Bootstrap CLI source failures expose only an allowlisted sanitized `bridgeCode`; unknown Bridge codes become `unknown_bridge_error`, with no error message or request/account/secret material. The diagnostic real-target `--plan` returned `account_not_configured` before any complete Discovery phase and with transport retries 0. This is an account/session prerequisite, not a transient network response, so no response-level/upstream retry was added and no second live PLAN was run.
- Automated validation passed: focused source/runner 16/16, disposable PostgreSQL 22/22, Bridge 36/36, Full Tests 601/601, typecheck, lint, both builds and diff-check. Real business counts and sequence remained unchanged. The configured personal Ainuoke account/session must be restored or selected before the authorized Phase 2B3B.2 retry.

## Phase 2B2 Bootstrap Preview result

- Final Discovery observed 507 current-account-visible contracts: `草拟=364`, `生效=143`. Status was preserved without filtering; historical 505 is not a constant.
- Ten mapped-field parity samples passed, so the Preview reused 6086103 Discovery rows and performed only ten additional 6086103 detail page reads. Every row still received complete 6086997 pagination through the existing adapter.
- The second complete Discovery matched the first: hash `95b36d6375ab8061731ef976debffa41b46995da6e8c8146b32960e9ff616261`, total 507, added/removed/changed identity all zero.
- All 507 rows remained bootstrap scope candidates. 473 formed strict in-memory `SalesOrderBootstrapCandidate` projections; 34 were blocked by 6086997 structure (29 missing required `stylecolor`, 5 duplicate canonical source-row identity). There were 26 uncorrected color/contract quantity-difference warnings.
- The 473 valid projections passed `createAinuokeSalesOrder` in a disposable PG16 database: created 473, idempotent returns 473, rejected/schema/source-link conflicts 0, rollback probe 1, trusted OperationLogs 473. The database was destroyed.
- Formal `order_no` is PostgreSQL-owned, globally increasing and immutable: `SO-00000001`, `SO-00000002`, …. UUID remains the technical identity. Official create inputs cannot supply a number; explicit database override/mutation is rejected. Sequence gaps after rollback are intentional and never recycled.

## Phase 2B1 implemented boundary

### Migration and tables

Forward-only migration `database/migrations/0002_sales_order_foundation.sql` adds exactly four domain tables:

- `sales_orders`: stable PostgreSQL UUID identity, normalized unique `order_no`, immutable creation provenance, Zhixu-owned lifecycle state, optimistic `version`, `created_at` and `updated_at`.
- `sales_order_source_links`: immutable `(source_system, source_entity_type, external_id) → sales_order_id` binding with current `sales_contract_no` and `inside_order_no` lookup facts. Database uniqueness and trigger protection prevent one source identity from binding two orders or refresh from silently moving a binding.
- `ainuoke_sales_order_contract_mirrors`: one current typed contract source slice per SalesOrder, including verified identity, raw lifecycle status, contract/delivery dates, style, company/customer/brand snapshots, quantity, source hash/fetched-at and sanitized object metadata.
- `ainuoke_sales_order_color_mirrors`: normalized current color children with stable source-line identity, color, source quantity, optional proven delivery date and sanitized metadata.

Forward-only migration `database/migrations/0003_sales_order_number_sequence.sql` adds the server-owned sequence/allocator without modifying `0002`. It assigns the first new number as `SO-00000001` in an empty database, remains concurrency-safe through PostgreSQL sequence semantics, rejects caller-supplied `order_no`, and extends the identity trigger so the assigned number cannot be updated. The existing unique index remains defense in depth. Source mirror refresh never updates UUID, number, provenance or version.

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
| `factoryStyleNo` / current API `InsideOrderNo` | Ainuoke mutable source attribute | Conditional | No for bound orders | No; drift under same BillNo is informational | Yes for source projection | Yes, with `inside_order_no_drift` evidence |
| customer / brand snapshots and resolved IDs | Ainuoke source for bound orders; Quote/manual otherwise; brand ID is Zhixu master-data resolution | Conditional | Resolution and native snapshots are Zhixu-owned | Referenced master IDs must stay stable | Source snapshot may refresh; resolved ID only via deterministic reconciliation | Yes |
| `customerPoNo` | Quote/manual/user input; current API adapter deliberately leaves `poNo` empty | No with current reports | Yes | Aggregate ID anchors it | No | Yes |
| order date, salesperson and merchandiser snapshots | Quote/manual/Ainuoke-create defaults plus Zhixu edits | No | Yes | Referenced master IDs should stay stable | No | Yes |
| `initialQuantity` | Immutable Zhixu baseline; equals source quantity only when an Ainuoke order is first created | Current value only conditionally; historical baseline cannot generally be reconstructed | Yes as baseline semantics | Aggregate ID anchors it | Never; current code appends changes | Yes |
| current Ainuoke contract quantity | Ainuoke contract mirror | Yes after discovery | No | Source identity/link needed | Yes, source-owned | Persist current mirror; raw history policy is a decision |
| `OrderQuantityChange[]` and color adjustments | Mixed: Ainuoke sync deltas plus manual/system append-only decisions | Current source total is rebuildable; event history/timestamps are not | Manual/system adjustments are yes | Yes for audit and color references | Never overwrite manual/system adjustments | Yes; proposed schema should separate source total from owned adjustments |
| `OrderColorLine[]` | Formal Ainuoke 6087105 BillNo source; 6086997 legacy/historical | Yes after discovery and complete detail read | No, except manual adjustments stored elsewhere | Stable line/source identity needed for adjustments | Replace source lines only; preserve adjustments | Persist current mirror/projection |
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
4. **Phase 2B2.1 6087105 candidate validation:** complete. The old 34 are retained historically and were reclassified as 31 resolved + 3 invalid under its former InsideOrderNo query.
5. **Phase 2B2.2 stable identity migration:** complete in code/read-only validation. 6087105 now queries BillNo; all 511 contracts had exact detail, the former eight missing were recovered as legitimate InsideOrderNo drift, and 6087105 is the Active formal source. No real bootstrap occurred.
6. **Phase 2B2.3 formal number + final fresh Preview:** complete. Stable 511-row BillNo scope produced 511 candidates (505 usable colors, 0 missing, 6 invalid); all 511 passed the formal service, exact idempotent retry, trusted log and rollback probes in disposable PG16 after 0001/0002/0003.
7. **Phase 2B3A.1 real schema activation:** complete. The real target now has the migration ledger, RBAC/OperationLog schema, empty SalesOrder domain tables and an unconsumed number sequence. No business row was created.
8. **Phase 2B3B.1 production runner:** implemented and disposable-validated. The compiled CLI performs fresh source reads, dual execute confirmation, exact target/ledger/empty/sequence/actor guards, serial service-only creation, same-array idempotency replay and read-only reconciliation. This PR performs zero real business writes.
9. **Phase 2B3B.2a Bridge transport hardening:** bounded pre-Response retry is bootstrap-only and preserves all report, identity, Preview and write semantics. It executes no real bootstrap.
10. **Phase 2B3B.2 real bootstrap:** complete. Latest merged main passed a final independent PLAN, then EXECUTE created and reconciled all 511 candidates with exact idempotent replay.
11. **Next boundary:** Browser read/write cutover, Browser retirement, manual/Quote/reorder creation and remaining owned facts remain separate, unapproved Gates. Real bootstrap completion does not authorize them.

## Decisions requiring user confirmation

The user has now confirmed these formal rules:

- server/PostgreSQL generates globally increasing, non-editable `SO-00000001` style order numbers while UUID remains the technical identity;
- `current_account_visible` is the formal organizational bootstrap scope, always measured by fresh complete Discovery rather than a fixed row count;
- source disappearance marks missing and retains UUID/binding/history; it does not hard-delete or auto-cancel, and reappearance restores seen;
- retain normalized current mirrors, source/discovery hashes, necessary fetched/last-seen/missing timestamps and reconciliation metadata, but not complete raw upstream payload by default.

The sequence is implemented by `0003`; missing/tombstone lifecycle storage remains a later independent schema/service Gate. The 6087105 source decision is no longer pending. Decisions still requiring confirmation are:

1. Closing test-data retirement classification.
2. Browser Order/Scheduling retirement and cutover. They still require later explicit approval and are not implied by real SalesOrder bootstrap authorization.

## Readiness

**REAL SALESORDER BOOTSTRAP = COMPLETE.** On 2026-09-12 the compiled runner from main `5271f87cdd350db0ef8f4cc464fc81badc4ed893` used explicit Browser-local identity `user-admin`, independently rebuilt a fresh stable Preview, and created all 511 current-account-visible candidates through `createAinuokeSalesOrder()`.

- Fresh EXECUTE: total 511; before/after hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`; preview hash `6966d8d360118f4aa5fb8565061b0234a482d114de90f9b0fc5dc7c17337ea71`; usable/missing/invalid 505/0/6; InsideOrderNo drift 8; transport retries 20, all recovered.
- Planned/created/idempotent were 511/511/511. Final aggregate/source-link/contract-mirror/color-mirror/log counts were 511/511/511/1,348/511. Reconciliation found zero blank/duplicate BillNo, UUID/order-number duplicates, source conflicts or color mismatches.
- Formal numbers are `SO-00000001` through `SO-00000511`; sequence is `last_value=511, is_called=true`. Every first-create log is trusted admin actor + `艾诺科同步` / `艾诺科新增订单`; replay added none.
- Verified restore points are `D:\workspace\preparesystem\backups\zhixu-20260912-130020.dump` before and `D:\workspace\preparesystem\backups\zhixu-20260912-233603.dump` after bootstrap. Legacy count/digest evidence remained unchanged.

**Browser Order Center cutover = NO.** PostgreSQL now contains the formal bootstrapped SalesOrders, but Browser Order Center still uses its existing Browser Repository. Browser test-order retirement/cutover and every Quote, Style Progress, Scheduling or Closing migration remain separate future Gates.

## Phase 2B3C0 shadow read boundary

The server read model now exposes aggregate/current mirror facts plus list-only `colorCount`; the list API has bounded pagination, parameterized search, exact lifecycle/creation-source filters and allowlisted sorting. A dedicated Order Center server DTO/view-model adapter and `ServerSalesOrderReadRepository` provide `list/getById` without implementing Browser save/update/delete methods. The DEV-only shadow page is not linked from production navigation and does not select or mutate `orderRepository`.

This does not make the full Browser `SalesOrder` type a server DTO. PO, customer/brand IDs, salesperson/merchandiser, business delivery, quantity changes, delivery plans, price versions, execution snapshots, attachments and audit display fields remain absent or separately owned. See `SALES_ORDER_BROWSER_CUTOVER.md` for the exhaustive matrix.

Real authenticated shadow GET is currently blocked: existing users are active/password-backed, but the permission catalog, roles and assignments are empty and `order.view` cannot resolve. C0 did not run the write-capable server startup or synchronize RBAC. Browser list/detail/write cutover remain NO.
## 2026-10-20 Gate4B saved read disclosure candidate

The formal Server detail reuses its native, default-closed disclosures: saved
color/size evidence replaces the old unwired note; the existing low-frequency
source/technical disclosure lazily reads the existing DeliveryPlan GET. The main
color-price table, card order, navigation and all writers are unchanged. Saved
sizes keep slot order, gaps, duplicate names, null versus0 and existing numeric
precision without recalculation. Plan quantities remain decimal strings; null
dates, void history and unknown collection ownership remain explicit. A row's
initial-default marker is historical, distinct from current collection ownership.
Each expanded plan request is scoped to the committed order/session generation;
old200/401 replies cannot update or invalidate a new identity. Retry is explicit
and reads only Zhixu DB, never Ainuoke. Detail and plans are separate snapshots.
This is a local implementation candidate, not a deployment, human acceptance or
protected plan editor. Current test/source evidence is in the Gate4 task.
