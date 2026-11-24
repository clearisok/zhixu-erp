# 当前项目入口

2026-11-24；本轮设计main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**，GitHub API与本地对象独立核实一致；起始fetch连接失败，本轮NETWORK_DEGRADED，未刷新远端ref。独立文档分支chore/issue174-storage-design，不修改业务实现或真实环境。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)。
2. [Issue174当前精简方案v2](features/Issue174-精简整改决策方案-v2.md)、[原完整技术方案v1.1](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)、[用户设计授权及保留规则原文](tasks/active/issue174-design-request-2026-11-24.md)、[Issue174调查与设计](https://github.com/clearisok/zhixu-erp/issues/174)。当前Open/Design/P0，仅设计，待用户集中批准。
3. [同步审计](features/AINUOKE_SYNC_AUDIT.md)、[订单中心](features/ORDER_CENTER.md)、[业务规则](BUSINESS_RULES.md)、[决策](DECISION_LOG.md)、[监管契约](ops/ainuoke-catalog-sync-supervisor.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)、[产品管理](product-management/WORKFLOW.md)。
4. [设计前摘要原件](tasks/completed/2026-11-24-before-issue174-storage-design/README.md)、[PR160最终验收与代理历史](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[Git交付协议](tasks/active/git-delivery-resilience.md)。

11-24调查实测12.336GB/145表/636订单，原报告与145表明细在Issue174；本轮只补有界引用/故障/角色核对。实际Staging应用调查标签为a0a9c78c（PR172），未合并PR173备份候选亦须后续交付整合，不能从旧11-20文档推断当前部署。既存catalog_diagnostic_write_failed暂停仍未恢复。禁止本轮代码实施、DB迁移/清理、配置/部署、调频或Worker操作；方案中所有结构和收益是拟议或待验证。

D200是当前保留范围输入：整改前无业务引用且无其他保留义务的旧来源历史可不迁入，T后真实变化长期保留；本轮仍不授权执行。v1.1摘要原件见[归档](tasks/completed/2026-11-24-before-issue174-simplification/README.md)。
