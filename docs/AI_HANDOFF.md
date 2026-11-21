# 接力：Issue163 Staging LAN准备；外部条件未齐

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 已fetch核实，分支feat/staging-lan-direct，起点clean。用户原附件直接授权Staging LAN实现/部署/浏览器及PR，禁止Production、原组件重启、DB/卷破坏或公司整体网络改动。Issue163已登记Project In Progress，未最终验收/关闭；此前PR160用户接受及main收尾[逐字归档](tasks/completed/2026-11-21-before-staging-lan/AI_HANDOFF.md)。

Staging本体仍0752，未重部署/重启。SSH weaveops严格校验→100.80.138.58，物理192.168.66.69。新目录/home/jackson/weaveops-staging-lan已落独立配置/measure/preflight；官方Nginx离线包hash和两机image ID已核实。loopback探针容器weaveops-staging-lan-probe-20261121已停止，失败run与v2成功证据保留。长期LAN ingress未启动，443/18443无监听，原10容器身份/启动时间和卷/网络均不变，Tunnel active、Supervisor RUNNING。没有真实PG心跳查询，不冒称同步业务验收。

当前Windows192.168.83.51经过Bettbox TUN/Fake-IP，服务器回程被旧Docker192.168.80.0/20误路由。用户异步问题未答：当前电脑是否目标办公室；证书路径/安全DNS-01凭据；是否批准sudo ip route add 192.168.83.51/32 via 192.168.66.1 dev enp3s0。当前没有管理员/sudo非交互权限，不能当作默认批准，不能用Docker特权去绕过共享主机路由审批。不要删除旧网桥、改Docker代理/全局Git配置或重试失败的服务器registry通道。

原源站证书仅localhost，不能浏览器使用；未签发可信域名证书/续期timer/告警。当前Access完整策略仍待核对。Chrome可列标签但getTab/domSnapshot/新建均timeoutMs接口故障，勿声称登录后UI完成；没有业务/附件写入。原Cloudflare入口保留，未改hosts/DNS/TUN/路由器。不要因工具阻塞改浏览器安全检查。

当前电脑公网login冷10/10 TTFB中位1401.750ms/P95 4048.025ms；server localhost 3.745/9.736、Nginx loopback9.653/21.721；LAN0/10。不同网络不可算改善。测速工具初版fresh-connect参数错误的失败原件在ignored outputs保留，修正后的v2是有效冷数据。匿名样本已归档，无Cookie/响应body/秘密。工具3tests、定向lint、JS/Nginx/bash语法及loopback401/403通过；发布基线、commit/PR/CI另按最终交付回执核对。

[任务全证据](tasks/active/staging-lan-direct-2026-11-21.md)、[运维/回滚](ops/staging-lan-direct.md)、[当前状态](CURRENT_STATE.md)。正常Git通道用子进程限定7888正式脚本push并精确核验；不改共享Git代理17989，失败按NETWORK_DEGRADED。下一步先解决明确外部前置，再激活既有准备，禁止以新文档/标签冒充LAN已成功。
