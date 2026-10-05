# Quote Production

## Purpose

本文记录用户已确认的 **Quote-first Route B** 正式生产方向。目标是在不等待整个 ERP 完成 Server migration 的前提下，先把 Quote Center 及其必要依赖推进到可信 Server/PostgreSQL 生产形态，再让 Order、Scheduling、Closing 分别通过自己的 migration 与 production acceptance Gate 后逐步启用。

这是架构和 rollout 决策，不是实现完成声明。本文不授权 migration、真实数据写入、部署、Browser 数据修改或 C4.2 activation。

## Q4A Server Attachment Foundation — 2026-10-05

Q4A 新增 `0008_quote_attachments.sql`、Server metadata/Revision relationship、provider-neutral binary storage interface、trusted API/OperationLog 与 disposable PostgreSQL/fake-storage 测试。Revision 关系为 Server 权威；Quote Revision 原三个附件 ID 字段是同事务兼容镜像，通用 Quote PUT 不得直接改写；新 Revision 继承关系但不复制 binary。Production adapter 未选/未配置，未执行真实 0008、真实部署、Browser 附件迁移、Quote writer cutover 或 Q5。Q3 master/settings 已完成真实 Server authority cutover；下方早期 Q3A/Q3B1 的“未真实执行”是其**历史 Gate 当时状态**，不是当前 Q3 状态。

## Q3A Server master/settings foundation — 2026-09-21

- `0007_quote_master_settings.sql` adds Server-owned Brand, CustomerSalesperson, Fabric/Trim library, scoped DefaultTrimConfig, global Quote settings and manufacturing preset tables without adding historical Quote FKs or a Supplier table. Runtime IDs are Server UUIDs; future controlled import can preserve legacy TEXT identities.
- Typed `/api/v1/quote-masters/*` and `/api/v1/quote-settings/*` routes use trusted session RBAC, bounded validation, decimal strings, optimistic version and same-transaction OperationLog. Fabric/Trim duplicate names remain valid; normalized Brand/Salesperson names are unique.
- D-089 owns one nullable `DefaultOtherCost` per System/Brand/Salesperson scope and preserves Quote 0..N OtherCostLine snapshots. Server DefaultTrimConfig intentionally has no Browser compatibility quantity/usage. Default resolution preserves null/zero, Salesperson > Brand > System, and whole-set salesperson trims without merging Brand rows.
- At the Q3A checkpoint this was disposable-foundation only. Q3B2I-C2 later applied real 0007, imported master/settings and switched their formal UI to Server authority. Quote aggregate, its Browser data and attachments remain Browser-owned; Q4B/Q5 and separate Quote cutover gates remain.

## Q3B1 existing settings UI Server candidate — 2026-09-21

- Five isolated Server routes reuse `BrandSettingsPage`, `CustomerSalespeopleSettingsPage`, `FabricLibraryPage`, `TrimLibraryPage`, and `GlobalQuoteSettingsPage` through bounded controllers. They use trusted Server identity/RBAC, exact decimal projection, optimistic versions, Server UUIDs and fail-closed auth/network states; production Browser settings and Quote routes are unchanged.
- Global settings and manufacturing presets now have one domain-specific atomic bundle mutation with trusted same-transaction audit. Candidate removal is explicit preset status change, not hard delete. DefaultTrim compatibility quantity is projected into UI only as `null` and is never sent to Server; suppliers remain free text backed by authorized suggestions.
- D-090 makes active status a Server-enforced default-reference invariant. Standalone or bundled deactivation of the current default clears the relation atomically; inactive assignment is rejected, re-enable does not restore it, and resolved/new-Quote defaults fail safe while all existing Quote snapshots stay unchanged.
- At the Q3B1 checkpoint, a deterministic read-only migration preview helper existed; inactive default references projected to `null` with a warning, while missing references remained blockers. Q3B2B subsequently read one authorized real Browser backup without modifying it, Q3B2C completed disposable import rehearsal, and Q3B2D documented its then-unexecuted activation plan. Later Q3B2I-C2 completed real 0007, master/settings import and Server settings cutover; Quote aggregate migration and production Quote cutover have **not** occurred.

