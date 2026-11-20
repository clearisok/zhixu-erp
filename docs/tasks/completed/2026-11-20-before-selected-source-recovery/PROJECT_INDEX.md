# 当前项目入口

2026-11-20；feat/ainuoke-source-deleted；本任务main基线636a5ad0d2d1acbe6b2705696e782dea12ee9f00。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[Issue159删除生命周期和完整历史证据](tasks/active/ainuoke-source-deleted-2026-11-20.md)。
2. [来源审计](features/AINUOKE_SYNC_AUDIT.md)、[业务规则](BUSINESS_RULES.md)、[决策](DECISION_LOG.md)、[发布基线](features/RELEASE_BASELINE_GUARD.md)。
3. [前一状态归档](tasks/completed/2026-11-20-before-source-deleted/CURRENT_STATE.md)、[产品需求管理](product-management/WORKFLOW.md)。

Draft PR160候选c3e4251fc9f9a7cc6a18aaa7c2dad8fcc192ea90已按用户后续授权部署Staging，等待人工验收；此前仅本地/不部署记录属于历史阶段。两个真实样本经正式631行/13页双遍证据确认source_deleted，五服务健康、原DB/对象容器和四卷及历史保全。没有合并或操作Production。

已有selected_source_invalid暂停及142失败/20待处理保留，Worker0，业务自动同步未恢复。只读Recovery Gate缺匹配新版本备份终态而拒绝；不清故障/伪造heartbeat。实际Staging登录后浏览器像素验收因工具启动失败尚未完成；公共TLS、精确版本/样式及真实服务读取模型已核实。精确c3的三CI和工程检查通过，详见当前状态和任务证据。
