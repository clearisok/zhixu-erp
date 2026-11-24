# 当前：Issue174同步存储治理v1，仅设计待审批

2026-11-24；设计main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**。GitHub API与本地对象/HEAD一致；起始fetch经进程代理连接失败，本轮NETWORK_DEGRADED、未刷新ref。独立文档分支chore/issue174-storage-design起点clean。用户本轮只批准技术设计及必要有界只读核对，不批准实施、迁移、历史删除、配置、部署、调频或恢复Worker。

[Issue174](https://github.com/clearisok/zhixu-erp/issues/174)为Open/Design/P0；[完整方案v1](features/Issue174-同步存储架构整改与数据库容量治理实施方案.md)和[用户原文](tasks/active/issue174-design-request-2026-11-24.md)固化已批准7/30/90天保留规则、长期业务/真实变化/必要证据及全部例外。失败30天从解决起算；迁移专项备份90天从正式验收成功起算，不修改日常备份策略。技术结构/执行参数/监控期限及全部A–F实际执行仍待批准，不进入Ready。

沿用11-24 12:06:35调查：12.336GB、145表、636订单；前三表92.11%，run.discovery已压缩7.964GB。过去7天42,398次6087051发布中99.38%逻辑计数未变，不等于整个合同所有报表都未变。本轮不重跑全库体积或正文去重，只核对外键/代码逻辑引用、近5条故障记录及运维DB连接角色。新方案复用目录chunks/capture、共享物料/颜色正文、双hash、无变化轻量确认、引用保护TTL和隔离紧凑库迁移；1–2GB/95%只是待实测目标，无实施收益宣称。

实际Staging调查标签revision a0a9c78c6cccbadf5e635dbb60169f7f87944644（未合并PR172组合UI）；PR173备份候选head da1c2653ae6c53a1527bcee60dbdec734cc36553也未合并，后续必须核对实际app/operator/backup版本，不能被main文档覆盖。既有控制enabled=true、paused_reason=catalog_diagnostic_write_failed，最后heartbeat 11-24 11:16:20.855北京；回执不足以确定根因，不推定容量导致，不解除安全门禁。运维连接quote_trial为superuser，不能据此假定应用角色已隔离；TTL机制启用前须核实实际身份。

本轮质量检查仅文档/相对链接、Git范围与实际main锚点release guard/基线回归；无业务代码或UI变化，不用旧0752/e833测试充当本次结果，设计测试矩阵均为未来待执行。最终本地commit、检查结果及远端/PR交付状态见AI_HANDOFF/Issue最终评论；精确送达前不记REMOTE PASS。保留旧日期/hash/结果的[设计前摘要](tasks/completed/2026-11-24-before-issue174-storage-design/README.md)及[PR160历史验收](tasks/completed/pr160-final-acceptance-2026-11-20.md)。

下一步：用户集中审批v1；实施前补全量隔离去重/引用/峰值/回滚测量和具体执行授权。Production、旧库/卷/备份资产删除不在授权内。
