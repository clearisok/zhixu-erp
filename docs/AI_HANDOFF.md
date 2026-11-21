# 接力：Issue163，单机LAN实机通过，远端文档待交付

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；feat/staging-lan-direct。Phase6起点8148e64e61ab80de0f972a4bb3f125c208f24dec/clean，无继承dirty；部署/已核远端92e83343082c1251000944b6e791e8a4a3e68445。后续checkpoint仅本地文档证据；CLI NETWORK_DEGRADED，不自动重复push/执行恢复/改共享代理，不用文件API伪造Git交付。PR164 Draft、Issue163不关闭，不merge。

用户UFW Rule added和管理员hosts HOSTS_VERIFIED已回执；83.51普通解析staging.weaveops.top→66.69，WLAN2/83.1直连。不要重复添加路由/UFW/hosts。两端/32仅临时，不能自动持久化。hosts owned备份/receipt在LOCALAPPDATA/WeaveOps/staging-lan-163；Set-ClientHosts.ps1 -Execute -Rollback撤owned行，route脚本同理。公司DNS/路由器/VPN未改，不扩allow。

LAN入口、正式证书、续期演练和实际cron check均已运行，不重复up旧项目或换原CA。证书2027-02-19到期；服务器UTC03:19/15:19 renew、:37 check，北京11:19/23:19。Token仅主机private/cloudflare.ini 600，不输出。无外部通知接收端。原app0752；最终原10容器身份/镜像/启动/重启精确保全，9healthy/Worker running/Tunnel active，未查PG心跳。

用户亲自登录IAB，订单633/既有详情、物料及采购、报价列表通过。新增合成草稿QT-2026-1121-008，quote6f5dec5e-4d44-4f6d-80a0-8d4159e58f03/revisionb21cdf85-17c6-4576-a143-79ada1c68bc9/attachmentd581e46a-a071-4bdb-90d5-1a44a87d2f1d保留；PNG328bytes SHA256 1cff57aa68666ce35efb1ce9afd33fdadf966f13748af5a6fa327a2922fad3ea，上传201/下载200/hash一致/刷新保留。不清旧数据或进行客户确认/关联订单/来源刷新；不能称数据库无新增。

匿名禁缓存47响应全LAN；最终合成页84 HTTPS均66.69/200/secure+2本地Blob，0loadingFailed/console warn-error，cacheDisabled恢复false，未清Cookie/Storage。历史STAGING-ACCEPTANCE-562缩略图503原因未明，早期2缩略图Fake-IP/h3元数据矛盾未明，后续新刷新全LAN。真实业务截图及完整allowlisted metadata仅ignored outputs/staging-lan-20261121-phase6，不上传业务截图。

同机10次对照artifacts/staging-lan-20261121/phase6-{measurements,acceptance}.json：冷TTFB2004.794→63.011ms，复用911.964→12.365ms。CF固定104.21.26.56/同WLAN，邻近Trace AMS/CN，不等于历史SJC或独立外网。各10/10、15946bytes、零跳转，不推造edge→Tunnel分段计时。

92 Release baseline/First team access CI成功、Source cancelled；Windows完整套件1523160ms中止不记PASS。本阶段仅文档/证据，不重跑25分钟Windows套件；最终精确源码守卫结果见任务。剩余：用户最终确认、路由重启持续性、公司统一DNS/设备权限、Access全策略、真正外网、外部告警、大文件/未来业务WS。详[任务](tasks/active/staging-lan-direct-2026-11-21.md)、[runbook](ops/staging-lan-direct.md)、[前摘要](tasks/completed/2026-11-21-before-lan-client-acceptance/AI_HANDOFF.md)。
