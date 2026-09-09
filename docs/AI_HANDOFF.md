# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`14acc656dcd13d7ad0b664e5ec9a5582653a233a`（PR #7 已 merged）

## Current Active Task

- Branch: `feat/ainuoke-contract-api-sync`
- Baseline: `14acc656dcd13d7ad0b664e5ec9a5582653a233a`
- Scope: Gate 2 只把 6086103/6086997 Direct API snapshot 接入既有 `AinuokeContractMirror → synchronizeAinuokeContracts`，坚持 Preview-first；不开始 6087050 Material commit，不重做 PR #7 的账号、Bridge、协议或安全边界。
- Gate 2A 已实现 transport-neutral `ParsedSalesContract` / `buildAinuokeMirror`，Excel Adapter 继续复用同一 builder；新增 6086103/6086997 API Adapter、真实结构脱敏 fixture 与 Excel/API parity tests。
- 真实报表 metadata 已确认 `BillNo=销售合同号`、`GoodsDesc=款号`、`InsideOrderNo=工厂款号`；6086997 的 `stylecolor=成衣颜色`、`stylesizerule=成衣尺寸`、`stylenum=订单数量`。该报表是 material join，同一颜色/尺码会重复；API Adapter 按真实颜色组折叠 join，并因无法证明 Size1/Size2 等价而保持 `sizes=[]`。
- `AinuokeSourceTrace` 已向前兼容扩展为 Excel/API 两类：旧 Excel trace 不要求补写 `sourceKind`；API trace 保存 reportId、稳定 sourceRowIdentity、snapshotHash、fetchedAt 与 sourceHash，不伪造文件/Sheet/页位置。
- Gate 2A 验证：定向 17/17、Full Tests 504/504、TypeScript、ESLint 与 `git diff --check` 通过；checkpoint commit 以当前分支 history 为准。
- Gate 2A checkpoint：`090a954562ca84296ce9191b1781252e84a84fb0`，已推送。
- Gate 2B 已在既有 Ainuoke Sync 页面增加“艾诺科 API / Excel · 历史文件”Source Mode；API 只读抓取两张报表全部分页并建立内存 Preview，不要求 schedule/closing 文件。Preview 明确显示未写入；commit orchestration 显式检查 `ainuoke.sync`，且只保存 existing service 的 orders/state/operationLogs + API ImportRun，不导入或修改 Scheduling/Closing。
- Gate 2B 定向覆盖 API end-to-end mirror/sync、mismatch/orphan block、幂等、人工数量/颜色取消/交期/价格历史保留、preview 无写入、commit permission、ImportRun secret/restore 与 Scheduling/Closing 隔离。
- Gate 2B 验证：定向 26/26、Full Tests 513/513、TypeScript、ESLint、30-route production build 与 `git diff --check` 通过。
- Gate 2B checkpoint：`7ee9188`，已推送。
- D1935 Gate 2 live dry-run 已完成：1 份合同，quantity/colorQuantity 为 4,640/4,640、difference 0、5 colors、delivery 2026-10-13、validation valid；既有 matcher 无候选，would auto-create 1，would update/bind/review 0。用户未确认业务 commit；刷新后 mirror/import run 仍为 0、orders 仍为 168。
- PR #7 的个人 credential 仍在 Windows Credential Manager；本轮没有打印或持久化 credential/token/session。复核 console 4 条记录，secret-pattern 0、error 0；6087050 Material commit 未开始。

## Latest Merged Work

- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
