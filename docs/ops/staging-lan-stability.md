# Staging LAN 长期维护、推广和回滚

2026-11-21，Issue163 / PR164；仅Staging。当前实机结果及待办以[第二阶段任务](../tasks/active/staging-lan-stability-2026-11-21.md)为准，第一阶段证据在[原手册](staging-lan-direct.md)。本页的公司网络变更是待批准方案，不代表已执行。

## 原生持久路由与地址

Windows已实际执行`ops/staging-lan/Set-ClientPersistentRoute.ps1 -Execute`：仅66.69/32经83.1、WLAN2/interface14、metric1，在ActiveStore及PersistentStore读回一致。New-NetRoute默认保存两store；没有传不支持的PersistentStore创建值，见[Microsoft说明](https://learn.microsoft.com/en-us/powershell/module/nettcpip/new-netroute)。独立receipt在LOCALAPPDATA/WeaveOps/staging-lan-163/persistent-route.json；脚本拒绝未知/冲突路由，仅迁移此前owned临时路由。退出办公室时仍须撤旧hosts；公司DNS落地前不能称已自动漫游。

服务器使用systemd-networkd，原Netplan文件及DHCP保持。`persistent-route.py`默认只plan；实际需root：

```powershell
ssh -t weaveops "sudo python3 /home/jackson/weaveops-staging-lan/persistent-route.py --execute"
```

只写`/etc/systemd/network/10-netplan-enp3s0.network.d/90-weaveops-staging-lan-163.conf`，内容为Route Destination=192.168.83.51/32、Gateway=192.168.66.1、Metric=50；root receipt `/var/lib/weaveops-staging-lan-163/route.json`。networkctl reload只重新读取配置，不restart网络服务/Docker、down接口或改默认路由。静态替代读回后才删除旧精确临时路线。遵循[networkd drop-in机制](https://www.freedesktop.org/software/systemd/man/latest/systemd.network.html)。实际sudo执行与重启验证以任务回执为准，不凭磁盘文件称重启通过。

服务器66.69是DHCP，当前服务端66.1；实际DHCP MAC为**12:ff:e0:00:88:4f**（原Netplan明确设置且dhcp-identifier=mac），不是永久硬件MAC10:ff:e0:00:88:4f。客户端83.51也为DHCP83.1，当前WLAN MAC24:B2:B9:90:A3:7B。需要网络管理员确认租约/冲突及SSID随机MAC策略后，分别建立66.69和83.51地址保留。不要在未知DHCP池内擅自改主机静态地址。

已发现的H3C S5130V2-52S-SI是服务器LLDP邻接交换机、端口Gi1/0/13；尚不能据此断言它就是DHCP/DNS服务器。两个网关HTTP80只读探针超时，管理网址/型号待管理员提供，不猜登录路径、口令或配置菜单。

## Docker重叠根因与待批准迁移

历史恢复/验收项目留下约30个桥网络；旧2026-11-01备份演练网络`zhixu-quote-trial-backup-drill-20261101_default`无当前端点，仍安装192.168.80.0/20内核直连路由，覆盖办公室83段。最长前缀匹配令回程选旧桥而非默认网关。已有172.17–31和192.168.*大网段连续分配的现场清单，与旧Compose未指定IPAM/历史项目保留一致；分配时完整daemon审计日志未获得，不能把重构推断冒充当时日志。当前未见daemon.json自定义地址池；后续演练代码已有显式/28子网规划，不会自动修复旧网络。

本阶段不删除网络、不prune、不重启Docker、不改共享默认池。彻底迁移须独立批准：

1. 冻结完整network inspect、Compose源与关联容器/卷、宿主路由、DHCP/VLAN/VPN保留网段；停用旧恢复入口的决定与备份恢复窗口分别确认。
2. 对零端点旧网络，逐一确认没有停止容器依赖、恢复脚本或审计保留要求；每个network的旧IPAM/options/labels保留重建清单。不能由“无运行端点”直接推导可删除。
3. 对仍在用的网络，先从`subnet-policy.mjs`按完整保留网段挑不重叠小网段，建立隔离候选及恢复验证，再按独立窗口逐项目迁移；Production不得纳入本次执行。
4. 如需修改Docker默认地址池，单独审批共享daemon变更/重启；它只影响未来网络，不会改写既有网络。失败按原配置与逐网络清单恢复，不删除数据卷。

当前单客户端用/32覆盖错误回程；公司推广可申请83.0/24经66.1的明确路由，而非不断追加员工/32，但那是共享路由范围变化，尚未执行。

## 公司Split DNS：待设备权限与安全批准

当前DHCP已经向办公室发公司DNS **192.168.1.65 / 192.168.1.6**，不需要先更换员工DNS服务器。服务器另见1.2，其他VLAN使用范围仍须核实。

| 配置对象 | 精确计划值 |
|---|---|
| 覆盖范围 | 仅内部解析器的`staging.weaveops.top`，不创建遮蔽整个weaveops.top的空zone |
| A | 192.168.66.69；首次TTL300秒 |
| AAAA | 该精确名称返回权威NODATA，避免IPv6仍绕公网 |
| 公网 | Cloudflare现有记录/Proxy/Tunnel保持，公网不得发布私网A |
| DHCP | 保留原DNS分发；先做好上述服务器/试点客户端地址保留 |
| 客户端 | DNS验证成功后撤试点owned hosts；员工无需添加hosts |
| 漫游 | 使用当前网络DHCP DNS，外网自然解析原CF；不得全时固定私网地址/内部DNS到笔记本 |

网络管理员执行前应导出现有记录/zone/租约，确认1.65/1.6的平台、主从或AD复制关系。若是Windows DNS，DNS Manager中先连接这两台现有服务器；使用已有单名称覆盖能力，或只建`staging.weaveops.top`精确zone并在zone apex添加A，保持其他weaveops域名继续递归；zone类型/复制范围必须按实际平台确认，不自动猜AD设置。其他设备用等价Host Override。参考[Windows DNS zone管理](https://learn.microsoft.com/windows-server/networking/dns/manage-dns-zones)。

验收依次为两解析器A/AAAA、无hosts客户端、可信TLS/实际remoteIP、登录/API/附件，再测试断连重连及离开办公室（移动网络）后的公网解析；考虑TTL/浏览器缓存，不把立刻保留的旧缓存当新DNS响应。每种浏览器与代理实际模式各测一次。当前Nginx/UFW仍仅allow83.51；**DNS记录变更本身不会授权其他员工访问**，范围扩大必须另批准。

## Clash/TUN与Secure DNS

当前实际代理为XingchenHelperService管理的XingchenCore/Bettbox TUN，不是同机另装的clash_verge_service。不要改错客户端或覆盖订阅。当前试点通过owned hosts加原生/32绕过Fake-IP，不能据此保证公司DNS后所有第三方客户端自动遵循。

受管理Mihomo配置的目标是精确域名DIRECT、LAN /32 DIRECT并排除该域名Fake-IP，同时让该名称使用**当前物理网络的DNS**。以下仅为未应用示意，必须核对活动版本/配置、fake-ip-filter-mode及系统DNS在TUN下是否回环，再增量合并，不替换用户数组/规则：

```yaml
dns:
  fake-ip-filter:
    - staging.weaveops.top
  nameserver-policy:
    staging.weaveops.top:
      - system
rules:
  - DOMAIN,staging.weaveops.top,DIRECT
  - IP-CIDR,192.168.66.69/32,DIRECT,no-resolve
```

规则须位于全局兜底前，Global模式不保证使用普通rules。不要全时写Clash hosts=66.69或硬编码公司DNS，否则漫游会失效。`system`/`dhcp`在部分客户端或TUN版本有差异，必须现场验证，不能仅复制配置称兼容。见[Mihomo DNS](https://wiki.metacubex.one/en/config/dns/)、[DNS类型](https://wiki.metacubex.one/en/config/dns/type/)。

浏览器若强制外部DoH，会绕内部DNS覆盖；公司DNS单独无法保证兼容。经管理员批准后，可使用受管理的系统DNS/适当DoH策略或提供公司可用的分视图DoH。Chrome的automatic与secure模式语义不同，automatic也不保证任意自定义外部DoH回到公司DNS，须清除不适用的固定模板并验证；不为此关闭TLS/浏览器安全。Firefox支持精确ExcludedDomains，见[官方策略](https://mozilla.github.io/enterprise-admin-reference/reference/policies/dnsoverhttps/)。本阶段未改浏览器或公司策略。

自动审查拒绝执行本机TUN服务重启及WiFi断连/重连（仅返回blocked by policy），没有绕过。手动验证时先确认无未保存操作，在管理员PowerShell运行`Restart-Service -Name XingchenHelperService`，然后用Windows WiFi界面断开/重新连接i-kashion；每一步重新检查普通域名curl的remote66.69/local83.51/verify0及双store路线。OS重启需用户安排；共享服务器重启必须另批准。

## 认证、安全和Cloudflare边缘策略

当前LAN实际匿名/伪造CF身份和Forwarded头仍401，foreign Origin登录403；原app session/RBAC、HttpOnly/SameSite=Strict/Secure配置保留。同一部署source0752的server/auth与server/http相对当前分支无差异。LAN拒绝未知域名/SNI，数据库/对象控制台/Socket未新增暴露。

局域网不经过Cloudflare的Access/WAF。如果原边缘额外提供MFA、设备或IP限制，不能宣称app密码登录已自动等效。现有DNS Token读取WAF/Access均403/10000；控制台浏览器超时，**这不代表策略不存在**。扩大前由有权限管理员只读核对：Cloudflare Zero Trust → Access controls → Applications中所有匹配staging或通配域名的应用、Policies/Include/Require/Exclude/Bypass；域名weaveops.top → Security rules的Custom/Managed/Rate limiting及匹配表达式。也检查账号级规则和Tunnel published route原CA/SNI。不要扩大DNS Token、创建Bypass规则或关闭WAF。参考[Access位置](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)、[Security rules](https://developers.cloudflare.com/security/rules/)。

## 证书、监测与入口隔离

仅LAN项目unless-stopped，Docker/cron/UFW enabled。已有真实自动拉起演练：新Nginx进程退出后同一容器RestartCount0→1；原公网入口前/期间/后均可信200，原10容器不重启。实际主机开机顺序/地址就绪仍须重启后验证，尤其当前地址为DHCP。原Staging五服务和Worker的Docker restart policy均为no；现有Worker由原分钟cron监管，Linger=no。尚未证实原五服务的完整开机恢复owner，不能因LAN自身可自动恢复就直接重启共享服务器；先由原部署/备份运行手册审核精确启动与恢复顺序，不改Worker策略或另起并行owner。

`certificate.sh renew`只在新证书出现时原子更新版本symlink、nginx -t、优雅reload并最多10次检查**服务端实际可信指纹等于磁盘**。失败恢复旧symlink并重载旧证书。`reload-test`已实际通过，正式DNS-01 dry-run与未到期renew通过；4项隔离POSIX故障测试验证新发布/不重复reload/指纹不匹配回滚/语法失败，不将假证书测试称实际临期续期。

用户cron保留其他job字节，每天UTC03:19/15:19 renew（北京11:19/23:19）、:37 check、:41 monitor。schedule.py识别旧/新owned block，仅升级该块并备份完整crontab；重复install无变化，未知block拒绝。monitor检查独立renew/check失败、36h/2h陈旧、LAN及原localhost上游证书21天到期、私密权限，输出600状态和journal；健康check不会遮蔽旧renew失败。私钥/Token600，private/tls700。外部通知需明确渠道/受控配置路径，目前未配置，不冒称通知已到达。

## 附件与独立公网验证

旧STAGING-ACCEPTANCE-562图片68字节原件下载/hash与DB一致；IDAT CRC无效，原app sharp/libpng离线拒绝解码。因此503为历史原件严格解码失败，与LAN代理无关；不删除、修复或覆盖旧原件。新合成草稿QT-2026-1121-008保留328字节PNG及8MiB纯合成TXT，上传/下载均LAN且hash一致；100MiB+1声明在发送payload前413、无业务写入。没有实际传输100MiB上限文件，不能称整个上限已压测。

`Staging public ingress smoke`只在相关PR/人工触发运行匿名GET，GitHub hosted runner提供独立于办公室和服务器的网络；拒绝LAN/Fake-IP/overlay地址和非CF响应、不跟随重定向、不带凭据，不做登录/写入或部署。10次/login及health/build/trace只输出允许的端点、状态、计时和不含IP的trace摘要。实际结果以对应Actions日志为准；不是独立外网用户完整浏览器验收。

## 外网优化边界

实测客户端默认/显式7888代理到www.cloudflare.com是KHH/TW；绑定WLAN并使用当时公网DNS答案的Staging对照为AMS/CN；服务器trace为LAX/CN且Tailscale无exit node。Tunnel metrics4个HA连接分别lax05/lax13/lax01/lax10，服务显式HTTP2、未设region。浏览器入口节点与Tunnel连接节点是两件事。官方region只有us或默认global，没有asia；auto优先QUIC、UDP不通回退HTTP2，见[官方参数](https://developers.cloudflare.com/tunnel/reference/run-parameters/)。

服务器对官方region1/region2 DNS名称的TCP7844各3次成功，约197–269ms；这不是QUIC/UDP握手或丢包证明。本阶段不重启共享Tunnel、强制QUIC/虚构亚洲region、固定边缘IP或开付费服务。后续优化可经批准在维护窗口做受控QUIC/HTTP2对照及企业出口线路比较，使用动态官方发现，不以普通浏览器节点推断Tunnel路线。

## 完整回滚顺序

1. 先用原Set-ClientHosts.ps1 -Execute -Rollback撤owned hosts，恢复公网解析；不恢复整份hosts覆盖其他并发改动。
2. Windows管理员运行Set-ClientPersistentRoute.ps1 -Execute -Rollback，只移除owned持久路线并保留原临时路线；如需完全撤销，再用原Set-ClientRoute.ps1 -Execute -Rollback。重启后已不存在的临时路线不重复删。
3. 如已执行服务器持久脚本，用上面ssh命令加`--rollback`；它只撤owned drop-in并恢复临时/32以保连通。完全撤销时再核对后执行`sudo ip route del 192.168.83.51/32 via 192.168.66.1 dev enp3s0`。原Netplan/DHCP不恢复覆盖。
4. 如只退第二阶段服务代码，保留cron当前和源码备份；恢复private/source-backups/phase9中certificate.sh/schedule.py之前，先用当前schedule.py remove撤本任务新block，再恢复旧脚本并按原install重建旧block。monitor.py可保留文件但不再调度。不要直接还原整份crontab覆盖其他job。
5. 如完全退LAN，先schedule.py remove，再只stop weaveops-staging-lan/ingress；按原手册撤精确UFW规则。原Tunnel/app/DB/Worker不停止，不删任何volume、网络或附件。
6. 公司DNS/地址保留/扩大allow若未来获批实施，须使用各次owned变更记录精确撤销；不能拿本阶段未实施的计划作为已发生操作回滚。

## Git正式交付与传输维护

本阶段确认全局Git代理仍为127.0.0.1:17989且无监听；已用当前127.0.0.1:7888进程级代理正常单次推送908417be并独立核实精确SHA。全局配置影响其他项目/工作树，未擅改；一次成功也不证明所有网络故障永久消失。

任务内一条命令（默认Dry Run，实际需-Execute）：

```powershell
pwsh -NoProfile -File ./ops/staging-lan/deliver.ps1 -ExpectedHead <本次完整40位HEAD> -Execute
```

默认7888，可用-Proxy指定当前无凭据loopback HTTP代理；wrapper只临时追加进程配置、完整恢复原环境，仍调用scripts/git-delivery.ps1，不发明新的推送/认证策略。STOP/NETWORK_DEGRADED按根AGENTS处理，不force/rebase或自动重试。最终提交SHA/远端及CI回执见Issue163/PR164，不能以连接器正文更新冒称Git提交送达。