## Q2B2B Server creation and numbering foundation

- D-088 is user-confirmed: runtime Server Quote IDs and business numbers are Server-only. `quoteCode` uses `QT-YYYY-MMDD-NNN`, Server `Asia/Shanghai` date and one global non-resetting BIGINT sequence; minimum width is 3, values above 999 expand, rollback gaps are allowed and never reclaimed. The code is immutable and exact-unique.
- `0006_quote_number_sequence.sql` adds the isolated `quote_center_quote_number_seq`, max-valid-suffix calibration, unique constraint and DB immutability trigger. The distinct sequence name is required because legacy root ERP already owns an unrelated `quote_number_seq`.
- Runtime `POST /api/v1/quotes` accepts `{}` only. Trusted `quote.create` creates a Server UUID aggregate with one UUID Revision/PriceVersion, neutral structural defaults, trusted `createdBy`, Server time and one transactional OperationLog. It does not read Browser masters/settings or create attachment, ConfirmedCommercialTerms or SalesOrder data.
- `/quote-center/server-new` is an isolated lazy-create workspace: page open writes nothing; only an explicit click creates and redirects to Server edit. Production `/quote-center/new` remains Browser/local. Real 0004/0005/0006, Quote import and production writer cutover are not executed.

Before Q5 import, source IDs/codes must be preserved exactly, duplicate legacy `quoteCode` must fail closed, and the Server sequence must be calibrated after import. Historical aggregates use the internal Q1 import boundary, never the runtime allocator. Q3 master/settings and Q4 attachments remain separate prerequisites.

## Confirmed Direction

以下方向均为 **USER CONFIRMED**，不是 AI 建议：

- Quote Center 是第一批正式生产业务模块；Quote production 不等待 Order、Scheduling、Closing 全部迁移完成。
- Production Phase 1 的目标范围是 trusted Server authentication、Quote Center、Quote 必需的 master data、Quote attachments 与 backup/restore。
- Order Center、Scheduling、Closing 保留在代码库中，不删除；在各自完成 Server migration 和真实 production acceptance Gate 前，通过后续 production feature gating 和 Server RBAC 保持不可用或明确标识为非生产。
- 正式生产只有一个面向用户的织序登录入口。一个 trusted Server Session 是所有正式业务模块唯一可信的 authentication identity；Quote、Order、Scheduling、Closing 在获准启用后共享该 session，并分别受 Server RBAC 控制。

## Production v1 Boundary

Quote Production v1 在启用前至少需要以下能力达到 production-grade，并分别有可复验的 migration、rollback 与 acceptance evidence：

- 单一入口的 trusted Server authentication、session lifecycle 与 Server RBAC；
- Quote、QuoteRevision、PriceVersion、EstimateCost 及实际 Quote 业务事实的 Server/PostgreSQL persistence 和 typed API；
- Quote 所需 master data 的明确所有权、迁移与权限边界；
- PostgreSQL attachment metadata/relationship 与 Object Storage binary pipeline；
- 数据 migration preview、reconciliation、执行、幂等复核和 rollback window；
- PostgreSQL 与 Object Storage 协同的 backup/restore、完整性校验和恢复演练；
- Quote production Browser acceptance、安全验证与运营交接。

这些是生产启用目标条件。Q1 已实现下述 Quote Server/PostgreSQL foundation，Q2A 已实现 trusted typed API 与 aggregate writer，Q2B1/Q2B2A/Q2B2B 已实现隔离的 Server read、existing-Quote edit 与 Server lazy-create/numbering workspace；这些只通过 disposable PostgreSQL 验证。Production Browser writer/single-login cutover、Server attachment pipeline、真实 migration 与 Quote production deployment 仍未实现，也未购买或冻结任何服务器方案。

## Authentication Target

### Final production UX — USER CONFIRMED

正式流程是：

`打开织序 → 登录一次 → 建立一个 trusted Server Session → 按 Server RBAC 使用已启用业务模块`

Browser-local permission identity 不能作为正式业务写入的认证依据。Browser-local storage 仍可保存列宽、筛选、折叠状态和临时 cache 等非权威 UI preferences。

### Current migration/testing UX

