# 当前项目入口

2026-11-25；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；Issue174 v2第一/二阶段代码和隔离演练已有本地验证，`feat/issue174-storage-v2`。NETWORK_DEGRADED，远端/PR未交付；实际Staging切换另批。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[简明阶段一/二决策报告](tasks/active/issue174-v2-phase12-results.md)、[实施恢复点](tasks/active/issue174-storage-implementation.md)。
2. [Issue174](https://github.com/clearisok/zhixu-erp/issues/174)、[实施批准转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)、[精简v2](features/Issue174-精简整改决策方案-v2.md)、[v1.1](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)、[D201](DECISION_LOG.md)。设计文档保留原评审日期，最新授权和结果以上述Issue评论/报告为准。v2窄替代旧历史迁移/兼容/新增组件，其他业务保护与门禁不变。
3. [同步审计](features/AINUOKE_SYNC_AUDIT.md)、[订单中心](features/ORDER_CENTER.md)、[业务规则](BUSINESS_RULES.md)、[legacy ERP](features/LEGACY_ERP.md)、[监管契约](ops/ainuoke-catalog-sync-supervisor.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)、[产品管理](product-management/WORKFLOW.md)。
4. [脱敏测量/测试](tasks/active/evidence/issue174-storage-v2-20261125/measurements.json)、[145表迁入计数](tasks/active/evidence/issue174-storage-v2-20261125/migration-counts.json)、[合成浏览器](tasks/active/evidence/issue174-storage-v2-20261125/README.md)、[历史checkpoint](tasks/completed/2026-11-25-issue174-engineering-checkpoints/README.md)。
5. [实施前摘要](tasks/completed/2026-11-24-before-issue174-implementation/CURRENT_STATE.md)、[PR160验收历史](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[Git交付协议](tasks/active/git-delivery-resilience.md)。

只在任务隔离副本完成恢复/选择/转换与录制重放；实际Staging数据、清理开关、Worker、旧库备份退役、Production及自动合并仍未授权。源码/实测/预测/远端/部署/人工接受分别记录。


2026-11-25 交付准备：用户已接受 Issue174 第一、二阶段，授权 Git 交付、保全 PR172/173 及第三阶段准备；运行操作仍未批准。PR172 精确 a0a9c78c6cccbadf5e635dbb60169f7f87944644 已纳入本组合，产品文件无冲突；状态摘要原件见 [归档](tasks/completed/2026-11-25-before-issue174-delivery/pr172-PROJECT_INDEX.md)。本行仅为组合 checkpoint，最终准备结论另行收口。
