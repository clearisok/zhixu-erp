# 当前项目入口

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 本轮再次fetch核实。Issue163两端临时/32路由已落实，办公室traceroute两跳到服务器；TCP SYN已到物理网卡但22未回应。UFW active、默认DROP、SSH仅tailscale0，未见443规则；单客户端443放行已获用户批准、待本人执行，Cloudflare凭据元数据已核对，LAN入口未激活。

1. [当前状态](CURRENT_STATE.md)、[接力](AI_HANDOFF.md)、[Issue163最新Phase3](tasks/active/staging-lan-direct-2026-11-21.md)、[LAN运维与回滚](ops/staging-lan-direct.md)。
2. [首轮匿名测速](../artifacts/staging-lan-20261121/measurements.json)、[发布基线守卫](features/RELEASE_BASELINE_GUARD.md)。localhost不能代表办公室LAN；此前样本不覆盖新路由状态。
3. [PR164](https://github.com/clearisok/zhixu-erp/pull/164)仍Draft，不合并；184f的发布CI182/182和团队访问通过，Source最终cancelled，不记PASS。本阶段代码/CI另记录。
4. [PR160验收](tasks/completed/pr160-final-acceptance-2026-11-20.md)、[510任务恢复](tasks/active/staging-selected-source-recovery-2026-11-20.md)、[删除生命周期](tasks/active/ainuoke-source-deleted-2026-11-20.md)、[订单](features/ORDER_CENTER.md)、[业务规则](BUSINESS_RULES.md)、[D199](DECISION_LOG.md)。Staging本体仍0752。
5. [路由批准前摘要](tasks/completed/2026-11-21-before-lan-route-approval/CURRENT_STATE.md)、[初始前摘要](tasks/completed/2026-11-21-before-staging-lan/CURRENT_STATE.md)。旧日期/hash/结果/限制保留。

本阶段落实已批准两端单IP临时路由并准备独立证书工具，不操作Production、DB/卷、Worker、旧网桥或公司整体网络。签发/续期任务尚未启动，真实LAN和浏览器业务验收未完成。
