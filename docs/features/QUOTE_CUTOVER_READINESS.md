# Quote Production Cutover Readiness

## Purpose and status

This document is the Q2B2C production-cutover readiness audit for Quote Center. It answers what remains before the existing production Quote UI can move from Browser storage to the trusted Server/PostgreSQL stack without losing accepted business behavior, history, permissions, attachments, settings, or rollback capability.

This is an engineering audit and implementation plan. It does not activate migrations, import data, change production routes, authorize a real write, or replace a confirmed business rule.

> 2026-10-05 更新：本文件原 Q2B2C milestone 表是历史基线。Q3B2I-C2 已 CLOSED/PASS，master/settings 现为 Server authority。Q4A schema/API 与 Q4B 共享 AttachmentPanel 的 isolated Server UI candidate 均为工程实现；真实 0008 未激活、production Object Storage adapter 未选/未部署、正式 Browser Quote attachments 仍在 IndexedDB，故 Quote aggregate cutover 仍 NOT READY。Q5 仍未开始。

The labels used below are intentional:

- **CONFIRMED FACT** — established by current code, tests, an Active decision, or an explicit user instruction.
- **CURRENT IMPLEMENTATION** — behavior present on merged `main` at Q2B2C baseline `d5b1849fc6507bed4a4e467f1441066c1e4f38b1`.
- **BLOCKER** — work required before production Quote cutover.
- **USER DECISION REQUIRED** — a policy or product choice that engineering must not invent.
- **AI RECOMMENDATION** — a proposed implementation sequence, not a business decision.

## Executive result

**CONFIRMED FACT:** the accepted production baseline remains `/quote-center`, `/quote-center/new`, and `/quote-center/detail`, including their current list, cockpit, editor, Revision/PriceVersion/Estimate flows, responsive layouts, export UX, and visual density. The isolated `/quote-center/server-*` pages are engineering and acceptance workspaces, not replacement production UI.

**CURRENT IMPLEMENTATION:** the existing production routes still use `mockQuoteRepository`, Browser `PermissionProvider`, localStorage, and IndexedDB. The Q2 Server API and workspaces prove persistence, authorization, optimistic concurrency, decimal projection, and Server-owned creation/numbering, but do not yet provide the complete list projection, master/settings authority, attachment pipeline, production identity convergence, or real-data migration needed by the accepted UI.

**AUDIT RESULT:** the existing production Quote UI is reusable. A layout redesign is not technically required. Cutover readiness is **NOT READY** until Q3, Q4, Q5 and the production integration/acceptance gates below are complete.

## Verified milestone baseline

| Milestone | Verified engineering state | Production activation state |
| --- | --- | --- |
| M0 migration activation safety | Complete. Normal startup verifies migrations read-only and fails before sync/bootstrap/listen when pending or invalid. | No Quote migration activation authorized. |
| Q1 Quote PostgreSQL foundation | Complete. `0005_quote_foundation.sql`, aggregate repository, decimal strings, historical immutability, optimistic version and atomic replacement are merged. | Disposable PostgreSQL only. |
| C4.2 ConfirmedCommercialTerms | Implementation complete. Exact Quote provenance, trusted RBAC/audit and optimistic terms version are merged. | Real `0004` activation and production Browser acceptance not executed. |
| Q2A trusted Quote API | Complete. Trusted list/detail/create/full-replacement endpoints and transactional bounded Quote OperationLog are merged. | Not wired to production Quote routes. |
| Q2B1 shadow read | Complete on isolated Server preview/detail routes. | Engineering workspace only. |
| Q2B2A existing-Quote writer | Complete on isolated Server edit route with exact decimal bridge and conflict handling. | Deliberately omits major production editor capabilities. |
| Q2B2B creation/numbering | Complete after PR #44. Server-only runtime identity/numbering and `0006` are merged. | Isolated lazy-create workspace only; real `0006` not applied. |
| Q3 Server masters/settings | Q3B2I-C2 CLOSED/PASS: real 0007, controlled import and Server authority handoff completed; formal editing reopened. | Not a current Quote cutover blocker. Quote aggregate remains Browser-owned. |
| Q4 Server attachments | Q4A foundation and Q4B isolated Server writer UI candidate implemented; one AttachmentPanel, separate Browser/Server controllers. | **BLOCKER:** real 0008 activation, provider/deployment, historical shared-name policy and production Quote ownership/cutover remain separate. |
| Q5 migration preview/rehearsal | Not implemented. | **BLOCKER.** |
| Real Quote production cutover | Not complete. | No real Quote business write performed. |

Primary code evidence for this audit is `features/quote-center/components/quote-list.tsx`, `quote-editor.tsx` and their mounted children; `features/quote-center/repository/`; `features/quote-center/server/`; `features/basic-settings/`; `features/global-search/`; `features/template-settings/`; `features/operation-logs/`; `features/order-center/components/quote-to-order-modal.tsx`; `server/quotes/`; `server/sales-orders/`; `server/app.ts`; and migrations `0004`–`0006`. The milestone claims above are also backed by their merged integration/contract tests; this docs-only audit did not rerun PostgreSQL tests or connect to a database.

