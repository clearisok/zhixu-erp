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
- Scope: Gate 3C 第一阶段，在既有 6087050 Preview 后增加薄 commit orchestration，且只调用现有 `styleProgressRepository.commitImport`。本阶段允许 fixture/isolated repository 验证，不允许对真实 DEV D1935 执行 Material commit。
- Checkpoint 1 已实现稳定内容批次身份、API ImportBatch/RawSnapshot trace、完整性/权限/stale-preview 防护、同 snapshot 幂等、当前事实替换、manual Effective 保留和 count-only 既有语义 OperationLog；UI 最终确认与安全展示仍在下一 checkpoint。
- 当前同步以 6087050 Direct API 当次 Snapshot 为 authoritative source；历史 Excel 只作历史 Source、字段语义参考和回归输入。API/Excel 不要求 row-count/hash/identity parity，但同字段语义和后续 Domain pipeline 必须一致。
- API trace 保存 report/source identity/snapshot hash/fetchedAt/query/schema，绝不伪造 Excel 坐标；6087050 继续复用 canonical full-row SHA-256，identity 与页码、位置和排序无关，repeated upstream id 不碰撞。
- `material-normalization-pipeline.ts` 是 Excel/API 共用的唯一 Normalize / Dedup / Validate/Event construction；Canonical 仍按合同 + 类型 + 标准化名称，厂供仍保留 Trace 并退出 operational projection。`MSingleName` 不映射为 `sourceActualName`；6087050 的 `actualConsumption` 也没有充分字段证据，均保持空值。
- 2026-09-09 D1935 真实 UI dry run：6 页、262/262 Source rows、262 accepted / 0 rejected、262 unique identities、1 repeated-id group、12 Canonical groups（面料 2、辅料 10）、6 厂供 rows、12 operational groups、255 Demands、Purchase/Inbound/Shipment/Outbound 183/153/150/150、identity collision 0。只调用只读 bridge query；页面业务计数仍为 mirror 0、ImportRun 0、orders 168。
- 当前仅完成 isolated commit validation；**LIVE MATERIAL COMMIT NOT EXECUTED**。完成 UI capability 后仍须停在 READY FOR LIVE ACCEPTANCE，不创建 PR。
- Checkpoint 1 自动门禁：Gate 3C + Material Preview/Adapter + Style Progress + Contract API 定向 67/67 PASS、TypeScript PASS、`git diff --check` PASS。

## Latest Merged Work

- PR #10 已 merged；6087050 Direct API Material Preview 已进入 main。PR #9 的历史 Review cleanup 与 PR #8 的 6086103/6086997 Contract API Gate 2 继续是稳定事实。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
