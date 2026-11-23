# 当前项目入口

2026-11-20；PR160已正式合并，main代码整合基线 **4e1f9a514c8ff6e9cf7289d724df33c32bc05368**。用户已验收订单删除及Staging自动同步。后续仅文档收尾，开始下一任务必须核实最新origin/main。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[PR160最终验收与代理方案](tasks/completed/pr160-final-acceptance-2026-11-20.md)。
2. [Issue161恢复与510任务证据](tasks/active/staging-selected-source-recovery-2026-11-20.md)、[Issue159删除生命周期与部署历史](tasks/active/ainuoke-source-deleted-2026-11-20.md)。两文档保留原日期/阶段限制，最终状态以本次独立收尾记录和当前状态为准。
3. [订单中心](features/ORDER_CENTER.md)、[同步审计](features/AINUOKE_SYNC_AUDIT.md)、[监管runbook](ops/ainuoke-catalog-sync-supervisor.md)、[业务规则](BUSINESS_RULES.md)、[决策](DECISION_LOG.md)、[发布基线](features/RELEASE_BASELINE_GUARD.md)。
4. [合并前摘要逐字归档](tasks/completed/2026-11-20-pr160-before-final-acceptance/CURRENT_STATE.md)、[此前c3阶段](tasks/completed/2026-11-20-before-selected-source-recovery/CURRENT_STATE.md)、[产品管理](product-management/WORKFLOW.md)、[既有Git交付协议](tasks/active/git-delivery-resilience.md)。

实际Staging仍为已验收0752，Git合并不等于重新部署；本轮禁止Production、Worker重启和业务DB变更。Issue159/161验收与PR合并分别留痕，旧原始失败raw缺失不补造；未知结果、身份和完整分页保护继续生效。本轮没有新功能开发。
