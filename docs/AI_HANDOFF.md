# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`13620491cf56605cadf57c90c6cdf389f0919297`（PR #13 PostgreSQL Server Foundation 与 PR #14 SalesOrder Persistence Ownership Audit 已 merged）

## Current Active Task

- Branch: `chore/ainuoke-order-discovery`
- Baseline: `13620491cf56605cadf57c90c6cdf389f0919297`
- Scope: Ainuoke Order Discovery Gate，只做固定只读 clean-bootstrap discovery foundation；不创建 PostgreSQL SalesOrder、不执行 bootstrap、不切换 Repository、不触碰 Browser 数据、不开始 Phase 2B。
- Stage A PASS：真实“成衣销售合同”页面使用固定 6086103 空条件请求。当前绑定账号两次完整遍历均为 505 行/11 页，source ID、InsideOrderNo、SalesContractNo 各 505 unique，重复页 0，normalized hash 均为 `37d8e7860e3157cb3022657a4b4ce2223a53876383aec701c685431a5945b744`。
- Observed lifecycle: `生效=143`、`草拟=362`。D1935 + 5 个脱敏样本均通过 6086103/6086997 cross-check。只能声称 `current_account_visible`，不能声称 company-wide；正式 effective statuses 与组织 visibility 仍需用户决定。
- Stage B 增加 fixed `order_discovery` allowlist、精确空 DTO/request、deterministic full pagination、minimal Discovery Row/Snapshot 与 SHA-256；它没有 SalesOrder/业务 Repository/PostgreSQL mutation。
- Detailed evidence: `docs/features/AINUOKE_ORDER_DISCOVERY.md`。Phase 2A ownership history and updated clean-bootstrap boundary: `docs/features/SALES_ORDER_PERSISTENCE.md`。
- Current migration direction: Browser Order Center / Scheduling 是测试数据，不作为正式迁移源；Quote Center 是真实业务数据并必须保护；Style Progress/Material out of scope/preserve；Closing retirement status 未决定。
- Browser test data retirement is not authorized. Future cleanup requires an independent Gate, complete backup, dependency audit, exact delete/protect scope, and explicit destructive confirmation.
- Verification: Discovery 6/6、Full Tests 571/571、Python Bridge 34/34、typecheck、zero-warning lint、30-route build、secret scan、diff-check PASS。
- READY FOR PHASE 2B CLEAN BOOTSTRAP SCHEMA/API DESIGN: YES；但 Phase 2B 尚未获准，本任务没有开始。真实 bootstrap/read cutover 仍为 NO。

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
