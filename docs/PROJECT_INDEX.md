# 当前项目入口

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；Staging LAN第二阶段低风险持久化/稳定性实施中，保留未完成的服务器sudo、公司网络和重启边界，不称全公司验收。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[第二阶段任务](tasks/active/staging-lan-stability-2026-11-21.md)、[长期运维/公司DNS/回滚](ops/staging-lan-stability.md)。
2. [第二阶段40样本](../artifacts/staging-lan-20261121/stability-measurements.json)、[稳定性/安全快照](../artifacts/staging-lan-20261121/stability-acceptance.json)、[第一阶段验收](tasks/active/staging-lan-direct-2026-11-21.md)、[原手册](ops/staging-lan-direct.md)。业务截图/原件不入Git，历史失败保留。
3. [PR164](https://github.com/clearisok/zhixu-erp/pull/164)、[Issue163](https://github.com/clearisok/zhixu-erp/issues/163)；用户要求必要CI通过后可审查、不合并。908417be已正式交付且Release/Team/Source全成功，最终冻结HEAD/remote及新外网CI另核，不借旧CI。app仍0752，原10容器保全。
4. [业务规则](BUSINESS_RULES.md)、[D199及用户稳定化授权](DECISION_LOG.md)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)、[同步监管](ops/ainuoke-catalog-sync-supervisor.md)、[PR160原验收](tasks/completed/pr160-final-acceptance-2026-11-20.md)。
5. [最终冻结前摘要](tasks/completed/2026-11-21-before-lan-final-freeze/CURRENT_STATE.md)、[稳定化前](tasks/completed/2026-11-21-before-lan-stability/CURRENT_STATE.md)、[客户端验收前](tasks/completed/2026-11-21-before-lan-client-acceptance/CURRENT_STATE.md)。原日期/hash/限制保留。

继续等待服务器sudo执行回执、设备管理入口和告警渠道；先验证原Staging开机恢复owner，再审共享主机重启，不自动改Worker/Production或扩大allow。
