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
- Scope: Gate 0 Security Contract + Source Contract；Gate 1 Personal Account Binding + Read-only Direct API Foundation。
- Gate 0 建立 `tools/ainuoke-bridge` Python contract、loopback/Origin/secret policy、固定 6086103/6086997/6087050 Catalog、sanitized source DTO 与 deterministic snapshot hash；不触碰 SalesOrder、Style Progress 或既有 matcher/material service。
- 本任务必须明确标为 browser-local mock identity 下的“本地 Windows 原型个人账号绑定”，不是生产级多人认证与安全隔离。

## Latest Merged Work

- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
