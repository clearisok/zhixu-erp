# 当前项目入口

2026-11-26；Issue174旧408MB候选隔离准备验收通过，用户已批准随后直接新3.5h维护窗口，最新一致性备份与完整最终验收保持。新窗口北京时间14:40:56–18:10:56已进入，原入口隔离、最新配对备份运行中，尚未切库。应用 **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，main **10b9a7d827e1c09f152ead58c21f26712d49a619**；Worker/清理OFF，旧库备份不删，PR不合并，Production不操作。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[第三阶段实际执行检查点](tasks/active/issue174-staging-phase3-execution-20261126.md)、[获批执行单](tasks/active/issue174-staging-phase3-ready.md)、[脱敏预检](tasks/active/evidence/issue174-phase3-20261126/preflight.json)。
2. [统一工程PR176](https://github.com/clearisok/zhixu-erp/pull/176)、[最终fd三CI回执](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7169586629)、[Issue174最新进展](https://github.com/clearisok/zhixu-erp/issues/174)、[原文档PR175](https://github.com/clearisok/zhixu-erp/pull/175)。PR172/173保全、不合并。
3. [已接受前两阶段](tasks/active/issue174-v2-phase12-results.md)、[原实施恢复点](tasks/active/issue174-storage-implementation.md)、[工程分项证据](tasks/active/evidence/issue174-storage-v2-20261125/delivery.json)、[原测量](tasks/active/evidence/issue174-storage-v2-20261125/measurements.json)、[145表计数](tasks/active/evidence/issue174-storage-v2-20261125/migration-counts.json)、[合成浏览器](tasks/active/evidence/issue174-storage-v2-20261125/README.md)。旧635单/406MB不是当前切换结果。
4. [精简v2](features/Issue174-精简整改决策方案-v2.md)、[v1.1](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)、[D201](DECISION_LOG.md)、[原一二阶段批准](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)。冻结文档不改旧ID/hash，新授权和结果前向记录。
5. [同步审计](features/AINUOKE_SYNC_AUDIT.md)、[业务规则](BUSINESS_RULES.md)、[订单中心](features/ORDER_CENTER.md)、[legacy ERP](features/LEGACY_ERP.md)、[Supervisor](ops/ainuoke-catalog-sync-supervisor.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)、[产品管理](product-management/WORKFLOW.md)。
6. [PR172历史](tasks/active/ui165-final-delivery-2026-11-24.md)、[PR173门禁](tasks/active/ui165-staging-backup-recovery-2026-11-24.md)、[执行前摘要原件](tasks/completed/2026-11-26-before-issue174-phase3/README.md)、[前一轮交付检查点](tasks/completed/2026-11-26-issue174-delivery-checkpoints/README.md)、[三分支原摘要](tasks/completed/2026-11-25-before-issue174-delivery/README.md)、[原工程归档](tasks/completed/2026-11-25-issue174-engineering-checkpoints/README.md)、[Git交付协议](tasks/active/git-delivery-resilience.md)。

维护约3h/预算3.5h，从真正停写开始；最新配对备份/普通角色/完整业务附件门禁不能省略。Worker恢复、清理启用、旧库备份退役、自动合并及Production仍不授权。
