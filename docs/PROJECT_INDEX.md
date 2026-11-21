# 当前项目入口

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；Issue163可信LAN HTTPS入口已实际启动，Let's Encrypt证书/续期演练通过、独立cron已安装。客户端443待获批UFW规则执行回执，hosts/真实浏览器未完成，不称LAN验收通过。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[Issue163 Phase4](tasks/active/staging-lan-direct-2026-11-21.md)、[运维与回滚](ops/staging-lan-direct.md)。
2. [初始匿名测速](../artifacts/staging-lan-20261121/measurements.json)、[发布基线守卫](features/RELEASE_BASELINE_GUARD.md)。新样本与真实LAN闭环随Phase4另记录，localhost不能替代办公室。
3. [PR164](https://github.com/clearisok/zhixu-erp/pull/164)仍Draft；实际部署源92e83343已核远端及7文件hash，精确源码守卫和发布CI通过（本地Windows完整套件中止不记PASS）。App仍0752，Production/DB/卷/Worker/Tunnel不改。
4. [PR160验收](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[510任务](tasks/active/staging-selected-source-recovery-2026-11-20.md)、[删除生命周期](tasks/active/ainuoke-source-deleted-2026-11-20.md)、[订单](features/ORDER_CENTER.md)、[业务规则](BUSINESS_RULES.md)、[D199](DECISION_LOG.md)。D199为原架构冻结证据，实际后续激活状态以当前Phase4为准。
5. [证书部署前摘要](tasks/completed/2026-11-21-before-lan-https/CURRENT_STATE.md)、[路由批准前摘要](tasks/completed/2026-11-21-before-lan-route-approval/CURRENT_STATE.md)、[初始前摘要](tasks/completed/2026-11-21-before-staging-lan/CURRENT_STATE.md)。保留旧日期/hash/结果/限制。

下一步核实单客户端443放行、管理员hosts、真实浏览器remoteIP与登录业务、性能和外网回归；不改公司整体DNS，不扩大allow或擅自合并。

最新CLI CI查询connect timeout，通道记NETWORK_DEGRADED；连接器核实92 CI成功，后续只本地文档checkpoint待人工交付，不将其当本机网络恢复。
