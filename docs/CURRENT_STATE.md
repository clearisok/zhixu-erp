# 当前：Staging LAN安全准备已落地，直连尚未完成

2026-11-21；本轮经进程限定7888代理fetch核实main **10b9a7d827e1c09f152ead58c21f26712d49a619**，clean起点独立分支feat/staging-lan-direct，Refs Issue163。用户已明确授权Staging LAN部署与必要单机验证；Production、共享组件重启、公司整体网络、数据破坏禁止。先前PR160/162收尾与验收见[原摘要](tasks/completed/2026-11-21-before-staging-lan/CURRENT_STATE.md)。

实际Staging仍0752d64f309d68b6e52afbbd712d28e0d9db9c1e，Linux weaveops-server/enp3s0 192.168.66.69，原gateway仅127.0.0.1:3003。新目录/home/jackson/weaveops-staging-lan已有独立Nginx配置/只读preflight/测速工具及核hash离线镜像；仅临时loopback:18443探针通过并停止，长期LAN服务未启动。原10容器ID/镜像/StartedAt/RestartCount、全部卷/网络前后相同，Tunnel active、Supervisor RUNNING；未改原服务/DB/Worker/公网DNS。

当前Windows 192.168.83.51、Bettbox TUN/Fake-IP 198.18.0.104→Cloudflare SJC；是否目标办公室客户端待用户确认。服务器对该客户端回程误走旧Docker 192.168.80.0/20网桥；已请求精确临时/32路由批准，未执行。当前进程无Windows管理员，服务器sudo要求交互认证。原证书只有localhost私有CA，不具备浏览器可信域名证书；用户证书路径或DNS-01凭据仍待提供。Chrome接口能枚举标签但读取/创建失败，真实浏览器未验收。未改hosts/代理/TUN/路由器或办公室DNS，Access全策略未复读。

冷连接各10次：当前电脑公网login TTFB中位1401.750ms/P95 4048.025ms；服务器原localhost为3.745/9.736ms，独立Nginx loopback为9.653/21.721ms。它们是不同网络视角，不能计算LAN改善比例；实际绑定WLAN的LAN:443为0/10成功。公网health9/10（1次连接超时）保留。原始匿名样本在artifacts/staging-lan-20261121/measurements.json，详细[调查与测试](tasks/active/staging-lan-direct-2026-11-21.md)。

已通过测速工具3项真实curl/统计/敏感输出回归、定向lint/JS语法、Nginx语法和真实loopback代理/401/403。发布守卫与最终commit/PR/CI在本轮交付记录追加，不借旧CI。无业务TS/React/UI/SQL/锁文件变化，未重跑无影响业务全套、来源请求或数据库恢复。

下一步只解决外部条件：确认目标客户端；批准/执行临时/32回程路由并验证VLAN互达；安全提供可信证书或Cloudflare最小DNS-01凭据；核对Access与实际TUN配置，完成单机DNS/可信HTTPS/浏览器业务，再谈办公室Split DNS及真实外网回归。证书续期/失败告警尚未安装。Issue保持未完成；不合并PR。维护/逐步回滚见[LAN runbook](ops/staging-lan-direct.md)。
