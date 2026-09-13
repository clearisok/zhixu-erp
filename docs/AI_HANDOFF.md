# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`1c5b8e1680ac5f49cda3df532cb7ae9509d73a0b`（Phase C3.1 PR #32 已 merged）

## Current Active Task

- Branch: `docs/order-list-cutover-acceptance`
- Baseline: `1c5b8e1680ac5f49cda3df532cb7ae9509d73a0b` (`origin/main`, PR #32 merge commit).
- C1 and C2 are complete. The fixed `zhixu-database / zhixu` has the canonical 54-permission catalog, `role-server-admin`, existing admin binding and `order.view`; real trusted admin API acceptance and Browser same-origin shadow acceptance both passed.
- C2.2 used the merged production-shaped Node static runtime at `http://127.0.0.1:3002/order-center/server-preview`. Anonymous/login-required, user-entered admin login, trusted identity, `order.view`, 511-row PostgreSQL list, hard-refresh session restore, orderNo/BillNo/style search, `draft`/`ainuoke` filters, pagination, normal detail, zero-color detail, logout and post-logout anonymous refresh all passed.
- Safe auth baseline successful/failed/sessions/active/revoked=`3/0/2/1/1`; post-acceptance=`5/0/4/2/2`. Two successful manual logins were recorded while locating the correct Browser surface; the tested Browser session was revoked by logout and the other new active session was not deleted or revoked. These are the only real writes in C2.2.
- SalesOrder aggregate/link/contract/color/log stayed `511/511/511/1348/511`; SalesOrder id/order/version/updated fingerprint and sequence `511/true` stayed unchanged. `app_users=2`, permissions=54 and admin `order.view` stayed intact; `ZHIXU_ADMIN_PASSWORD` was empty and startup caused no admin/RBAC changes.
- Ainuoke/Browser business/Quote/Style Progress/Scheduling/Closing writes were 0. The temporary 3002 server was stopped; database and legacy 3000 runtime stayed healthy.
- `BROWSER_TRUSTED_SESSION_READY=YES`, `REAL_BROWSER_SHADOW_ACCEPTANCE=PASS`, **C2=COMPLETE**.
- C3.1 PR #32 routes production `/order-center` to the dedicated PostgreSQL Server base list. It requires trusted Server session + `order.view`, never falls back to Browser orders, uses 50-row Server pagination/search/filter/allowlisted sorting, and preserves zero-color masters.
- C3.2 real acceptance passed on production-shaped `http://127.0.0.1:3002/order-center`: anonymous/login-required, user-entered admin login, trusted identity/public id, `order.view`, 511 PostgreSQL orders, hard-refresh restore, orderNo/BillNo/style search, `draft`/`ainuoke` filters, ASC/DESC server sorting, pagination, same-page normal and zero-color inspectors, logout and post-logout anonymous refresh all passed.
- Real visual acceptance passed at 1280×800 and 1600×900. The page had no document-level horizontal overflow; header/source/search/filter/sort/table/action/pagination remained usable, and both the drawer and zero-color empty state remained readable.
- PostgreSQL rows never entered `/order-center/detail` or any Browser save/edit/cancel/delete/reorder/attachment path. Browser OrderRepository, new/detail, manual create, Quote-to-order and reorder code remain retained, unmigrated and unmodified; Scheduling, Closing and Style Progress remain Browser-owned and unmigrated.
- Safe auth counts successful/failed/v1 sessions/active/revoked moved only from `5/0/4/2/2` to `6/0/5/2/3`. SalesOrder aggregate/link/contract/color/log stayed `511/511/511/1348/511`; fingerprint `321bf4319b30ce672302a49b9cf1a33c` and sequence `511/true` stayed unchanged. `app_users=2`, admin core, 54-permission RBAC and `order.view` stayed unchanged; all non-auth business writes were 0.
- The temporary 3002 server was stopped; the database and legacy 3000 runtime stayed healthy. `PRODUCTION_ORDER_LIST_POSTGRESQL_READY=YES`, `REAL_PRODUCTION_ORDER_LIST_ACCEPTANCE=PASS`, **C3=COMPLETE**. Next Gate is **C4 — Base Detail + Server Extensions**, but C4 is not authorized and has not started.

## Previous completed Phase 2B3B.1 task

- Branch: `feat/postgres-real-salesorder-bootstrap-runner`; merged by PR #23 as `9572162fa68c60674f8973472f779d7f16e394ec`.
- The compiled runner and its target/ledger/empty-state/sequence/actor/double-confirmation guards, fresh source plan, service-only serial create, same-array idempotency replay and read-only reconciliation remain unchanged by Phase 2B3B.2a.
- Final gates at merge: runner targeted 8/8, PostgreSQL integration 22/22, Bridge 36/36, Full Tests 601/601, typecheck, zero-warning lint, server build with compiled CLI, frontend Production Build 30 routes and `git diff --check` PASS.

## Previous completed Phase 2B3A.1 task

- Branch: `docs/postgres-schema-activation`; merged by PR #22 as `482d60dd085df0e66c824e1adbc6abbbd0c8beb8`.
- Migrations 0001/0002/0003 were applied once to fixed `zhixu-database / zhixu` PostgreSQL 16.14 and the second runner skipped all three. SalesOrder aggregate/link/mirror/log counts remained 0 and sequence remained `last_value=1, is_called=false`.
- Backup `D:\workspace\preparesystem\backups\zhixu-20260912-000250.dump` was verified non-empty with SHA-256 `4A6A11844E70943318760F1F8729E736656A1B5A8C97E9F04024FB87A335EF1C` and `pg_restore --list` PASS. Legacy digests were unchanged; RBAC catalog sync was not executed.

## Previous completed Phase 2B2.3 task

- Branch: `feat/postgres-salesorder-final-bootstrap-preview`
- Baseline: `8803a6b86e34f9daee7f38f6a798bd6fd9e3e5c9` (`origin/main`, Phase 2B2.2 PR #20 merge commit).
- Scope: Phase 2B2.3 implemented PostgreSQL-owned immutable `SO-00000001` numbering and performed the final fresh BillNo/6087105 Preview plus full disposable PG16 service validation. It did not execute the separately authorized real bootstrap or Browser cutover.
- Forward-only `0003_sales_order_number_sequence.sql` adds the global sequence and insert allocator. Official repository/service inputs cannot supply `order_no`; explicit SQL override and mutation are rejected. UUID remains the technical identity; sequence gaps on rollback are retained and never reused.
- Fresh Discovery before/after: 511 rows / 11 pages, 草拟 368 / 生效 143, identical hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`, BillNo blank/duplicate 0/0 and added/removed/changed identity 0/0/0.
- 6087105: 511/511 BillNo queries succeeded over 511 pages; exact orders 511, usable/missing/invalid 505/0/6, InsideOrderNo drift 8, usable color quantity parity equal/lower/higher 505/0/0.
- Every Discovery contract formed a candidate. Usable candidates carry full color mirrors; missing/invalid candidates carry `colors=[]` plus sanitized reconciliation metadata. SizeRule/Size1..26/SizeNum remain typed evidence only; no size relational table was added.
- Disposable PG16 applied 0001/0002/0003 and created 511/511 via `createAinuokeSalesOrder`; rejected/source conflicts/schema rejections 0/0/0, exact idempotent returns 511, trusted OperationLogs 511, rollback probes 1. Order numbers were `SO-00000001`…`SO-00000511`, UUID/order-number duplicates 0/0, override/mutation rejected, rollback number not reused. Container/database were destroyed.
- Authoritative Ainuoke reads: 533 pages (`6086103` 22, `6087105` 511, `6086997`/`6087050` 0). Ainuoke, real PostgreSQL, Browser, Quote, Style Progress, Scheduling and Closing writes: 0.
- Final gates: Bridge 36/36, targeted 23/23, PostgreSQL integration 14/14, Full Tests 601/601, typecheck, zero-warning lint, server build, frontend Production Build 30 routes and `git diff --check` PASS.
- Fresh Preview evidence is ready for a separately authorized real bootstrap. No real bootstrap, Browser read/write cutover, legacy 6086997 deletion or automatic merge is authorized by this phase.

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
