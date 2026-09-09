# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`7527a5d5fee7b04cdfbeec489203559e0b5ff157`（PR #8 已 merged，Gate 2 已进入 main）

## Current Active Task

- Branch: `chore/ainuoke-historical-review-cleanup`
- Baseline: `7527a5d5fee7b04cdfbeec489203559e0b5ff157`
- Scope: 只显式清理 unresolved `schedule_match` / `closing_match`；保留 order/data-anomaly/resolved reviews 和全部业务事实，不开始 6087050 或未来录入方案。
- Pure service `cleanupObsoleteHistoricalReviews` immutable、deterministic、idempotent；commit orchestration 只执行 Ainuoke state load → filtered state save → count-only OperationLog append，不调用 Order/Scheduling/Closing/Style Progress Repository。
- `/ainuoke-sync` 只在旧 backlog 非零时显示轻量维护入口与确认 Modal；复用 `ainuoke.resolve_conflict`，`ainuoke.view` 不能执行清理。成功后 state/badge 立即刷新，入口在 backlog 归零后消失。
- 2026-09-09 真实 DEV cleanup 已完成：用户先导出 Backup，再由本人通过 UI 确认。unresolved schedule/closing 分别从 112/373 变为 0/0，order 保持 30，data anomaly 保持 0，pending 从 515 变为 30；resolved schedule/closing 仍为 0/0。
- Cleanup 前后业务数量一致：Mirror 487、ImportRuns 4、SalesOrders 464、ScheduleAssignments 26、OrderExecutionTrackings 2、ScheduleBatches 0、ClosingPeriods 11、ClosingAllocations 47、ProductionGroups 16、OutsourceFactories 13、ProductionSites/Calendars 2/2、SupplyHubs/Routes 1/1、TransportModes 3。OperationLog 只新增 1 条 count-only cleanup 日志（112/373/485）。专项纯函数/service 复验确认第二次 removed 0 且无第二条日志。后续真实排单/生产录入方式仍为 TBD。
- 自动门禁：相关回归 69/69、Full Tests 520/520、TypeScript、ESLint、30-route build 与 `git diff --check` 通过。

## Latest Merged Work

- PR #8 已 merged；6086103/6086997 Direct API → common Contract Source → existing `AinuokeContractMirror` → existing `synchronizeAinuokeContracts` 的 Gate 2 已进入 main，6087050 Material commit 仍未开始。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
