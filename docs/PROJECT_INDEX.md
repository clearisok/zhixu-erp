# 当前项目入口

2026-11-24；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；Issue174 v2第一/二阶段已获用户批准并实施中，独立`feat/issue174-storage-v2`，NETWORK_DEGRADED，实际Staging切换另批。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[实施恢复点](tasks/active/issue174-storage-implementation.md)。
2. [Issue174](https://github.com/clearisok/zhixu-erp/issues/174)、[本次实施批准转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)、[精简v2](features/Issue174-精简整改决策方案-v2.md)、[v1.1](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)、[D201](DECISION_LOG.md)。v2优先适用历史迁移/兼容/新增组件，其他业务保护与门禁不变。
3. [同步审计](features/AINUOKE_SYNC_AUDIT.md)、[订单中心](features/ORDER_CENTER.md)、[业务规则](BUSINESS_RULES.md)、[legacy ERP](features/LEGACY_ERP.md)、[监管契约](ops/ainuoke-catalog-sync-supervisor.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)、[产品管理](product-management/WORKFLOW.md)。
4. [实施前摘要](tasks/completed/2026-11-24-before-issue174-implementation/CURRENT_STATE.md)、[PR160验收历史](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[Git交付协议](tasks/active/git-delivery-resilience.md)。

只在独立恢复副本/目标库演练，禁止修改现有Staging数据/自动清理开关/Worker、旧库备份退役、Production及自动合并。源码、新migration、集成测试与容量实测的事实分开记录，不把方案估算算作完成。