当前 Browser mock permission identity、页面内独立“Server Login”、业务页二次登录和永久显示的 `Server identity: admin` diagnostic strip 都只是 migration/testing compatibility mechanisms，不是最终生产 UX。后续 Q0 和实现 Gate 必须审计并规划其收敛，不得把它们固化成双登录产品设计。

## Quote Data Migration

以下 Browser Quote 数据是必须保护的真实 production migration assets：

- Quote；
- QuoteRevision；
- PriceVersion；
- EstimateCost；
- 其他经审计确认的实际 Quote 业务事实。

用户已明确决定：当前 Browser IndexedDB Quote attachment blobs **不作为 Quote Production Server migration source**，现有 attachment references 也不作为迁移后的正式关系。未来 migration projection 可以显式、可审计地将迁移后的 QuoteRevision 转换为：

```text
imageAttachmentIds = []
fileAttachmentIds = []
styleImageAttachmentId = null
```

这不是把旧附件认定为损坏、测试数据或可立即删除；它是用户确认的 migration exclusion。Migration preview 必须报告将被清空的引用数量和受影响 Quote/Revision 数量。当前 Browser Quote 数据、引用和 IndexedDB blobs 在 migration development、production acceptance 与 rollback window 内都保持原状。

## Attachment Production Architecture

新的 Server Quote attachments 在 cutover 后从空的正式 Server attachment domain 开始，目标架构是：

- PostgreSQL：attachment metadata 与业务关系；
- Object Storage：图片和文件 binary content。

持久 metadata 概念应包括稳定 attachment UUID、原始文件名、MIME type、size、content hash、kind、storage provider/bucket/key、createdBy、createdAt，以及需要时的 lifecycle/status。具体 SQL schema、Object Storage provider 与 API 尚未冻结，必须由后续独立 Gate 设计和验证。

数据库保存稳定 storage identity/key，不保存特定 VPS 的 absolute filesystem path。推荐使用与业务名称解耦的 key，例如：

```text
attachments/<attachment-uuid>/original
```

VPS local filesystem 与 IndexedDB 可以继续作为 development adapter，但不得成为 production attachment source of truth。PostgreSQL large binary 也不是常规附件架构。

## VPS Portability

Quote Production v1 可以先部署在低成本 VPS，但应用架构不得绑定该 VPS、特定云厂商、固定月费、CPU/RAM、域名或绝对路径。未来替换 VPS 的主要流程应是：

1. 部署同一兼容应用版本；
2. 恢复或迁移 PostgreSQL；
3. 继续复用同一 Object Storage；
4. 重新配置 secrets 与环境配置；
5. 完成数据、权限、附件和业务 acceptance；
6. 执行 DNS cutover。

只要 Object Storage 保持不变，VPS replacement 不应要求搬迁 attachment blobs。

## Rollback Safety

- 初次 migration/cutover 不删除或改写旧 Browser Quote 数据。
- 当前 IndexedDB attachment blobs 与 QuoteRevision attachment references 至少保留至明确结束的 rollback window。
- Server migration failure 不得用 Browser Reset、换 storage key、silent Seed 或删除 IndexedDB database 处理。
- 旧 Browser blobs 的任何删除都属于后续独立 destructive-data decision，需要精确范围、backup/recovery evidence 和用户明确授权。

## Progressive Module Rollout

1. Quote production：完成自身 Server migration、attachments、backup/restore 和 production acceptance 后启用。
2. Order Center：独立完成 Server domain/migration、reconciliation 和 acceptance 后启用。
3. Scheduling：独立完成 Server ownership/migration 和 acceptance 后启用。
4. Closing：独立完成 Server financial snapshot/migration 和 acceptance 后启用。

阶段顺序不构成自动授权。每个模块都必须由 production feature gate + Server RBAC 控制，并通过自己的真实 acceptance；未完成模块继续保留但不冒充 production-ready。

## Q1 Server/PostgreSQL foundation — 2026-09-20

Q1 implements an internal persistence foundation, validated only with disposable PostgreSQL and now merged on main. It is not production-activated. Browser Quote Center still uses `mockQuoteRepository` and `zhixu.erp.local.quotes`; no Q1 aggregate API, trusted-writer cutover, real import or startup against real `zhixu` is included.

