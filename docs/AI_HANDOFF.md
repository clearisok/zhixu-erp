# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`07e57b0eacecb20668e7de8f0c8592e0bfc612b0`（Phase 2B2.1 PR #19 已 merged）

## Current Active Task

- Branch: `fix/ainuoke-sales-contract-stable-identity`
- Baseline: `07e57b0eacecb20668e7de8f0c8592e0bfc612b0` (`origin/main`, Phase 2B2.1 PR #19 merge commit).
- Scope: Phase 2B2.2 changes the stable Ainuoke SalesOrder cross-report association to normalized `SalesContractNo` / `BillNo`. `InsideOrderNo` is mutable source data; same BillNo drift records `inside_order_no_drift` and cannot create/change/rebind a SalesOrder.
- Typed Bridge query kinds are `empty | sales_contract | inside_order`. 6087105 uses fixed `{ salesContractNo }` → `BillNo contains` and exact normalized row.BillNo filter. Query kinds cannot mix, and Browser cannot submit raw report controls.
- D-079 is Active by explicit user approval: 6087105 formally replaces 6086997 as current SalesOrder color/size source. 6086997 stays legacy/historical in catalog/adapter/tests. 6087105 missing/invalid remains non-blocking enrichment.
- Discovery remains full empty-query 6086103 and now requires non-empty unique normalized BillNo. The formal bootstrap path builds a local BillNo index and does not need per-order 6086103 InsideOrderNo detail reads.
- Authoritative read-only validation: Discovery before/after 511/11 pages, 草拟 368 / 生效 143, identical hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`, added/removed/changed 0/0/0. 6087105 BillNo queries 511/511 success, exact/no-detail 511/0, exact rows 1,390, contains false positives 0.
- Colors: usable/missing/invalid 505/0/6; all 505 usable totals equal contract quantity, lower/higher 0/0. Drift orders 8. All former eight missing are resolved.
- PI2512-121 anchor: 6086103 InsideOrderNo `5384/086-1(46021-N)`; 6087105 InsideOrderNo `5466/086(46021-N)`; one usable color, quantity 9,000 = contract quantity; PASS.
- Query audit: 6086103 Discovery empty; 6087105 BillNo contains; 6086997 InsideOrderNo is; 6087050 insideorderno is. BillNo support was not guessed for legacy reports and 6087050 was not business-read.
- Authoritative reads 533 pages (6086103 22, 6087105 511); all Ainuoke/PG/Browser/Quote/Style Progress/Scheduling/Closing writes 0. No PG schema change. Next allowed step is fresh Bootstrap Preview; real bootstrap and Browser cutover remain forbidden.
- Final gates: Bridge 36/36, targeted 21/21, Full Tests 598/598, typecheck, zero-warning lint, server build, frontend Production Build 30 routes and diff-check PASS. PostgreSQL integration and Style benchmark were intentionally not rerun.

## Previous completed Phase 2B2.1 task

- Branch: `feat/ainuoke-6087105-color-source-validation`
- Baseline: `9556cc9be9ee375b53121e9f30d67a68171356e6`（Phase 2B2 PR #18 merge commit）
- Scope: Phase 2B2.1 validates fixed report 6087105 (成衣分色分码明细) as a candidate SalesOrder color/size source. It does not switch/delete 6086997, run real bootstrap, write PostgreSQL/Browser/Ainuoke, read 6087050, or touch Quote/Style Progress/Scheduling/Closing mutations.
- Historical Phase 2B2.1 state (superseded by Phase 2B2.2): fixed key 6087105 then used `insideorderno contains`; it now uses BillNo as recorded above.
- Independent adapter performs NFKC/case/whitespace exact post-filter, uses canonical whole sanitized-row SHA-256 rather than upstream `id`, preserves zero-quantity colors, maps ordered SizeRule→Size1…26 without guessing, and makes critical color anomalies invalidate the whole enrichment slice without invalidating SalesOrder existence.
- Authoritative live run: Discovery before/after 511/11 pages, `草拟=368`/`生效=143`, stable hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`; 511/511 6087105 queries succeeded over 511 pages. Exact orders/no detail=503/8, exact rows=1,378, contains false positives excluded=174.
- Usable colors: 497 orders; all 497 have color total equal contract quantity. Invalid: 6 orders (15 invalid SizeNum, 6 blank colors, 3 duplicate canonical placeholder identities); duplicate usable identity/cross-order contamination/BillNo/InsideOrderNo/GoodsNo mismatch all 0. SizeRule present/missing=1,372/6, patterns=41, tokens 1…25; positive matrix valid/mismatch/missing=1,361/0/0; zero rows without SizeN=2 legal.
- Old Phase 2B2 34 blockers retain their historical record. Under 6087105 they are 31 resolved, 0 missing, 3 invalid, 0 quantity-warning-only. D1935/T1826-4/1917U anchors are 5/4,640, 3/3,730 and 2/9,393 PASS.
- Formal policies are now confirmed and documented in D-078: server-generated global `SO-00000001` sequence, `current_account_visible` fresh scope, missing source retention without delete/cancel/rebind, and normalized mirror/hash/time/reconciliation retention without full raw payload by default. Schema implementation remains later.
- Historical Phase 2B2.1 state (superseded): replacement was then only recommended. D-079 is now Active and the next step is a fresh Preview; real bootstrap still needs separate authorization.
- Authoritative run used 533 successful pages; two safe classification-only reruns used 1,044, for Phase 2B2.1 total 1,577. 6086997/6087050 reads and all business writes were 0. Final gates: Bridge 36/36, relevant Ainuoke 40/40, Full Tests 595/595, typecheck, zero-warning lint, server build, frontend Production Build 30 routes and `git diff --check` PASS. PR closure is pending in this working tree; Style Progress benchmark and PostgreSQL integration were intentionally not rerun because neither domain changed.

### Previous completed PR #14 context

- Phase 2A established the field-level ownership matrix and combined-model direction. Its Browser A/B/C classifier remains historical analysis but is superseded for the current Browser Order/Scheduling migration strategy.
- Current Browser IDs are internally referenced, but the test dataset does not impose identity continuity on newly bootstrapped formal PostgreSQL orders. New formal PostgreSQL SalesOrder IDs must remain stable from creation onward.

### Previous completed PR #13 context

- Checkpoint A：commit `d69649149b4898eaaeaace000604b4bc538c20f6` 已实现独立 Node/TypeScript server、PostgreSQL pool、`/api/v1/health`、forward-only migration runner 与 `schema_migrations` ledger；runner 使用 advisory lock、逐文件事务和 SHA-256 checksum fail-closed。
- Checkpoint B：已实现 `app_users` 单一身份源的 immutable UUID、digest-only V1 session、brute-force/expiry/revocation、共享 `PermissionKey` PostgreSQL RBAC、append-only server OperationLog、DEV proxy、Node static + API Docker profile 和完整文档。PostgreSQL integration 只使用一次性 PG16 tmpfs 容器；没有创建 SalesOrder/Quote/Scheduling/Closing/Style Progress/Ainuoke/附件业务表，也未迁移或双写 browser data。
- Checkpoint B 最终门禁：Full Tests 565/565、PostgreSQL integration 9/9、typecheck、lint、server build、Production Build 30 routes、Compose config、production container health/static/cookie/session digest/trusted identity、secret scan 与 diff-check 全部 PASS；一次性容器均已清理。

### Previous completed PR #12 context

- Previous branch: `feat/ainuoke-unified-sync`
- Previous scope: Gate 4 把 6086103、6086997、6087050 合并为一次“刷新艾诺科”、一个统一 Preview 与必要时一次确认；不做后台同步、自动 commit 或任何 Ainuoke write API。
- Checkpoint 1：`runAinuokeUnifiedPreview` 并行读取三个固定 Catalog report，分别复用既有 Contract/Material Preview；统一层只聚合 change summary、权限、stale guard、提交顺序和结果，不复制 Matcher、Normalize/Dedup、Canonical、Expected Arrival、Repository 或 OperationLog。
- Unified change state 为 `no_change | changed | blocked`。合同与物料均 no-change 时不显示/调用 Confirm；任一侧 blocking 时整个 Confirm disabled。合同写仍要求 `ainuoke.sync`，物料写仍要求 `style_progress.import`，只缺一项时明确指出对应领域。
- 提交顺序固定为 Contract → Material。当前 browser-local Repository 没有跨领域 ACID；第一段成功、第二段失败时返回 partial failure，不显示全部成功，也不伪造 rollback。重新刷新后已成功领域变为 no-change，只重试失败领域，既有领域幂等与日志规则继续生效。
- Unified Preview 同时绑定三报表 source identity 与当前相关 Repository baseline；Preview 对象或本地业务状态变化都会在任何写入前 fail stale guard。
- Checkpoint 1 自动化已覆盖统一读取、no-change、contract-only/material-only/both-changed、两侧 blocking、权限组合、partial failure、安全重试、stale guard 与不建立第三 pipeline。
- Checkpoint 2 已接入唯一“刷新艾诺科”主动作、统一 change summary、按领域权限提示和唯一确认 Modal。alternate/isolated Browser Profile 的首次 D1935 Preview 因尚无合同 mirror/import run 而显示 contract auto-create 1 + material changed；用户本人确认后两侧均 `success`，mirror/import run/order 从 `0/0/168` 变为 `1/1/169`。第二次只读刷新两侧均 no-change，不显示确认按钮；这仍是有效的 live commit/idempotency 证据，但不是 Gate 3C 原真实 DEV dataset。
- PR #12 merge 前已回到 Gate 3C 同一 Chrome Profile：D1935 仍为 12 Canonical（2 fabric + 10 trim），SalesOrders 464、Mirror contracts 487、ImportRuns 4。只执行一次“刷新艾诺科”后 Contract=`changed`（quantity/color change 1/1、would update 1），Material=`no_change`，确认按钮出现；未打开确认 Modal、未执行 commit。不能把这次记录为双侧 no-change PASS，后续若处理该合同变化仍须用户重新明确授权。
- 本 Gate 没有 Ainuoke write API、后台同步或自动 commit。Scheduling/Closing 未进入统一编排依赖；当前 browser-local mock identity 与无跨领域 ACID 的安全限制不变。
- 最终自动门禁：定向 44/44、Full Tests 565/565、typecheck、lint、30-route build 与 diff-check PASS。Bridge 未修改，未重复 Python Bridge tests。

## Latest Merged Work

- PR #11 已 merged；6087050 Material API commit、authoritative replacement、Projection 排序与真实 D1935 acceptance 已进入 main。PR #10 的 Material Preview、PR #9 的历史 Review cleanup 与 PR #8 的 Contract API Gate 2 继续是稳定事实。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
