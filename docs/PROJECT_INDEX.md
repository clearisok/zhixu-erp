# 当前项目入口

2026-11-21；最新main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 已fetch核实。Issue163 Staging LAN任务只完成安全准备及服务器loopback探针；真实LAN入口未启动。此前PR160/162和用户验收事实保留。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[Issue163现场证据](tasks/active/staging-lan-direct-2026-11-21.md)、[LAN运维/回滚](ops/staging-lan-direct.md)。
2. [本轮匿名测速原始样本](../artifacts/staging-lan-20261121/measurements.json)、[发布基线守卫](features/RELEASE_BASELINE_GUARD.md)。服务器loopback不代表办公室LAN改善，可信证书、路由权限、DNS/TUN与真实浏览器仍阻塞。
3. [PR160最终验收](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[510任务恢复](tasks/active/staging-selected-source-recovery-2026-11-20.md)、[删除生命周期](tasks/active/ainuoke-source-deleted-2026-11-20.md)。实际Staging仍0752，不因main合并重部署。
4. [订单](features/ORDER_CENTER.md)、[同步](features/AINUOKE_SYNC_AUDIT.md)、[业务规则](BUSINESS_RULES.md)、[决策D199](DECISION_LOG.md)、[产品管理](product-management/WORKFLOW.md)、[Git交付](tasks/active/git-delivery-resilience.md)。
5. [上阶段摘要原件](tasks/completed/2026-11-21-before-staging-lan/CURRENT_STATE.md)、[上阶段接力](tasks/completed/2026-11-21-before-staging-lan/AI_HANDOFF.md)。历史日期/hash/限制保留，不改写历史。

本轮不操作Production、业务DB/卷、Worker或公司整体网络。先解决Issue163外部条件，再继续既有独立入口；未获回应不等于批准共享主机路由。