- Migration `0005_quote_foundation.sql` creates `quote_center_quotes`, `quote_center_revisions`, `quote_center_price_versions`, `quote_center_estimates`, `quote_center_cost_snapshots`, `quote_center_fabric_lines`, `quote_center_trim_lines`, and `quote_center_other_cost_lines`. The legacy `quotes` table is untouched.
- Quote identity is existing TEXT `Quote.id`; Revision and PriceVersion keys retain their original IDs within the owning aggregate/revision. Cost-row keys are scoped to a deterministic cost-snapshot owner tuple. New revisions legitimately reuse PriceVersion/cost IDs. Positions preserve array ordering.
- Entity metadata JSONB retains the complete remaining formal snapshot fields (including baseInfo, names, branch/creation metadata, legacy compatibility, confirmation summary, attachment references and optional fields). It is not a duplicate whole-aggregate JSON store. Decimal business values occupy NUMERIC columns: quantity, pricing rates/freight, labor, confirmation amounts and every cost-row decimal.
- Server DTOs derive structurally from the current Quote model with decimal values represented as strings. The pure `quoteSnapshotFromBrowser` projection uses existing finite number values without recalculating or rounding; reads explicitly cast NUMERIC to text, even if a global driver numeric parser is overridden. Canonical strings remove insignificant zeroes, not business precision. Null remains null and explicit zero remains zero. Browser calculator types and display/rounding rules are unchanged.
- Master IDs are provenance without live Brand/CustomerSalesperson/material/preset FKs. Dangling references, duplicate material names, empty country/preset and historical confirmation amounts remain readable without master resolution or recomputation. Quote code is preserved without a newly invented unique/case-normalization constraint.
- `createQuoteService` exposes internal create/read/list/save-aggregate operations. Create and save are single transactions; aggregate row locking plus expected version prevents silent last-write-wins. Read assembly runs in a repeatable-read read-only transaction. List is bounded metadata pagination, not the future production search API.
- Existing historical Revision content/order cannot change or disappear, and historical revisions cannot become writable. A new default may append while freezing the prior default unchanged. Current revision persistence replaces its cost slice atomically; unchanged historical children remain in place. Q2 still owns production workflow authorization and API validation.
- Estimate current/history is a first-class Quote-owned snapshot. Prior histories are immutable; replacing active requires archiving it unchanged. Editing the same active estimate preserves provenance and cost-row identity/order. Source PriceVersion ID remains provenance, not a live FK to a mutable PriceVersion collection. Staleness and ignored-for-revision fields are preserved without recomputation.
- Attachment ID/legacy URL references round-trip structurally; binary data URLs are rejected. No attachment metadata/blob tables, Object Storage, upload API or binary migration are included. Future authorized migration projection can explicitly clear references to `[] / [] / null`; Q1 does not clear them.
- Q1 does not import Browser OperationLogs or treat `createdBy/generatedBy` strings as trusted actors. The internal persistence service is not exposed to users; trusted aggregate authorization and transaction OperationLog integration are explicitly Q2 prerequisites. Q1 itself creates no current shared ConfirmedCommercialTerms writer. C4.2 implements that separate current domain without mutating Q1 snapshots, using the exact Quote/Revision/PriceVersion identities as provenance.
- Synthetic disposable tests cover processing/distribution, incomplete drafts, multiple revisions/PVs, CNY/USD, null/zero, precision, dangling masters, duplicate names, no preset, confirmation snapshots, Estimate history, immutable boundaries, concurrent conflict, rollback and untouched SalesOrder/log/sequence state.

Post-M0 Q1 validation: targeted migration-safety + Quote PostgreSQL 19/19; complete PostgreSQL 52/52; full tests 624/624; typecheck, lint, server build, frontend production build (32 routes) and `git diff --check` PASS. The actual 0005 test proves a 0001-0003 database reports 0005 pending, creates zero `quote_center_*` tables, and stops before permission sync/bootstrap/listen; explicit disposable apply then creates all eight tables and startup verification passes without 0004. Post-C4.2 integration, historical bootstrap/RBAC success rehearsals use their reviewed 0001-0004 contract and deliberately reject the expanded 0001-0005 repository set. No real database was connected or migrated.

