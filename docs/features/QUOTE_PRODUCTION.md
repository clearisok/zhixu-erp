# Quote Production

## Purpose

本文记录用户已确认的 **Quote-first Route B** 正式生产方向。目标是在不等待整个 ERP 完成 Server migration 的前提下，先把 Quote Center 及其必要依赖推进到可信 Server/PostgreSQL 生产形态，再让 Order、Scheduling、Closing 分别通过自己的 migration 与 production acceptance Gate 后逐步启用。

这是架构和 rollout 决策，不是实现完成声明。本文不授权 migration、真实数据写入、部署、Browser 数据修改或 C4.2 activation。

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

这些是生产启用目标条件。Q1 分支已实现下述 Quote Server/PostgreSQL foundation；Quote Server API、Server attachment pipeline 和 Quote production deployment 仍未实现，也未购买或冻结任何服务器方案。

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
- Q0 于 2026-09-14 完成 read-only audit（8 Quotes / 9 Revisions / 12 PriceVersions）；未发现 Quote aggregate corruption blocker。Q1 不读取或提交真实 backup。下一阶段是需独立授权的 **Q2 Quote Server API + trusted writer + single-login cutover**，尚未实施。

## Follow-up Documentation Sync

PR #38 最初因并行 C4.2 工作与相关文档存在重叠，暂缓了部分同步。Q1 与 C4.2 compatibility validation 此后已按真实工程事实完成 reconciliation；该文档同步不代表 migration 0004/0005 activation。后续 Q2 开始前仍须以届时实际代码和文档复核 single-login production rule 与 Quote-first rollout boundary：

- `docs/DECISION_LOG.md`；
- `docs/features/PERMISSIONS.md`；
- `docs/features/SERVER_PERSISTENCE.md`。

该 follow-up 是对 **USER CONFIRMED** 决策的必要同步，不是可选 AI 建议。Q2 reconciliation 必须以届时代码和 docs 为准，不得把 Q1 或 C4.2 implementation 误写成 real activation。