## Production route and UI constraint

**CONFIRMED FACT:** production cutover means:

```text
existing Quote list/new/detail UI
  + one trusted Server identity
  + Server repositories/APIs
  + PostgreSQL
  + Object Storage attachments
```

It does not mean promoting the reduced Server test pages into production UI. The current production components already encode accepted business layout, responsive behavior and workflows. Their data and authorization adapters must change behind the same UI.

### Current architectural friction

- Production components import concrete Browser repositories directly instead of depending on a production-swappable aggregate/master/attachment interface.
- `QuoteList` loads every complete aggregate and computes search, filters, metrics and selection client-side. Q2A list returns only `id`, `quoteCode`, `defaultRevisionId`, `version`, and a page count.
- `QuoteEditor` combines pure domain behavior with Browser repositories for Quote save, master/settings mutation, attachment blobs, audit, identity and Quote-to-Order.
- AppShell Server mode now provides bounded navigation among the five isolated Q3B1 settings candidates while keeping unrelated Browser-authorized controls hidden. Production convergence still cannot simply turn this mode on: real master migration, Quote editor/list integration, global search and later cutover gates remain incomplete.
- The isolated Server writer is intentionally reduced; using it as the production editor would discard accepted functionality.

## Production Quote list audit

| Feature | Current Browser dependency | Existing Server capability | Missing Server capability | Blocker | Target |
| --- | --- | --- | --- | --- | --- |
| List source | `mockQuoteRepository.list()` returns all full aggregates | Bounded metadata list with trusted `quote.view` | Production list DTO/projection or safe query strategy containing accepted display facts | Yes | Q6A integration |
| Pagination | None; all rows are held in memory | `limit`/`offset`, max 100 | Stable sort, total/has-more semantics and UI pagination contract | Yes | Q6A |
| Search | Client AND search over quote code, style, name, brand, salesperson and countries | Unsupported query fields are rejected | Server-side ordinary + structured AND search matching D-055 | Yes | Q6A |
| Type/status filters | Client-side exact filters | None | Typed `quoteType` and aggregate-status filters | Yes | Q6A |
| Sort | Repository/list order only; no user sort control | Repository orders by technical `id` | Deliberate stable production default and supported sort contract; do not invent visible controls | Yes for deterministic paging | Q6A |
| Style thumbnail | IndexedDB attachment lookup | Aggregate carries reference IDs only | Q4 metadata/thumb/download URL adapter | Yes | Q4/Q6A |
| Quote status | Full aggregate | Persisted in root metadata/detail | List projection | Yes | Q6A |
| Quantities | Computed across default Revision PriceVersions | Full detail only | Null-preserving list projection or safe aggregate fetch | Yes | Q6A |
| Cost summaries | Existing pure calculator over full PriceVersions | Full detail decimal strings | Trusted list summary contract or safe client calculation after data fetch | Yes | Q6A |
| Quoted price display | Existing calculator + one-decimal truncation presentation | Full detail snapshots | Same as cost summaries; no new formula | Yes | Q6A |
| Brand/salesperson | Default Revision name snapshots | Full detail snapshots | List projection; no live-master dependency for display | Yes | Q6A |
| Manufacturing-country search | Scans all PriceVersions | Full detail snapshots | Server filter/search over all current PriceVersions | Yes | Q6A |
| Revision information | Default Revision label and PriceVersion count | IDs only in list | Revision label/count/list summary | Yes | Q6A |
| PriceVersion summaries | Count, country/name, quantities and metrics | Full detail only | Typed list summary | Yes | Q6A |
| Personal column/table preferences | localStorage by Browser user ID | AppShell can key preferences by Server public user ID | Re-key to trusted Server user; migration/fallback rule for old preference key | No business-data blocker | Q6A |
| Global search | Registry uses `mockQuoteRepository` and Browser `can()` | No production Quote search provider | Trusted Server provider, Server permission and recent-item filtering | Yes | Q6A |
| Batch export selection | Selects from complete in-memory filtered list | No batch aggregate/export read | Cross-page selection identity and bounded detail/batch fetch | Yes | Q6A |
| Permissions | Browser `usePermissions()` | Trusted session + Quote permission catalog | Existing production controls must consume Server authority only | Yes | Q6A |

**BLOCKER:** the current Q2 metadata list is not sufficient for the production list. Loading every aggregate to recreate the current Browser behavior is acceptable only as a bounded temporary candidate for the audited eight-Quote dataset; it is not a durable pagination/search contract.

## Production Quote editor dependency graph

```text
QuoteEditor and existing child components
├─ pure domain: validation, calculators, presentation, Revision/PriceVersion/Estimate transforms
├─ Quote aggregate: Browser repository → trusted Server aggregate API
├─ identity/permission: Browser PermissionProvider → trusted Server session/RBAC
├─ live defaults/masters: Browser Basic Settings + Quote Settings → Q3 Server authority
├─ binary/reference data: IndexedDB attachment repository → Q4 API/Object Storage
├─ audit: Browser OperationLog diff writers → trusted Server transaction/action audit
├─ shared current terms: optional C4.2 gate → activated exact-provenance Server domain
├─ export: pure client workbook logic + template/attachment readers + trusted export audit
└─ Quote-to-Order: Browser Order repository → hidden until a trusted Server transaction exists
```

