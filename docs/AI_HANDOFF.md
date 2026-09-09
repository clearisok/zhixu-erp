# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`152638db2004b34193f0bed8332100f1d0bb3b47`（PR #10 已 merged，6087050 Direct API Material Preview 已进入 main）

## Current Active Task

- Branch: `feat/ainuoke-material-api-commit`
- Baseline: `152638db2004b34193f0bed8332100f1d0bb3b47`
- Scope: Gate 3C 已完成。在既有 6087050 Preview 后增加薄 commit orchestration，只调用现有 `styleProgressRepository.commitImport`；authoritative replacement、Projection 排序与真实 DEV D1935 live acceptance 均已通过。
- Checkpoint 1 已实现稳定内容批次身份、API ImportBatch/RawSnapshot trace、完整性/权限/stale-preview 防护、同 snapshot 幂等、当前事实替换、manual Effective 保留和 count-only 既有语义 OperationLog。
- Checkpoint 2 已实现 Preview-first UI 与二次确认 Modal；只有 `style_progress.import` 可提交，Modal 明示当前绑定 Snapshot 的 InsideOrderNo/fetchedAt/Source/Canonical/Demand/Event/厂供计数，以及 SalesOrder/Scheduling/Closing 不变边界。
- 当前同步以 6087050 Direct API 当次 Snapshot 为 authoritative source；历史 Excel 只作历史 Source、字段语义参考和回归输入。API/Excel 不要求 row-count/hash/identity parity，但同字段语义和后续 Domain pipeline 必须一致。
- API trace 保存 report/source identity/snapshot hash/fetchedAt/query/schema，绝不伪造 Excel 坐标；6087050 继续复用 canonical full-row SHA-256，identity 与页码、位置和排序无关，repeated upstream id 不碰撞。
- `material-normalization-pipeline.ts` 是 Excel/API 共用的唯一 Normalize / Dedup / Validate/Event construction；Canonical 仍按合同 + 类型 + 标准化名称，厂供仍保留 Trace 并退出 operational projection。`MSingleName` 不映射为 `sourceActualName`；6087050 的 `actualConsumption` 也没有充分字段证据，均保持空值。
- 2026-09-09 D1935 真实 UI dry run：6 页、262/262 Source rows、262 accepted / 0 rejected、262 unique identities、1 repeated-id group、12 Canonical groups（面料 2、辅料 10）、6 厂供 rows、12 operational groups、255 Demands、Purchase/Inbound/Shipment/Outbound 183/153/150/150、identity collision 0。只调用只读 bridge query；页面业务计数仍为 mirror 0、ImportRun 0、orders 168。
- 第一次真实 commit 出现 15 个 Canonical，而 API Preview 为 12 个；只读审计证明额外汗布、罗马布、棉毛布共 20 个 Demand 来自旧 Excel。根因是旧 replacement scope 只移除 `sourceKind=api`。当前完整 API Snapshot 会按 affected contract 移除所有 prior-source current Demand/Event，同时保留 Excel/API ImportBatch 与 Raw Trace。
- Canonical Material 排序已在 Projection 统一落实：面料全在辅料前；面料按 actualConsumption DESC，缺 actual 时按 plannedConsumption DESC，再按 sourceSortNo/key；辅料按 sourceSortNo/key。All/Fabric/Trim 使用相同稳定顺序。
- Excel/API Demand ID 不稳定；manual Expected Arrival 采用排除 source-only 差异的确定性业务身份做唯一 remap，零或多候选 fail closed。D1935 的 manual batch、allocation 与 `2026-09-01` Effective 已保留，source-following 计划刷新。
- 2026-09-10 用户在已完成 DEV Backup 后本人确认修复后的 D1935 commit。AFTER 为 262 Source rows、255 Demands、12 Canonical（面料 2、辅料 10）、183/153/150/150 四类 Events、6 厂供 trace-only rows；旧 Excel operational facts 已退出，两个 Excel 历史批次/Raw Trace 仍可见。页面刷新后 12 / 2 / 10 和排序保持不变。
- 新增 OperationLog 为既有“导入面辅料跟进”动作，只保存 report/query 与 count metadata，无 secret。轻量边界复核显示 SalesOrders 仍为 464；代码边界与自动化确认 Scheduling/Closing 不受写入。本次未再次执行 Material commit。
- Gate 3C 最终门禁：定向 78/78、Full Tests 555/555、TypeScript、ESLint、Production Build 30 routes、`git diff --check` 与 secret leakage scan PASS。Bridge 未修改，未重复运行 Python tests。
- Fix checkpoint: `c7c557e90f922bfcf9b6b6503e0a06b01be85786`。Gate 3C 已进入最终文档、验证与 PR delivery 阶段；不开始 Gate 4。

## Latest Merged Work

- PR #10 已 merged；6087050 Direct API Material Preview 已进入 main。PR #9 的历史 Review cleanup 与 PR #8 的 6086103/6086997 Contract API Gate 2 继续是稳定事实。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
