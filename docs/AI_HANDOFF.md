# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`c0eec7e4229e98df5bc9753c0379780165af9937`（PR #6 已 merged）

## Current Active Task

- Branch: `feat/ainuoke-personal-api-binding`
- Baseline: `c0eec7e4229e98df5bc9753c0379780165af9937`
- Scope: Gate 0/1 已完成；当前追加真实 Ainuoke Protocol Correction + Live Read Gate，不改变个人账号、loopback/Origin/CSRF、固定 allowlist 与 no-business-commit 边界。
- Gate 0 checkpoint `39e1f2e` 已推送：建立 `tools/ainuoke-bridge` Python contract、loopback/Origin/secret policy、固定 6086103/6086997/6087050 Catalog、sanitized source DTO 与 deterministic snapshot hash。
- Gate 1 已实现 Windows Credential Manager keyring、按用户内存 JWT、HttpOnly bridge session + CSRF、Personal Account API、read report endpoint、`/my-settings/ainuoke-account` 与 `ainuoke.account.bind_self`。Direct API 不写 SalesOrder/Style Progress，不调用任何 commit。
- 已确认 base `http://61.164.81.194:9043`、login `/kaijin/system/user/loginsys2`、Generic Report `/kaijin/report/report/getReportObjAndData`、System Id `6080183`。Bridge 已按真实 login `data.isOk/jwtToken/sessionId`、原值 Authorization/Token、`kaijin_my_token + rungingSysId` Cookie、report-specific InsideOrderNo condition 与 JSON-string `dataList` parser 修正；三张 report 的 filtered read 都不发送猜测 formId。
- 2026-09-09 用户本人已通过 UI 保存 credential；Windows backend 确认为 `keyring.backends.Windows.WinVaultKeyring`。真实 D1935：login 成功；6086103 HTTP 200 1/1 行；6086997 HTTP 200 50/187 行；6087050 HTTP 200 50/262 行。6087050 当页 1 个 repeated-`id` group，50 个 source identity 全部唯一。Console 16 条记录 secret-pattern 0 命中；无 Ainuoke mutation、订单/物料/款式进度 commit。
- Source schema 已升为 `ainuoke-direct-read.v2`。6087050 已确认 joined-view `id` 重复；三张报表都用 canonical-row SHA-256，不假设 `id` 唯一，不依赖排序/页位置。
- Protocol Correction 自动门禁：Python Bridge 32/32、TypeScript、ESLint、Full Tests 497/497、Production Build 30 routes 与 `git diff --check` 全部通过。
- 本任务必须明确标为 browser-local mock identity 下的“本地 Windows 原型个人账号绑定”，不是生产级多人认证与安全隔离。

## Latest Merged Work

- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
