# 织序当前恢复入口

当前新增目标：[新合同自动发现与建档](tasks/active/ainuoke-order-discovery-2026-11-09.md)。基线main390569c4；已查明计划备份碰锁导致后台停留安静期，原cron补备份后自然发现并建档两张新合同；修复、PR及staging升级尚在进行。下方是此前完成交付的证据，不代表本次目标已完成。

1. [CURRENT_STATE](CURRENT_STATE.md)：PR140已合并main390569c4，staging实际升级、617真实来源、页面、权限、手动/自然周期、备份恢复验收完成。
2. [AI_HANDOFF](AI_HANDOFF.md)：精确代码/运行路径、D1992实际staging UUID、宁波单实例后台、本机停采及恢复限制。
3. [staging交付和运维回滚记录](tasks/active/material-staging-delivery-2026-11-07.md)：完整授权、CI、部署、真实验收及旧失败历史。
4. [已验收物料业务/UI](tasks/active/material-business-view-2026-11-07.md)、[物料模块](features/AINUOKE_IT_MATERIAL_SOURCE.md)、[Server来源](features/AINUOKE_SERVER_SOURCE.md)、[业务规则](BUSINESS_RULES.md)、[决定D187–190](DECISION_LOG.md)。
5. [原本机自动执行验收](tasks/active/local-ainuoke-automatic-2026-11-07.md)、[Server登录及本机入口边界](features/SERVER_LOGIN.md)。

本轮已完成，日常同步由宁波后台继续。Windows任务分支feat/material-followup-business-view；部署source390569c4cfa56cd56261674c3f2110bd306d3ff7，原PRhead f2b7e8cda69845f9701b5a036cec6381df7e7d79。后续交接文档提交与应用部署版本分开。生产不在范围，本机数据/页面保留但对应采集暂停，不同时开启两个认证owner。

[本次更新前原索引](tasks/completed/2026-11-08-before-staging-actual/PROJECT_INDEX.md)、[旧状态](tasks/completed/2026-11-08-before-staging-actual/CURRENT_STATE.md)、[旧接力](tasks/completed/2026-11-08-before-staging-actual/AI_HANDOFF.md)保留原日期/hash/测试及限制。历史“未合并/未部署”不能覆盖当前已核实事实；不重复已成功且未受影响的检查、CI或全量采集。
