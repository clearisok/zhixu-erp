# AI Handoff

## Repository

- GitHub: `clearisok/zhixu-erp`
- Default branch: `main`

## Mandatory Reading

新的 ChatGPT / Codex 会话依赖既有项目内容时，先读取：

1. `AGENTS.md`
2. `docs/PROJECT_INDEX.md`
3. `docs/AI_HANDOFF.md`
4. `docs/CURRENT_STATE.md`
5. `docs/BUSINESS_RULES.md`
6. 当前任务相关 `docs/features/*.md`
7. `docs/DECISION_LOG.md` 中 Active 决策
8. 当前 Git branch / HEAD / status

## Git State

`AI_HANDOFF` 是接力内容，不是 Git HEAD 缓存。本文不保存“当前 main HEAD”这一自失效字段；恢复项目时，必须从 Git 实时获取状态，以 `origin/main` 为正式共享基线，并检查当前 branch / HEAD / status。

## Last Completed

- Style Progress / Material Follow-up
- Style Progress Logistics Correction
- GitHub Delivery Protocol
- Repository generated dependencies cleanup

## Current Active Task

当前没有正在实施的业务任务。

## Next Candidate Phase

Ainuoke Playwright 自动抓取 / 同步准备。仅为候选下一阶段，尚未启动。

## Do Not Reopen

除非用户提出新需求，不重新设计：

- Ainuoke Matcher
- QA Cleanup
- Material Dedup
- Style Progress Source / Effective / Actual
- Material Logistics 唯一 Service
- missing SupplyHub 不自动猜宁波仓
