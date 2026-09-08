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
- Gate A `9be9efa598d1f8758f07153574c8dd54b2d71f2f`：详情返回进入 AppShell Topbar、明确 parent target 且继续经过 unsaved navigation guard；全局 More 轻量单行；报价顶部合并为唯一 Quote Cockpit Bar。
- Gate B `d9176be4f16d3802fa6838cc3ec2534e471a570a`：Canonical identity 改为合同 + `materialType` + 标准化名称；Style Progress IndexedDB v3→v4 非破坏迁移保留 Batch / Allocation / manual/source；D1935 从 18 组收敛为 13 组且明细不丢失。
- Gate C `e34dfc9f3c667ff17d7904a7235f6c673c86f3f5`：生产与运输按“在哪里生产 / 物料从哪里发 / 仓库到工厂怎么走”组织；路线与方式组合编辑，日历使用星期与特殊日期表单，Configuration Health 使用正式 Repository 事实。
- Gate A/B/C 与最终文档已完成并推送；1229 CSS viewport Browser QA、TypeScript、ESLint、488/488 全量测试、29 路由 Production Build 和 diff check 全部通过。任务处于 PR 审阅阶段；不要重做 Gate A–C，不要自动合并 main。

## Latest Merged Work

- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已进入 `main`。当前全局 local data schema 为 13，本任务把 Style Progress IndexedDB 向前升级为 4；详细模型、真实 D1935 验收和已知边界见 `docs/features/STYLE_PROGRESS.md` 与 `docs/CURRENT_STATE.md`。
- PR #3 对应的 Full UI Workflow Correction、Second Acceptance 及其 Gate A–F 提交已进入 `main`；追溯资料见 `docs/tasks/completed/`。

## Do Not Reopen

除非用户提出新需求，不重新设计 Ainuoke Matcher、QA Cleanup、Material Dedup、Style Progress Source / Effective / Actual、Material Logistics 唯一 Service；missing SupplyHub 不自动猜宁波仓。