### Dependency classification

| Dependency | Class | Evidence and cutover action |
| --- | --- | --- |
| Validation, calculations, null handling, USD conversion, final-price formatting | A — pure domain / safe to reuse | Keep the same functions and tests. Server persistence must not add recomputation or rounding. |
| Existing list/editor/cockpit/sticky/quick-nav/responsive components | A — safe to reuse | Replace adapters/authority, not layout. |
| Q1 aggregate repository and Q2A GET/PUT/version conflict | B — Server ready foundation | Reuse; extend list/workflow integration without creating a second Quote model. |
| Exact decimal Server↔Browser adapter | B — Server ready with guard | Reuse its fail-closed canonical round-trip rule in the production editor. |
| Personal columns, widths, collapsed state, recent items | C — may remain local preference | Key by trusted Server public user ID and never use as authorization/business truth. |
| Brand, salesperson, fabric/trim libraries, defaults, presets, global settings | D — must move to Server | Q3 owns schema/API/migration/RBAC/audit. Historical Quote snapshots remain independent. |
| Attachments and style image | D — must move to Server/Object Storage | Q4 owns metadata, relationships, binary transport, authorization and audit. |
| Browser identity and `usePermissions()` business guards | D — must move to Server | Production routes must expose one Server session and Server permission authority. |
| Browser OperationLog append/diff | D — must move to Server | No untrusted actor and no long-term dual log. |
| Aggregate save and conflict UX | D — production integration required | Keep dirty state on 401/409/network failure; explicit reload only; no Browser fallback. |
| Revision/PriceVersion/Estimate workflow provenance | D — trusted command/normalization required | Current aggregate PUT validates permissions but client still supplies new child IDs and display creator/timestamps. Define the trusted Server stamping boundary before cutover. |
| C4.2 current terms | D — must activate and integrate where exact linkage exists | Snapshot confirmation and shared current terms must not become duplicate current writers. |
| Browser hard delete | E/F — disable/defer; policy decision | No Server DELETE exists and no production deletion/retention rule is confirmed. |
| Quote-to-Order | E — disable/defer | Never fall back to Browser SalesOrder for a Server Quote. |
| Custom template authority | F — user decision | Built-in template can preserve baseline export; cross-device custom templates need formal authority/storage scope. |

### New Quote workflow gap

**CONFIRMED FACT:** opening `/quote-center/new` must remain Lazy Create; D-088 requires the Server to allocate runtime Quote/initial Revision/initial PriceVersion identities and immutable `quoteCode`. Q2B2B POST accepts `{}` only.

**BLOCKER:** the current production `/new` page builds a Browser draft from live defaults and persists only on save, while the isolated Server flow explicitly creates a neutral draft before editing. A production integration must preserve the existing form and avoid duplicate/orphan creation after ambiguous network results.

**AI RECOMMENDATION:** keep the existing `/quote-center/new` UI, but add an explicit, recoverable Server draft-establishment state within that page. The Server-created record becomes the sole identity, then the same editor saves its populated aggregate with `expectedVersion`. If product insists that the first Save remains the only visible creation action, add an idempotency/recovery contract before using the two-request POST→PUT sequence. Do not weaken POST to accept caller-owned identity or actor.

## Q3 Server master/settings authority audit

Historical Quote readability and new-Quote live authority are different concerns. Quote snapshots must not gain destructive required FKs to current masters.

| Domain | Current authority/storage | Snapshot behavior | Production requirement | Rules/gaps |
| --- | --- | --- | --- | --- |
| Brands | `BasicSettingsState.brands`, localStorage | Revision stores optional `brandId` + `brandName` | Server master, normalized-name uniqueness, status, permissions, trusted audit, migration | Dangling historical ID/name remains readable; do not invent Customer canonical relation. |
| Customer salespeople | localStorage, `brandId` relation | Revision stores optional ID + name | Server master, global normalized-name uniqueness, brand-scoped options, status, migration/audit | This is a business master, not `app_users`. |
| Fabric library | localStorage | Cost row is a complete snapshot with optional source library ID | Server searchable library and quick-save boundary | Duplicate names are valid; identity is stable ID; no required historical FK. |
| Trim library | localStorage | Complete row snapshot with optional source library ID | Same as fabric | Duplicate names valid; delete must address default-config references without altering Quote history. |
| DefaultTrimConfig | Embedded in brand/salesperson defaults | Applied to new independent Trim rows | Server default model and explicit migration projection | Confirmed rule: no quantity/usage ownership. Q0 found all 10 legacy configs had non-null quantity; Q3/Q5 must explicitly drop/project that legacy field, not create a Server quantity column. |
| Manufacturing presets | Quote global settings localStorage | Every PriceVersion stores ID/name/country/currency/markup/freight snapshot | Server settings authority, status/versioning, permissions/audit, migration | Missing/dangling preset remains valid historical snapshot; do not backfill country/preset. |
| Global Quote settings | localStorage | Initialize only new facts | Server authority for exchange rate, markup, labor currency/description, other-cost and default preset | Changes never overwrite existing PriceVersions. |
| Default other cost | System, Brand and CustomerSalesperson each own at most one nullable `DefaultOtherCost` | Applied to a new Quote as an independent `OtherCostLine` snapshot | Server stores only `name` + nullable `amount`; resolution is Salesperson > Brand > System | D-089 supersedes the old 0..N default-setting rule. Quote `OtherCostLine` remains 0..N, historical rows remain unchanged, and legacy settings project only the first enabled valid row. |
| Suppliers | Free string in library/cost rows | Snapshot string | Keep free string; suggestions from distinct authorized library values | No Supplier domain is confirmed. |
| Quick create | Browser nested modal writes Basic Settings repository and Browser log | Newly saved master becomes selected; Quote draft stays lazy | Server master mutation with Q3 permission and trusted audit; preserve unsaved Quote fields | Requires network/error/conflict behavior and no Browser fallback. |

