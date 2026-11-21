# 当前：Staging LAN 第二阶段已实施可执行部分，重启/公司网络待审核

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；feat/staging-lan-direct / PR164，未合并。用户认可双入口架构并授权低风险持久化；Phase8起点5ad87d91181ed37cec762e4e8aba3539aa486610/clean，Phase9证据checkpoint95e0e50eb3ec105956e9411464c6acbaac0355e3。重要旧摘要、hash/结果及限制归档[最终冻结前](tasks/completed/2026-11-21-before-lan-final-freeze/CURRENT_STATE.md)，详[第二阶段任务](tasks/active/staging-lan-stability-2026-11-21.md)。

Windows66.69/32 via83.1/WLAN2/metric1已在ActiveStore+PersistentStore实机读回；服务器networkd同客户端/32 drop-in脚本已测试/上传，因sudo需本人密码仍待用户执行，08:19读回未安装。两端均DHCP；66.69不是已证实静态/保留地址，实际DHCP MAC12:ff:e0:00:88:4f。旧Docker80.0/20覆盖83网段，保留未迁移。公司DNS1.65/1.6、路由器、地址保留和allow未改；Clash/TUN重启及WiFi重连自动执行被审查blocked by policy，未绕过。两端OS未重启。

独立LAN Nginx实际优雅重载、served可信证书指纹等于磁盘；新进程退出后同一容器自动拉起（RestartCount0→1），公网入口前/期间/后均可信200。原10容器ID/Image/StartedAt/RestartCount再次精确不变，app仍0752。原Staging五服务/Worker restart policy=no，Worker原分钟cron监管；原五服务完整开机恢复owner未证实，不能盲重启共享服务器或改Worker配置。

DNS-01正式签发和本阶段再次renew --dry-run通过，正式指纹不变；新发布核对实际served指纹、失败恢复旧link并reload旧证书。Python保护/故障共19项（Windows15 PASS/4 POSIX skip，Linux隔离发布4 PASS）；真实TLS/reload独立通过。cron只升级owned block，原其他jobs字节保持；北京11:19/23:19续期、每小时:37check/:41monitor。本地监测failed/stale/21天到期及权限，当前healthy，LAN证书余89.76天、原localhost证书余67.08天；无外部通知接收端，不换原CA。Token/私钥600，private/tls700。

Worker只读PG证据：16:19:49心跳距查询0.327秒、最新合同及审计success16:19:40，enabled/未暂停；complete55957较15:43增加294，历史failed仍182。未采集、写控制/队列或改Worker配置。历史68字节测试PNG原件hash正确但IDAT CRC无效，原app严格解码报libpng read error，503与LAN无关，不改旧附件。独立合成草稿保留PNG及8MiB TXT，上传201/下载200/hash一致；100MiB+1声明发正文前413，无业务写入，未传完整100MiB上限。

新同机各10/10冷连接CF→LAN TTFB1914.782→57.228ms，P953730.423→74.605，Total2143.862→61.081；复用855.658→11.169ms。详[40样本](../artifacts/staging-lan-20261121/stability-measurements.json)、[安全/稳定性快照](../artifacts/staging-lan-20261121/stability-acceptance.json)。办公室对照AMS/CN、默认代理KHH/TW、服务器及4条Tunnel连接LAX/CN，是不同链路；HTTP2、region未设，不存在可强制亚洲参数，未改Tunnel/固定edge IP/付费。独立GitHub外网匿名GET探针已加入，冻结时结果待跑，不能称外部完整浏览器登录验收。

Git已以正式工具安全交付908417bef3e0e4e67d5da2263feca68235e1cc38，Release/Team/**Source三CI均SUCCESS**；旧取消Source补齐。确认全局旧代理17989无监听，任务级7888override及恢复环境wrapper可用，不改全局。新冻结版最终HEAD/远端/CI由Issue163/PR164精确回填，未送达前不冒称PASS。混合工作树Windows长测试165/163PASS/2FAIL（证据在运行中变化），不记固定候选PASS；最终使用独立固定工作树重跑。运维/具体审批值/回滚见[长期维护手册](ops/staging-lan-stability.md)。

Phase10前向冻结源码守卫已PASS（main10b9/13pages/68capabilities/0UI/errors=[]）；最终固定提交的独立工作树完整复验与精确remote/CI结果以Issue163/PR164后继回执为准，冻结时不提前声明。