## Q2A trusted Server API foundation — 2026-09-20

- Q2A wraps, rather than duplicates, the Q1 model/repository. It exposes bounded deterministic metadata list, full aggregate read, create, and honest full-replacement PUT with `expectedVersion`; DTO decimals remain strings and reads do not recalculate snapshots or resolve dangling masters.
- Trusted Server session permissions protect every endpoint. Aggregate save always requires `quote.edit` and applies the existing finer permissions to changed cost, settings, Revision, PriceVersion, confirmation and Estimate slices. DELETE is intentionally absent.
- The Q1 write transaction accepts a narrowly scoped post-write hook. Q2A uses it to append one existing PostgreSQL Quote OperationLog with trusted actor and bounded before/after/version context before commit. Audit failure rolls back the aggregate; rejected, stale and no-op writes produce no log.
- C4.2 current `ConfirmedCommercialTerms` remains separate: aggregate save neither reads current terms into PriceVersion snapshots nor writes current terms from them. Binary attachment payloads remain rejected and no attachment/master ownership was added.
- A same-origin credentialed/no-store typed client and repository adapter exist for Q2B, but current Quote list/editor remain wired to `mockQuoteRepository`/localStorage. Q2A does not activate single-login UI, real 0004/0005, real Quote import or production writes.
- Final Q2A validation passed: targeted 13/13, disposable PostgreSQL 73/73, Server auth frontend 7/7, full tests 631/631, typecheck, lint, server build, frontend production build (32 routes), and `git diff --check`.

## Q2B1 Server shadow read and identity convergence — 2026-09-21

- Isolated `/quote-center/server-preview` and `/quote-center/server-detail?id=<quoteId>` routes use only the Q2A typed `quoteServerRepository` list/detail reads. They never initialize or fall back to the Browser Quote repository and expose no Quote create/save/delete action.
- Both routes require trusted Server Session + `quote.view`. Their AppShell server identity mode displays only the Server user, hides the Browser test-user selector and Browser permission-dependent settings/global-search controls, and keeps 401 invalidation plus explicit 403/404/unavailable states.
- Detail renders stored aggregate identity, default/current and historical Revisions, PriceVersions, cost/labor/pricing snapshots, Estimate current/history and historical confirmation snapshots. Decimal DTO strings remain strings, `null` remains visibly distinct from `"0"`, and historical facts are not recomputed.
- Server attachment references receive a neutral migration-boundary indication; Q2B1 does not query Browser IndexedDB or implement attachment binary migration. The exact shadow routes skip `LocalDataBootstrap`.
- Production `/quote-center`, `/quote-center/detail` and `/quote-center/new` remain Browser/local and continue using `mockQuoteRepository`; Browser writer and global single-login production cutover are not complete. Real 0004/0005, real Quote import and real Quote business writes remain NOT EXECUTED. Q2B2 is the next separately gated writer phase.
- Final Q2B1 validation passed: shadow contract 7/7, Server auth/read frontend 10/10, disposable PostgreSQL 73/73, full tests 638/638, typecheck, lint, server build, frontend production build (34 routes), and `git diff --check`.

## Q2B2A isolated Server writer workspace — 2026-09-21

