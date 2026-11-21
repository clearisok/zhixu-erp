# Staging LAN 第二阶段：长期稳定化与正式交付

2026-11-21，北京时间；Refs Issue163 / PR164，继续feat/staging-lan-direct。用户本聊天认可现有Nginx+可信LAN HTTPS+Cloudflare架构，并明确批准Staging范围可回滚低风险持久化/修复；不修改Production、DB schema、既有业务数据和Worker配置。共享服务器重启、Docker网络迁移、公司DNS/路由器、扩大allow先完成其余工作再提交具体审批。原单机验收不倒改历史，见staging-lan-direct-2026-11-21.md。

## Delivery Phase8 baseline

起点 **5ad87d91181ed37cec762e4e8aba3539aa486610** / clean，无继承dirty；本地baseline outputs/staging-lan-20261121-phase8/baseline.json。GitHub连接器核实PR164仍Draft、head92e83343082c1251000944b6e791e8a4a3e68445/base10b9a7d827e1c09f152ead58c21f26712d49a619。进程限定7888代理正式交付Dry Run READY_DRY_RUN/NORMAL/pushes0，无分歧；未更改全局/common-dir代理/认证或强推，实际推送仍待本阶段checkpoint。

## 当前已核事实与实施

- 服务器systemd-networkd管理enp3s0，来源/run/systemd/network/10-netplan-enp3s0.network；Netplan只配置dhcp4/dhcp6=true、macaddress12:ff:e0:00:88:4f、dhcp-identifier=mac。66.69为DHCP、服务器66.1发租约，不是已证实静态/保留地址。永久硬件MAC10:ff:e0:00:88:4f与实际DHCP MAC不同，地址保留应核实际12:ff。LLDP邻接H3C S5130V2-52S-SI / GigabitEthernet1/0/13，不据此认定它就是DHCP/DNS管理设备。
- Windows83.51也由DHCP83.1分配，公司DNS1.65/1.6；实际TUN为Bettbox/XingchenCore，另有clash-verge-service。未把磁盘Clash配置当活动配置。
- Docker约30个历史桥网络，80.0/20是2026-11-01备份演练无端点网络，覆盖83.0/24且比默认路由更具体。多个恢复/演练项目使用自动IPAM而保留旧网络，耗用172和192私网池；/etc/docker未见daemon.json/default-address-pools自定义。后续新演练已有ops/quote-trial/subnet-policy.mjs显式/28规划，10.253.240.*网络证明其使用，但不自动迁移旧网络。没有删除网桥、重启Docker或改共享地址池。
- 新persistent-route.py仅管理10-netplan-enp3s0.network.d/90-weaveops-staging-lan-163.conf的83.51/32 via66.1 metric50；root receipt/未知冲突拒绝/仅reload networkd配置，不改原Netplan/DHCP/默认路由。不重启服务；静态替代出现后才退旧精确临时路由。9项保护/回滚测试通过；主机脚本SHA256 9cc8b5f7fe798ecb74046c2b3a8b571a799b449b2a637aaa85fad832782ecf6a，Dry Run通过；因sudo需本人密码，已给用户精确执行命令，待执行/读回。
- Set-ClientPersistentRoute.ps1已在用户UAC管理员进程实际完成，66.69/32 via83.1/WLAN2/interface14/metric1同时存在ActiveStore和PersistentStore，独立owned receipt；不传不支持的New-NetRoute PersistentStore参数，使用原生命令默认双store。只迁移先前owned临时路由，冲突拒绝/回滚恢复临时路线。重启、网络重连/Clash重启仍待验证，未改DNS/hosts/VPN模式。
- 15:43只读PG事务实际核对：enabled=true/pausedReason=null，heartbeat15:43:02.176距查询0.111秒，最新合同success15:42:15.905、审计success15:42:16.241；当日成功表27344、complete jobs55663/历史failed182。没有手动采集、修改控制/队列/成功时间。主机evidence/phase8-worker-before.json及11容器before身份保留。
- 现有Nginx restart=unless-stopped，Docker/cron/networkd/UFW enabled；UFW精确443规则已写user.rules，具备配置持久性，真实重启尚未验证。Token/private key仍仅主机私密路径。
- 新证书reload-test和正式发布后served fingerprint核对；失败恢复旧symlink并重载旧证书。新增monitor.py评估renew/check失败/调度陈旧/21天到期/私密权限，写600状态和journal，不设未授权外发目标；schedule只升级本任务原block并备份完整crontab，不改其他jobs。4项monitor测试通过，实际部署/cron与重载验证待下一Phase。
- 历史503附件DB显示68bytes、available、PNG、SHA bf3136761ef7d071d9505b8f774dc887ebce09be35b44fd8f18f08b401af7174；尚未改它，继续只读下载/解码定位。
- cloudflared2026.9.3，服务明确--protocol http2、未设region，token-file=/etc/cloudflared/token（不读内容）。本机metrics4个HA连接，观察到Tunnel侧lax节点；不是浏览器trace节点。进一步只读线路/策略检查待继续，不更改Tunnel或使用不存在的亚洲region。

## 检查与剩余执行

Python route9/monitor4共13项通过、PS Parser通过、diff --check通过。首个通过Windows text pipe的bash语法探针因CRLF传输报错；改用规范LF源bytes后bash -n实际PASS，未降低Bash检查。完整Windowsnpm run test:release-baseline已重启并保留outputs内日志，当前仍运行，不记PASS。

剩余：服务脚本真实部署与reload/monitor/cron，服务器sudo执行回执，重连/重启边界，大文件和历史图只读原因，Access/WAF及公司DNS设备权限、告警渠道、动态地址保留、正式Git推送/精确HEAD/必要CI。用户需要的信息已异步询问，继续独立工作；不把未答复当授权。
