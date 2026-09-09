# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`f83b427c90baff22c4df24170561f2b9022506c9`（PR #9 已 merged，历史 Review cleanup 已进入 main）

## Current Active Task

- Branch: `feat/ainuoke-material-api-preview`
- Baseline: `f83b427c90baff22c4df24170561f2b9022506c9`
- Scope: 6087050 Direct API → thin adapter → 唯一 Material Normalize / Dedup / Validate / Preview → STOP。禁止 `commitImport`、Style Progress persisted write、SalesOrder、Scheduling 或 Closing mutation。
- 当前同步以 6087050 Direct API 当次 Snapshot 为 authoritative source；历史 Excel 只作历史 Source、字段语义参考和回归输入。API/Excel 不要求 row-count/hash/identity parity，但同字段语义和后续 Domain pipeline 必须一致。
- API trace 保存 report/source identity/snapshot hash/fetchedAt/query/schema，绝不伪造 Excel 坐标；6087050 继续复用 canonical full-row SHA-256，identity 与页码、位置和排序无关，repeated upstream id 不碰撞。
- `material-normalization-pipeline.ts` 是 Excel/API 共用的唯一 Normalize / Dedup / Validate/Event construction；Canonical 仍按合同 + 类型 + 标准化名称，厂供仍保留 Trace 并退出 operational projection。`MSingleName` 不映射为 `sourceActualName`；6087050 的 `actualConsumption` 也没有充分字段证据，均保持空值。
- 2026-09-09 D1935 真实 UI dry run：6 页、262/262 Source rows、262 accepted / 0 rejected、262 unique identities、1 repeated-id group、12 Canonical groups（面料 2、辅料 10）、6 厂供 rows、12 operational groups、255 Demands、Purchase/Inbound/Shipment/Outbound 183/153/150/150、identity collision 0。只调用只读 bridge query；页面业务计数仍为 mirror 0、ImportRun 0、orders 168。
- 本 Gate 没有 Material commit 按钮或 Repository 调用。**LIVE MATERIAL COMMIT NOT EXECUTED**。
- 自动门禁：定向 75/75、字段语义修正专项 34/34、Full Tests 541/541、TypeScript、ESLint、30-route build 与 `git diff --check` 通过；Bridge 未修改。

## Latest Merged Work

- PR #9 已 merged；历史 Review cleanup 已进入 main。PR #8 的 6086103/6086997 Contract API Gate 2 继续是稳定事实；6087050 Material commit 仍未开始。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