Q0 durable evidence records 8 Quotes / 9 Revisions / 12 PriceVersions, no aggregate corruption blocker, zero Estimate records, dangling optional brand/salesperson references with intact names, valid duplicate material names, and missing country/preset in some snapshots. Exact Q0 master counts are not reproduced in durable repository docs and must be re-read from a fresh authorized backup during Q5A rather than guessed here.

**Q3 PRODUCTION BLOCKER = YES.** Q3B1 proves the existing settings UI against Server authority on isolated candidate routes, including quick Trim create and atomic global settings save. Q3B2B real-backup read-only Preview and Q3B2C disposable rehearsal passed; Q3B2D recorded the non-executed activation plan. Production settings and Quote creation/editor still use Browser repositories; fresh-source import/reconciliation, Quote-side production adapters and separately authorized activation/cutover gates remain incomplete.

## Q4 attachment and Object Storage audit

### Confirmed target

- PostgreSQL owns attachment metadata, Quote/Revision relationships and trusted audit.
- Object Storage owns binary content.
- VPS filesystem, Browser IndexedDB, PostgreSQL bytea/base64 and absolute local paths are not production sources of truth.
- Existing Browser attachment binaries are excluded from migration. Q5 projects old references to `[]`, `[]`, `null` while leaving Browser data untouched through the rollback window.

### Required production capabilities

| Capability | Current behavior to preserve | Q4 requirement |
| --- | --- | --- |
| Upload | Multi-image/file, camera/gallery, confirmed paste/drop batch | Authorized upload initiation/completion, size/type validation, stable UUID/key and failure cleanup |
| Download | Blob download | Authorized short-lived download or application proxy; safe filename disposition |
| Preview | Images only; files download-only | Image preview URL; do not add unsupported document preview |
| Thumbnail | Style image in list/base info | Bounded thumbnail/original derivative strategy with revocable authorization |
| Style image | One image reference, first upload default, explicit later change | PostgreSQL Revision relationship and transactional style-image selection |
| Rename | Editable Revision image display name | Metadata mutation preserving ID/key/content; trusted audit |
| Delete | Remove reference; retain binary while any Quote Revision or SalesOrder refers to it | Reference-aware lifecycle, retention/tombstone policy, asynchronous object GC only after safe proof |
| Historical Revision | Preview/download only | Immutable relationship enforcement and read permission |
| Permissions/audit | Browser buttons/log | Server `quote.view`/attachment edit boundary; actor only from session; upload/rename/delete/style-image logs |
| Export | Reads style image/template blobs | Authorized binary fetch usable by existing client exporter |
| Consistency | Browser blob and Quote save are separate stores | Staged object lifecycle, transactionally committed metadata/relationship, orphan reconciliation |

Recommended object identity remains independent of business names, for example `attachments/<attachment-uuid>/original`.

**USER DECISION REQUIRED:** Object Storage provider/account, region, bucket ownership, public-access posture, signed URL vs authenticated proxy policy, upload/file-size limits, allowed MIME/extensions, malware scanning policy, content-hash dedupe policy, retention/restore window, object-versioning/lifecycle, encryption/key ownership, CORS, thumbnail generation and permanent-delete authorization.

**Q4 BLOCKER = YES.** Hiding the attachment card would violate the requested production UI/behavior baseline. Q4 must be production-shaped before the final route cutover.

## Q5 real Quote migration audit

No real migration was performed. The target projection must use the internal Q1 exact aggregate import boundary, not runtime POST/number allocation.

