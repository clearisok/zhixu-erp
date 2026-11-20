# 当前项目入口

2026-11-20；feat/ainuoke-source-deleted，main核实636a5ad0d2d1acbe6b2705696e782dea12ee9f00，PR160 Draft。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[Issue161 selected_source_invalid受控恢复](tasks/active/staging-selected-source-recovery-2026-11-20.md)。
2. [Issue159订单删除与c3部署](tasks/active/ainuoke-source-deleted-2026-11-20.md)、[Price隔离](tasks/active/catalog-mutable-recapture-2026-11-19.md)。
3. [监管runbook](ops/ainuoke-catalog-sync-supervisor.md)、[来源审计](features/AINUOKE_SYNC_AUDIT.md)、[业务规则](BUSINESS_RULES.md)、[决策](DECISION_LOG.md)、[发布基线](features/RELEASE_BASELINE_GUARD.md)。
4. [此前c3验收状态归档](tasks/completed/2026-11-20-before-selected-source-recovery/CURRENT_STATE.md)、[产品管理](product-management/WORKFLOW.md)。

用户新授权仅Staging排查/最小修复/正式恢复及两轮自然验证，替代此前“不恢复”的阶段限制；禁止Production/合并。真实c3来源仍暂停，当前新增受审备份路径候选待Linux/E2E，不提前恢复或宣称同步正常。