- `/quote-center/server-edit?id=<quoteId>` edits only an existing Server Quote's default/current Revision and saves only through the typed Q2A GET/PUT boundary. It retains aggregate `expectedVersion`, replaces the local baseline/version only with the Server response, and treats 409 as an explicit conflict with no automatic retry, merge or overwrite.
- The writer's editable Browser-number projection is admitted only when every non-null Server decimal string round-trips through `quoteSnapshotFromBrowser` to the exact canonical decimal. There is no epsilon or invented rounding. `null` and explicit zero remain distinct; any unsafe high-precision value makes the aggregate non-editable and prevents PUT.
- AppShell remains in Server identity mode. A scoped permission authority makes foundation Buttons/Guards use `ServerSession.hasPermission`; Browser mock roles cannot grant Server edit. Server still enforces `quote.view`, `quote.edit` and operation-specific permissions, immutable history, transaction and trusted OperationLog actor.
- The workspace never reads or writes `mockQuoteRepository`, Browser OperationLog, IndexedDB attachments, Browser Basic Settings or OrderRepository. Attachments, master switching/quick-create, delete, export, Quote-to-Order, new Quote, Revision/Estimate/PriceVersion destructive actions and confirmation mutation are disabled. Existing attachment IDs and C4.2 current terms remain untouched.
- `LocalDataBootstrap` skips the exact server-edit route. Production `/quote-center`, `/quote-center/detail` and `/quote-center/new` remain Browser/local. Server new-Quote UI is not implemented because its multi-user numbering/creation authority remains a Q2B2B blocker. Real 0004/0005, real Quote import, real Quote business writes and production writer activation remain NOT EXECUTED.
- Final Q2B2A validation passed: writer contract 8/8, Server auth/frontend 13/13, disposable PostgreSQL 73/73, full tests 646/646, typecheck, zero-warning lint, server build, frontend production build (35 routes), and `git diff --check`.

### Migration numbering and C4.2 compatibility

`0004_confirmed_commercial_terms.sql` owns the separate shared-current terms domain; `0005_quote_foundation.sql` owns the Quote aggregate foundation and has no dependency on 0004 tables/functions. The runner discovers/sorts numeric versions and explicitly applies every version absent from the ledger; it does not demand a contiguous prefix or reject a lower pending version. Both actual orders `0001/2/3 → 0004 → 0005` and `0001/2/3 → 0005 → 0004` are validated on disposable databases.

A deployment must always include every already-applied migration file with its original checksum. The integrated code tree contains both independent migrations regardless of prior application order. Neither Q1 nor C4.2 weakens checksum/missing-file guards or authorizes any real migration. After merged M0, normal `server/index.ts` startup verifies migration state read-only and fails closed on pending 0004, pending 0005, or both; only separately authorized `npm run db:migrate` may activate schema.

## Pre-Q1 Engineering Status (historical)

- Authoritative main：`20d334d5043749250fae468e15bf47d1e281efe2`。
- C4.1 PostgreSQL Base Detail Read Cutover：**COMPLETE on merged main**。
- C4.2 `ConfirmedCommercialTerms` implementation：当时尚在独立开发中；现已完成并通过 post-M0/post-Q1 disposable integration validation。真实 migration activation 与 Browser write acceptance 仍未执行。
- Real `zhixu` migration 0004 activation：**NOT AUTHORIZED / NOT EXECUTED**。
- C4.2 real Browser acceptance：**NOT EXECUTED**。
- Quote PostgreSQL foundation：**IMPLEMENTED / MERGED, NOT PRODUCTION-ACTIVATED**。Quote aggregate API/writer cutover、Server attachment architecture、Quote data migration 与 Quote production deployment：**NOT IMPLEMENTED / NOT READY**。
- Q0 于 2026-09-14 完成 read-only audit（8 Quotes / 9 Revisions / 12 PriceVersions）；未发现 Quote aggregate corruption blocker。Q1/Q2A/Q2B1/Q2B2A 不读取或提交真实 backup。下一阶段是 **Q2B2B production-writer preparation**，先解决 Server new-Quote creation/numbering 与剩余 cutover blockers；production Browser writer/global single-login cutover 尚未实施。

## Follow-up Documentation Sync

PR #38 最初因并行 C4.2 工作与相关文档存在重叠，暂缓了部分同步。Q1 与 C4.2 compatibility validation 此后已按真实工程事实完成 reconciliation；该文档同步不代表 migration 0004/0005 activation。后续 Q2 开始前仍须以届时实际代码和文档复核 single-login production rule 与 Quote-first rollout boundary：

- `docs/DECISION_LOG.md`；
- `docs/features/PERMISSIONS.md`；
- `docs/features/SERVER_PERSISTENCE.md`。

该 follow-up 是对 **USER CONFIRMED** 决策的必要同步，不是可选 AI 建议。Q2 reconciliation 必须以届时代码和 docs 为准，不得把 Q1 或 C4.2 implementation 误写成 real activation。