| Source domain | Required transformation/guard |
| --- | --- |
| Quote | Preserve exact `id`, `quoteCode`, status, timestamps, deleted marker and other metadata. Duplicate exact `quoteCode` stops the run; no renumber/suffix/dedupe. |
| QuoteRevision | Preserve `revisionId`, ordering, default/current compatibility, labels, reason/note, parent relationship, created metadata and read-only history. Default pointer must resolve. |
| PriceVersion | Preserve exact owner-scoped ID/order, name, quantity, description, every pricing parameter snapshot and confirmation snapshot. |
| Fabric/Trim/Labor/OtherCost | Preserve exact row IDs and all snapshot fields. Duplicate names are valid. Preserve source provenance without live required FK. |
| Estimate | Preserve current/history IDs, order, staleness/ignored and source snapshot semantics even though Q0 found zero current real Estimate records. |
| Decimal values | Convert to exact canonical decimal strings accepted by Q1 NUMERIC boundaries; preserve stored business values, `null != 0`, and do not recompute. |
| Master IDs/names | Preserve Quote snapshot IDs/names even when the current master is missing. Migrate live master authorities separately under Q3. |
| Confirmation | Preserve historical embedded PriceVersion confirmation. Reconcile separately with shared current C4.2 terms; never infer a current link/value silently. |
| Attachments | Report before counts, then target `imageAttachmentIds=[]`, `fileAttachmentIds=[]`, `styleImageAttachmentId=null`. Do not delete or mutate Browser refs/blobs. |
| Quote number sequence | After import, calibrate `quote_center_quote_number_seq` to the max valid suffix + 1 and verify the next collision-safe candidate. |
| Global settings/masters | Q3 migration must complete/reconcile before production new-Quote/editor activation. They are not embedded replacements for historical snapshots. |

### Required Q5 safety evidence

1. Fresh authorized backup identity/hash and source-origin verification.
2. Read-only projection report with input/output counts, IDs, codes, attachment refs cleared, master linkage diagnostics and rejection reasons.
3. Duplicate Quote/Revision/PriceVersion/cost identity and exact `quoteCode` scans.
4. Disposable PostgreSQL import, rerun/idempotency or explicit already-imported behavior, aggregate hash reconciliation and sequence calibration.
5. Read-back comparison for all 8/9/12 Q0-scale records plus null/zero and historical snapshot checks; use the fresh source count if it has changed.
6. Failure injection proving whole-aggregate rollback and no partial child rows.
7. No dependency on ConfirmedCommercialTerms tables for core historical Quote persistence, while the integrated deployment can activate reviewed 0004/0005/0006 explicitly.
8. Backup/restore rehearsal for PostgreSQL plus Object Storage configuration/metadata and a defined rollback window.

**Unresolved Q0 decisions:** whether to import or archive the 155 historical Browser OperationLogs; whether custom Browser Excel templates are production migration assets or may remain device-local/use built-in fallback; exact current-terms reconciliation for legacy confirmation snapshots; and any fresh-backup differences from the 8/9/12 Q0 inventory. These are reported separately and must not be silently folded into Quote import.

**Q5 BLOCKER = YES.** A real-backup preview and disposable rehearsal are required before any explicit real activation/import authorization.

## Production identity and permission audit

**CONFIRMED FACT:** production has one user-facing Zhixu login and one trusted Server Session. Browser mock users/roles must not authorize production business reads, writes, export, attachments, masters or audit.

### Remaining Browser identity dependencies

- `QuoteList`, `QuoteEditor`, batch export, Copy Quote and Quote-to-Order call `usePermissions()` and use `currentUser` for actor/provenance.
- `AppShell` defaults to Browser identity; its trusted Server mode currently hides global search, settings navigation and the mock switcher rather than supplying Server-ready replacements.
- personal table/column/sidebar preferences and recent items are keyed by Browser user ID.
- attachment `createdBy`, Revision `createdBy`, Estimate `generatedBy` and other display metadata are currently composed in the browser; trusted business audit is separate and must be Server-stamped where provenance is claimed.
- Q3 quick-create/settings and template changes use Browser permissions and Browser logs.

### Required convergence

- Production Quote routes require a session before rendering protected data and use only `ServerSession.hasPermission()` or an equivalent Server permission authority.
- 401 invalidates the session and preserves unsaved in-memory state; 403 stays explicit; Server unavailable fails closed; no Browser data fallback.
- AppShell must show the same trusted identity across Quote list/new/detail and Server-ready settings/search, without a test-user selector or permanent diagnostic strip.
- local preferences may remain local but must use the trusted user's stable public ID and must never grant permissions.
- export, attachments and masters require Server authorization even if workbook creation or preference storage remains client-side.

**SINGLE-LOGIN BLOCKER = YES.** The trusted session foundation exists, but the production Quote surfaces are not converged.

## OperationLog action audit

The current Server aggregate service writes one trusted bounded `创建报价` or `保存报价` event per real aggregate mutation. This is transactionally safe, but it does not preserve the existing action-level audit UX. Browser logs must not be copied into trusted logs automatically or dual-written after cutover.

