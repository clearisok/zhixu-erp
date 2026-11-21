# 当前项目入口

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；Issue163单台办公室电脑LAN可信HTTPS已实机通过，有临时路由/历史缩略图/外部网络限制，不称全办公室验收。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[Issue163 Phase7](tasks/active/staging-lan-direct-2026-11-21.md)、[运维/回滚](ops/staging-lan-direct.md)。
2. [Phase6同机测速](../artifacts/staging-lan-20261121/phase6-measurements.json)、[浏览器/附件证据](../artifacts/staging-lan-20261121/phase6-acceptance.json)、[初始测速](../artifacts/staging-lan-20261121/measurements.json)、[发布守卫](features/RELEASE_BASELINE_GUARD.md)。旧失败保留，localhost不替代办公室。
3. [PR164](https://github.com/clearisok/zhixu-erp/pull/164)仍Draft，部署/远端92e83343082c1251000944b6e791e8a4a3e68445，app0752；后续文档证据本地checkpoint、CLI NETWORK_DEGRADED，待人工正式交付。不merge/关闭需求。
4. [PR160验收](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[510任务](tasks/active/staging-selected-source-recovery-2026-11-20.md)、[删除生命周期](tasks/active/ainuoke-source-deleted-2026-11-20.md)、[订单](features/ORDER_CENTER.md)、[业务规则](BUSINESS_RULES.md)、[D199及前向激活](DECISION_LOG.md)。
5. [客户端验收前摘要](tasks/completed/2026-11-21-before-lan-client-acceptance/CURRENT_STATE.md)、[证书部署前](tasks/completed/2026-11-21-before-lan-https/CURRENT_STATE.md)、[路由批准前](tasks/completed/2026-11-21-before-lan-route-approval/CURRENT_STATE.md)、[任务初始前](tasks/completed/2026-11-21-before-staging-lan/CURRENT_STATE.md)。原字节/hash/日期/限制保留。

下一步用户确认最终标准；公司Split DNS、持久路由或扩大allow须具体授权/设备权限。Production/原DB schema/Worker/Tunnel配置不变，合成验收草稿附件保留，不改既有订单。
