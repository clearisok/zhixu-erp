# 当前：Issue174 v2 工程及隔离演练，远端交付待恢复

2026-11-25；GitHub main再次复核为 **10b9a7d827e1c09f152ead58c21f26712d49a619**。用户已批准v2第一、二阶段，见[D201](DECISION_LOG.md)及[授权转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)。branch `feat/issue174-storage-v2`；最终代码checkpoint `8dfe2fcf051ca0d22ef33204564ea189c9c8df45`，从clean的dee3开始，旧文档工作树保持冻结。Project Open/In Progress，其他字段/视图/自动化未改。

**本地工程与隔离证据**：仅两新表；共享目录/正文、无变化确认与业务版本分离、颜色/审计差异写、固定引用保护、可信解决和限量TTL/汇总、辅助维护退避。清理默认关闭、原频率不变。原备份145表原样恢复/全行hash通过；选择目标132表全量原列、13表选中原列、原来源hash、1731目录、5序列、FK及13附件配对通过；另一新PG容器再次恢复/普通角色保护通过。635订单是备份时点，不冒充稍后636订单或实时Staging。

同备份原样12,168,731,671 bytes，紧凑恢复406,182,935 bytes（约96.66%减少）；后续系统统计405.08MB。100次无变化录制Worker重放旧/新业务run为100/0，净增长31.88/1.85MB，P95为2.332/2.101秒；94.19%下降不冒充95%或24小时稳态。周期目录/检查点另测；保留/放弃清单、30/90/365天情景、恢复资源和第三阶段一次性授权见[简明决策报告](tasks/active/issue174-v2-phase12-results.md)。

**验证**：完整源码1026/1026、发布基线回归182/182、完整目录106/106、最后目录/删除恢复26/26、强hash/存储保护4/4、合成Chromium9/9；typecheck/lint、Server authority前端构建、后端编译通过，源码发布守卫按上述main通过。后续后端小改有对应测试；未变的守卫及冻结输入复用完整回归。没有部署、真实浏览器人工接受或自然运行容量验收宣称。

**风险/下一步**：PR尚未创建。一次获批Git push不确定传输，独立核验文档分支未送达；NETWORK_DEGRADED，按协议不重复失败通道。工程与文档均有本地commit，不冒称REMOTE DELIVERY PASS；精确远端验证后补文档/统一工程PR。完整含PR交付标准尚未满足。实际切换须组合保留PR172现有整改和PR173备份修复，重新取得最新停写一致配对备份，不使用此旧演练库覆盖新写。

线上应用角色只读核验为superuser/createRole/bypassRls且owns145表，未修改；隔离普通非owner角色与受限维护ACL已实测。阶段三须另批受管凭据/DSN与非owner身份，再决定清理启用及原暂停原因处理后的Worker恢复。既有6087051历史详情投影限制未扩大修复，当前物料读取与原证据重建通过。

**边界**：本轮未执行Staging切换/历史删除/清理启用/Worker恢复/旧库或备份退役、自动合并或Production。原备份90天从未来正式迁移验收成功起算。本地原备份和各隔离副本继续保留。下一步是可靠远端交付与审查，其后才申请阶段三；不能因本地PASS自行切换。

[接力](AI_HANDOFF.md) · [实施恢复点](tasks/active/issue174-storage-implementation.md) · [脱敏证据](tasks/active/evidence/issue174-storage-v2-20261125/measurements.json) · [历史checkpoint](tasks/completed/2026-11-25-issue174-engineering-checkpoints/README.md) · [实施前摘要](tasks/completed/2026-11-24-before-issue174-implementation/CURRENT_STATE.md)。