The current Browser action inventory relevant to Quote production is: Quote create/save/delete; Revision create/update/delete; PriceVersion create/update/preset-change/delete and cost synchronization; customer confirmation create/update; fabric/trim/labor/other-cost changes; image/file upload, attachment delete and style-image change; Estimate generation/restoration; single Quote export, batch Quote export and summary export; brand/salesperson create/update/delete; global Quote settings and manufacturing-preset changes; and template upload/default/status changes. Some action labels exist as reserved capability even where the current UI has no trigger, such as Revision delete. Production audit scope must follow actual enabled workflows, not manufacture events for an unreachable action.

| Action | Current Server state | Cutover requirement |
| --- | --- | --- |
| Runtime create | Trusted transaction log exists | Ready; production UI must use it. |
| Generic aggregate save | Trusted transaction log exists | Keep as aggregate envelope; add bounded action detail without duplicate/conflicting events. |
| Revision create/update | Permission diff exists; generic save only | Add trusted action classification, IDs/labels and provenance. |
| PriceVersion create/update/delete | Permission diff exists; generic save only | Add trusted action classification and bounded before/after. |
| Fabric/trim/labor/other-cost changes | Generic save only | Add bounded field/row audit matching accepted business trace; never full aggregate dump. |
| Pricing settings/preset change | Generic save only | Add trusted setting/preset snapshot diff. |
| Embedded confirmation | Generic save only | Add trusted confirmation action for unlinked snapshot workflow. |
| Linked current terms | C4.2 trusted transactional audit exists | Ready after real activation/linkage acceptance; do not duplicate into aggregate snapshot log. |
| Estimate generate/restore/edit | Generic save only | Add trusted action/provenance; preserve immutable history. |
| Attachment upload/rename/delete/style image | No Q4 domain | Q4 trusted action audit. |
| Export/single/batch/summary | No client append API by design | Add narrow Server audit command after successful generation; no workbook/blob/body in log. |
| Quote delete | No Server DELETE | Deferred pending policy. |
| Master quick-create/settings/templates | Browser logs only | Q3/Q4 trusted audit in owning mutation transactions. |

The Browser's 155 historical logs remain **USER DECISION REQUIRED**. Importing them as if they were trusted Server events would falsify authority; a future historical namespace/import marker is possible only after an explicit policy.

## Export audit

**CONFIRMED FACT:** the existing workbook generation, formulas, one-Revision-per-workbook/one-PriceVersion-per-sheet behavior, final price formatting and templates are accepted behavior.

**AI RECOMMENDATION:** keep workbook generation client-side. It is pure presentation/calculation logic and does not require server-side Excel generation when supplied with an authorized Server aggregate. Required cutover work is:

- fetch exact full aggregate(s), including all selected cross-page Quotes, under `quote.view`/`quote.export`;
- retain current formulas and null/zero semantics;
- fetch Q4 style image through an authorized attachment adapter;
- decide whether custom templates migrate to Server/Object Storage, remain per-device, or V1 uses only the built-in template fallback;
- append a trusted bounded export event after successful generation, including the existing minimal selected-Quote/PriceVersion snapshot, never the workbook/blob;
- fail closed on auth/server/template/attachment errors without reading Browser Quote business data.

Batch selection cannot depend on all aggregates being resident in the current list page. Use stable Quote IDs plus a bounded batch/detail fetch and show partial export failures exactly as today.

## Quote-to-Order audit

The current modal creates a Browser SalesOrder, computes an order number in the browser, accepts customer PO/order date/quantity/merchandiser, saves via `orderRepository`, and appends Browser logs. This path cannot consume a production Server Quote.

A future trusted implementation needs:

- exact Quote/Revision/PriceVersion provenance and an immutable/idempotent conversion key;
- trusted `quote.view` + `order.create` identity and Server-generated SalesOrder identity/number;
- one Server transaction for SalesOrder, provenance, initial quantity/price snapshots, C4.2 association/current terms and OperationLogs;
- explicit retry/idempotency semantics and no Browser Order fallback;
- a product decision for unconfirmed Quote handling and all Order fields not yet owned by the formal Server Order domain.

The PostgreSQL SalesOrder foundation already has immutable `source_quote_id`, `source_revision_id`, and `source_price_version_id` columns, but the current service/API only implements Ainuoke creation and does not implement this conversion transaction.

**AI RECOMMENDATION:** Quote-to-Order does **not** block Quote-first launch because Route B explicitly allows Order to remain unavailable until its own production gate. Hide/disable the action with an explicit unavailable explanation. Whether this accepted feature may be hidden at initial launch is still a **USER DECISION REQUIRED** product-scope confirmation.

## Delete and retirement audit

Current Browser `delete()` hard-removes the aggregate by default; a soft-delete option exists but is not the active UI call. The Server API deliberately exposes no DELETE and forbids changing `deletedAt` through aggregate PUT. Business rules explicitly say not to infer a production deletion policy from the mock behavior.

**USER DECISION REQUIRED:** retention period, archive/soft-delete semantics, who can restore, relationship blocks, legal/audit retention, permanent purge authority and whether a Quote linked to terms/order may ever be purged.

**AI RECOMMENDATION:** hide production delete at initial launch. This is safe and does not corrupt data, so implementation is deferrable, but the policy itself is not ready. Do not carry Browser hard delete forward.

