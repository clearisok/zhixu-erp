# AI 接力棒

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

依赖既有项目内容的新会话先读取：`AGENTS.md` → `docs/PROJECT_INDEX.md` → 本文件 → `docs/CURRENT_STATE.md` → `docs/BUSINESS_RULES.md` → 当前任务相关 `docs/features/*.md` → `docs/DECISION_LOG.md` 中 Active 决策 → 当前 branch / HEAD / status。

## Current Stable Main

`ab13869a26d0240f7f9cc950ef439c38ac0ede73`

## Current Active Task

- Branch: `feat/navigation-material-infrastructure-redesign`
- Baseline: `ab13869a26d0240f7f9cc950ef439c38ac0ede73`
- Gate A 已完成代码与专项测试：详情返回进入 AppShell Topbar、明确 parent target 且继续经过 unsaved navigation guard；全局 More 轻量单行；报价顶部合并为唯一 Quote Cockpit Bar。
- 下一步：Gate A checkpoint push 后进入 Gate B name-only Canonical Material migration；不要重做 Gate A。

## Latest Merged Work

- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，Style Progress IndexedDB 为 3；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
