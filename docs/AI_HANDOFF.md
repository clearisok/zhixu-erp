# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`efb2996206c1738255f764d71fb2bfa3f329e069`（PR #12 已 merged，Ainuoke Unified Order + Material Sync Gate 4 已进入 main）

## Current Active Task

- Branch: `feat/postgres-server-foundation`
- Baseline: `efb2996206c1738255f764d71fb2bfa3f329e069`
- Scope: PostgreSQL Server Persistence Migration Phase 1，只交付 Node/TypeScript Server Runtime、版本化 PostgreSQL migration、可信 Auth/RBAC 与服务器 OperationLog 基础；不创建 SalesOrder 或其他 Phase 2 业务表，不迁移浏览器业务数据。
- Checkpoint A：已实现独立 Node/TypeScript server、PostgreSQL pool、`/api/v1/health`、forward-only migration runner 与 `schema_migrations` ledger；runner 使用 advisory lock、逐文件事务和 SHA-256 checksum fail-closed。一次性 `postgres:16-alpine` tmpfs 容器集成测试覆盖顺序、幂等、checksum drift、失败回滚、并发 runner 和数据库健康状态。
- Checkpoint B：待实现 trusted auth/session、基于共享 `PermissionKey` 的 server RBAC、append-only server OperationLog、DEV proxy / Node production container path、完整文档与最终验证。

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