## Cutover route strategy

| Option | Assessment |
| --- | --- |
| A. Direct replacement after Q3/Q4/Q5 | Simple final topology but concentrates integration risk at the real cutover and gives less acceptance evidence. |
| B. Feature-flagged Server repository behind existing routes | Preserves exact production UI and supports production-candidate/rollback, but the flag must be environment-wide and read/write coherent; never per-request dual authority. |
| C. Separate production-candidate route using the same existing UI components | Best pre-cutover acceptance isolation, provided components depend on injected repositories/authority and candidate route never initializes Browser Quote data. |

**AI RECOMMENDATION:** first extract/inject the production adapters, then use option C for production-shaped acceptance with the exact same components and CSS. After Q5/Q6 evidence, switch the environment-wide flag behind `/quote-center*` as option B. Retain Browser data read-only for rollback but never dual-write. After acceptance, Server becomes the only Quote business authority.

## UI preservation matrix

| Existing UI feature | Keep unchanged | Data-source change | Permission change | Dependency | Manual acceptance |
| --- | --- | --- | --- | --- | --- |
| Quote list/table/mobile cards | Yes | Server list projection + Q4 thumb | Server `quote.view/create/export` | Q4, Q5, Q6A | Yes |
| Quote cockpit/metrics | Yes | Server aggregate | Server view/edit | Q5/Q6A | Yes |
| Basic-info card | Yes | Server aggregate + Q3 options | Server edit + Q3 mutations | Q3/Q5 | Yes |
| PriceVersion selector/workflows | Yes | Server aggregate commands/save | Fine-grained Server permissions | Q6A | Yes |
| Fabric/trim tables | Yes | Server aggregate + Q3 libraries | Server cost/master permissions | Q3 | Yes |
| Labor/other-cost cards | Yes | Server aggregate + Q3 defaults | Server cost/settings permissions | Q3 | Yes |
| Attachment card/style image | Yes | Q4 API/Object Storage | Server attachment permissions | Q4 | Yes |
| Customer confirmation | Yes | Snapshot save or exact C4.2 current terms by ownership | Server `quote.confirm` | 0004 acceptance/Q6 | Yes |
| Pricing settings/presets | Yes | Q3 Server presets/settings | Server settings permission | Q3 | Yes |
| Revision modal | Yes | Server aggregate workflow | Server revision permissions | Q6A | Yes |
| Estimate panel | Yes | Server aggregate workflow | Server estimate permissions | Q6A | Yes |
| Sticky header/quick navigation | Yes | None beyond current aggregate | Same Server authority | Q6A | Yes |
| Responsive behavior | Yes | None | None | Candidate build | Desktop/tablet/mobile |
| Excel export | Yes | Server aggregate + Q4/template adapter | Server export permission/audit | Q4/Q6A | Yes |
| Batch export | Yes | ID selection + batch aggregate fetch | Server export permission/audit | Q6A | Yes |
| Global search | Yes | Trusted Server provider | Server `quote.view` | Q6A | Yes |

## Blocker classification

### P0 blockers

1. Q3 Server master/settings authority, migration, trusted RBAC/audit and production adapters.
2. Q4 attachment metadata/relationship API plus production Object Storage, security, consistency and audit.
3. Q5 fresh-backup preview, exact transformation, disposable rehearsal/reconciliation, sequence calibration and rollback/restore evidence.
4. Production Quote list/search/filter/paging/detail/editor integration using the accepted UI, with no Browser business-data fallback.
5. One trusted Server identity/permission authority across list/new/detail/settings/search/export/attachments.
6. New-Quote lazy-create/ambiguous-result recovery compatible with D-088 and the existing creation UI.
7. Explicit activation and acceptance plan for 0004/0005/0006; no startup migration.
8. C4.2 linkage/current-terms behavior reconciled for imported Quote confirmation snapshots without dual current writers.

### P1 required before or during cutover

- granular trusted Server audit for Revision/PriceVersion/cost/settings/Estimate/confirmation/export and Q3/Q4 actions;
- Server-side deterministic list contract and trusted global search;
- full optimistic-conflict, 401/403/unavailable, dirty-navigation and no-fallback behavior in the existing editor;
- trusted provenance/time boundary for new Revision/PriceVersion/Estimate metadata;
- export batch fetch, Q4 image access and template-scope resolution;
- environment-wide cutover/rollback flag, observability and backup/restore runbook;
- production-shaped candidate acceptance at all required viewports.

### P2 follow-ups that may be hidden/deferred

- trusted Quote-to-Order transaction, after separate Order readiness;
- production delete/restore/purge implementation after policy approval;
- migration/display of historical Browser OperationLogs after a decision;
- custom template cross-device management if V1 explicitly uses the built-in template;
- retirement/removal of engineering Server pages after the rollback window;
- optional performance improvements beyond the audited small initial dataset.

### User decisions required

- Object Storage and attachment security/retention choices listed under Q4.
- Historical Browser OperationLog treatment.
- Custom Excel template authority/migration for production V1.
- Whether Copy Quote and Quote-to-Order may be hidden until trusted Server commands exist; preserving them requires command/API work before cutover.
- Exact production delete/archive/restore/purge policy.
- Exact new-Quote first-action UX if preserving a single visible Save requires idempotency/API work.
- Legacy confirmation-to-current-terms reconciliation where exact formal linkage/value authority is not already proven.
- Authorization for every future real migration/import/deployment step; this audit grants none.

## Recommended phase sequence

| Phase | Goal and scope | Blocked by | Schema expected | Real-write authorization | Completion gate |
| --- | --- | --- | --- | --- | --- |
| Q3 | Server masters/settings, migrations, typed API, RBAC/audit, Q0 projection and production UI adapters | User decisions on exact settings/template scope | Yes | No for disposable work; separate for real activation/import | Disposable round-trip/conflict/uniqueness/snapshot tests and existing UI integration contract |
| Q4 | Attachment metadata/relations/API, Object Storage adapter, upload/download/thumb/rename/delete lifecycle and audit | Provider/security decisions | Yes | No for disposable/staging; separate for real resources | Failure/cleanup/permission/history/export and backup/restore rehearsal |
| Q5A | Fresh real-backup read-only projection/preview | Q3/Q4 target contracts | No writes | Read-only backup authorization only | Exact counts/hashes/rejections/attachment clearing/master diagnostics |
| Q5B | Disposable import rehearsal and reconciliation | Q5A clean preview | No new design beyond reviewed migrations | No real write | Exact identity/value/hash/rerun/rollback/sequence evidence |
| Q6A | Production-shaped deployment/restore rehearsal and same-UI candidate route | Q3/Q4/Q5B | Existing reviewed schema | Staging-only authorization | Full automated checks, restore drill, security/availability and manual UI acceptance |
| Q6B | Explicit real preflight/backup, all pending migrations including `0004`–`0007` when applicable, later reviewed Q4 schema, and Quote/master import | Q6A pass and explicit user authorization; Q3B2D safety plan | Apply reviewed migrations only, per-file transaction | **YES, explicit** | Migration/read-back/reconciliation/sequence/zero-duplicate pass; Browser source unchanged and writes frozen |
| Q6C | Switch existing `/quote-center*` UI to Server-only adapters and accept production | Q6B and explicit cutover authorization | No surprise schema | Auth/session/audit writes only as authorized acceptance | All workflow/viewports pass, no Browser fallback/dual write, rollback window opened |

Q3 and Q4 implementation may proceed in parallel only if their ownership contracts and migration order are coordinated. Q5 must consume their reviewed target contracts rather than inventing provisional mappings.

## Eventual manual acceptance plan

### Viewports

- large desktop, including the current wide cost-table layout;
- approximately 1280px laptop;
- compact/half-width desktop with the accepted compact cost rows/actions;
- tablet navigation/layout where applicable;
- true mobile cards, action layout, attachment camera/gallery behavior and modals.

### Workflows

- anonymous protection, one login, hard-refresh session restore and logout/re-login;
- list paging/search/structured search/type/status filters, deterministic ordering, preferences and global search;
- open all current/historical Revisions and PriceVersions; preserve IDs and snapshot values;
- new Quote with server identity/number, defaults, quick-create and no page-open write;
- edit/save/hard refresh, two-tab optimistic conflict and explicit discard/reload;
- PriceVersion create/edit/delete-last protection and Revision update/history immutability;
- fabric/trim/labor/other-cost calculations, four-decimal fabric consumption, USD conversion, one-decimal final price truncation and `null` vs `0`;
- manufacturing preset application without historical overwrite;
- Estimate generate/edit/archive/restore/ignore behavior;
- unlinked snapshot confirmation and exact linked C4.2 current terms behavior;
- Q4 upload/paste/drop/camera, thumbnail/style image, rename/download/delete/history and failure cleanup;
- single and batch Excel export with template fallback and trusted audit;
- dirty navigation on save/auth/network/conflict failure;
- permission denial for every protected surface/action;
- Server unavailable and 401/403 fail closed with no `mockQuoteRepository`, localStorage Quote, IndexedDB business attachment or Browser OperationLog fallback.

Before/after acceptance must reconcile Quote/master/attachment metadata/OperationLog counts, aggregate hashes, sequence evidence and Browser source preservation.

## Engineering workspace retirement

**AI RECOMMENDATION:** keep `/quote-center/server-preview`, `/server-detail`, `/server-edit`, and `/server-new` hidden from normal navigation during implementation and the rollback window as bounded diagnostics. After production acceptance, either restrict them to an explicit admin diagnostic capability or remove them in a later cleanup. They must never become a second long-lived writer or alternate product UI.

## Safety outcome

- Real migration `0004`: **NOT EXECUTED**
- Real migration `0005`: **NOT EXECUTED**
- Real migration `0006`: **NOT EXECUTED**
- Real Quote migration: **NOT EXECUTED**
- Real Quote business writes: **0**
- Runtime code changes in Q2B2C: **0**
- New migration in Q2B2C: **0**
