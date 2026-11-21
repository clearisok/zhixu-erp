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

## Delivery Phase9：真实稳定性/文件边界验证和独立公网探针

起点908417bef3e0e4e67d5da2263feca68235e1cc38/clean。Phase8正式脚本DELIVERED_VERIFIED/EXACT_HEAD_VERIFIED/pushes1/NORMAL，后续此前本地8148/8c/5ad一并安全交付；没有强推或全局配置改变。该HEAD Release baseline44882226138、First team access44882226203、**Ainuoke server source44882226086全部SUCCESS**，原取消Source已实际完整补齐，未降低CI或借旧source。当前Windows完整套件仍运行，不冒称本地通过。

- 908四个主机源文件SHA256逐项核实，证据主机phase9-deployment-source.json；旧certificate.sh/schedule.py保存在private/source-backups/phase9。实际reload-test通过：只对LAN ingress优雅重载，实际可信served fingerprint与磁盘一致；check和monitor healthy。用户cron只升级本任务block，新增每小时:41 monitor；安装前完整备份private/crontab-before-20261121T075302528990Z。原其他jobs字节精确相同；新完整hash44c16da7e8f3cc7fdabf1ce4c7739c3aedd8974f20d3ffece4da4dbd2ff43c76，重复status无变化。
- monitor进一步保护坏JSON状态和symlink/父目录权限；本机route9/monitor5通过。Windows不执行POSIX隔离fixture，4项明确skip；已在服务器jackson独立临时fixture实际4/4通过，不接Docker/ACME/真实TLS，不使用真实密钥。这些测试验证新发布只reload一次、不变证书不reload、served指纹不符恢复旧link且重载旧版本、nginx语法失败保持旧版本；真实域名reload测试单独记录，不把fake证书当生产续期。
- 实际退出新LAN Nginx进程（nginx -s quit），同一LAN容器自动恢复，RestartCount0→1、StartedAt2026-11-21T07:58:05.284913332Z。公网原入口前/恢复期间/后都200、公网CF地址、TLS verify0；没有对原app/DB/Worker/Tunnel发送重启命令。新入口恢复后certificate check healthy。主机phase9-ingress-recovery.json保留。OS启动/网络就绪顺序仍未经重启验证。
- 历史68bytes PNG通过真实页面原件下载，SHA bf3136761ef7d071d9505b8f774dc887ebce09be35b44fd8f18f08b401af7174与DB一致；IHDR/IEND CRC正常、**IDAT CRC无效**。原app容器中相同sharp严格解码独立读取该文件报vipspng: libpng read error。证实旧图严格解码拒绝，与LAN代理无关；未改原文件/关系/历史版本。
- 仅此前独立合成草稿追加8MiB纯合成TXT，附件bd0c4b19-f09c-46ad-b3c0-612948ec47ac。实际8388608bytes，上传201/下载200，SHA256 **b4c874691ade82276b59d506a8e6d6d7ba69e7e71d52aafd3a21049798fe46e8**一致，4个附件响应全LAN/secure、0loadingFailed。声明100MiB+1的匿名请求在发payload前返回413，未业务写入；没有实际上传整个100MiB上限，不称全上限压测。PNG和TXT及合成草稿保留必要证据，不改正常业务订单或清理旧附件。
- 新匹配40样本归档stability-measurements.json，各10/10、200/15946bytes/0重定向，当前app仍0752。冷CF TCP243.861/TLS303.925/TTFB1914.782/P953730.423/Total2143.862ms；LAN5.194/34.440/57.228/74.605/61.081。复用TTFB855.658→11.169、Total1171.951→14.750ms，各9复用。CF临时测速IP来自此次服务器DNS答案104.21.26.56/172.67.135.143，不写入生产配置；绑定WLAN的邻近trace AMS/CN，默认和显式7888到www.cloudflare.com为KHH/TW。不是独立外网证据，旧失败仍保留。
- 服务器无Tailscale exit node，直接trace LAX/CN、HTTP2；cloudflared4个HA连接lax05/lax13/lax01/lax10，强制HTTP2、未设region。官方region只有us或global，未硬设亚洲或固定edge IP。region1/2官方DNS名称TCP7844各3次均成功（197–269ms），不是UDP/QUIC握手验收；未重启Tunnel或新建公共quick tunnel。
- 应用server/auth和server/http相对实际0752 source无差异，Secure/HttpOnly/SameSite=Strict、session/RBAC/Origin保留；实际伪造CF身份/Forwarded头匿名请求仍401、错误Origin登录403。Token/私钥/monitor状态属主1000/600，未输出内容。现有DNS Token读取zone WAF和account Access均403/10000；控制台IAB超时后错误页受URL策略阻止读取，未换方式绕过。不能把权限不足当策略不存在，不扩大allow。
- 自动审批审查拒绝执行当前实际TUN管理服务XingchenHelperService重启与WiFi断连/重连，仅返回blocked by policy。整条命令未执行，没有改用其他机制绕过；这两项及OS重启标未验证。手动步骤及原生路由回滚在新维护手册。
- 增加独立Staging public ingress smoke工作流，只在相关PR或人工触发匿名GET/login10次及health/build/trace，GitHub托管runner、固定域名、默认可信TLS、不跟随跳转、不带凭据/不写数据。拒绝私网/Fake-IP/overlay和非CF响应，防止把办公室请求当外网；同job运行route/monitor/隔离发布和public-proof保护测试。不新增自动开发、合并、部署、定时调度或付费服务。新公网探针尚未实际跑，不提前写PASS。

公司Split DNS、地址保留、严格DoH/Mihomo与漫游方案、安全核对/设备值/完整回滚见docs/ops/staging-lan-stability.md。现有公司DNS/路由器/allow均未改；管理员入口和告警渠道尚未答复，服务器sudo执行未回执。D199新用户授权前向补充先独立checkpoint，再按既有守卫冻结确切blob，旧ID/hash不改；此证据checkpoint不单独交付未绑定manifest，下一Phase完成冻结后正常推送一次。

## Delivery Phase10：最终冻结、上游监测和固定快照复验

起点95e0e50eb3ec105956e9411464c6acbaac0355e3/clean，baseline在outputs内；无继承dirty。新D199原文已在该checkpoint，新增staging-lan-stability-decisions-20261121以前向supersedes绑定它，旧全部记录保留。代码续增坏状态/权限及原localhost证书到期监测（当前LAN约89.76天、上游约67.08天），不替换原证书或重启共享网关；当前实际monitor healthy。最终源码守卫及确切交付结果后续追加，不提前称PASS。

Windows完整套件在运行期间跨越文档冻结版本，实际自然完成165测试/163 PASS/2 FAIL/0取消，1874136.457ms；两失败均为使用旧manifest对象读取新版决策文档而报EVIDENCE_WORKTREE_DRIFT=staging-lan-client-decisions-20261121。这是本轮操作顺序错误，不改旧hash消除失败；终止前身份检查发现进程已退出，未终止其他进程。该混合快照不记固定候选PASS。最终提交后建立独立detached测试工作树、依赖只读复用，完整套件只在不再修改的同一提交重跑；实际结果以独立日志/后继Issue回填为准。Linux908的完整Release/Team/Source均成功，但不借为最终新HEAD的全量结果。

08:19:49Z再次只读核验原10容器ID/Image/StartedAt/RestartCount完全一致，Tunnel active；Worker heartbeat08:19:49.141、最新success08:19:40.236/审计08:19:40.545，complete55957（较07:43的55663增加294），failed仍182，enabled/未暂停。这里只读查询，不推进任务。服务器networkd drop-in仍不存在、原临时路线仍在，sudo执行尚未回执；Windows双store配置再次读回一致。共享主机重启发现原Staging五服务/Worker restart policy=no、Linger=no，Worker由既有分钟cron监管；尚未证实原五服务开机恢复owner，不擅改Worker或启动新owner，也不直接请求/执行盲重启。重启前须先审核现有恢复顺序。

新独立外网探针只读固定Staging域名，按实际build-info.json的gitCommit读取部署source；不带凭据/不跟随跳转/不使用固定CF地址，19项Python保护/故障测试及public-proof测试随该workflow执行。证据冻结时最终公网CI/固定Windows套件尚未运行完成，最终结果回链Issue163/PR164；freeze-time pending不伪称已通过。公司设备/告警渠道仍待答复，高风险网络/allow/共享重启未执行。

Phase10当前版本renew-test于08:27:03Z真实再次通过DNS-01测试CA，正式指纹BA:86:F6:67:87:D1:94:38:00:99:67:92:A4:DA:88:02:B8:7C:20:81:C8:22:1C:1B:F2:19:F3:49:6F:0E:43:44前后完全一致。当前19项Python测试Windows15 PASS/4 POSIX SKIP，Linux隔离发布4 PASS；Node public-proof1 PASS、定向eslint和Parser通过。动态global Git proxy只读核实为127.0.0.1:17989/TCP无监听，当前任务7888进程级对照及正式908推送成功；不是证书或认证绕过。新增deliver.ps1只接受无凭据loopback HTTP代理，临时追加/恢复进程环境，全部分支/dirty/祖先/单次push/独立SHA校验仍委托原正式脚本，不修改global/common配置；Parser及非loopback拒绝通过。最终提交后用它执行一次正常交付，不重复失败通道。

Phase10精确源码守卫实际PASS：main10b9a7d827e1c09f152ead58c21f26712d49a619、checkedHead95e0e50eb3ec105956e9411464c6acbaac0355e3加本阶段前向manifest，13pages/68capabilities/0UI/errors=[]。两份PS Parser、19项Python（Windows15/4skip，Linux发布4项独立通过）、Node public-proof1及定向eslint、diff --check通过。后续最终commit将用于独立不变工作树完整重跑和真实Git精确交付；不可在该测试快照中更新文档或manifest。最终SHA、CI/独立公网输出和Windows固定快照结果回链Issue163/PR164，避免为记录自身SHA/后发CI结果制造循环提交。

## Delivery Phase11：Linux非root测试夹具修复

起点69a765f0fe3aa7783047a0af3f8f4950b2fea639 / clean，Phase10正式Git单次push已DELIVERED_VERIFIED/EXACT_HEAD_VERIFIED，远端同SHA。该候选公网CI44885538332在单元测试阶段失败，外网GET尚未执行：fixture仅模拟geteuid=0，但Linux runner实际创建的临时receipt目录属普通用户，正确触发生产脚本Unsafe receipt directory保护。Windows stat默认uid=0未暴露该夹具缺陷。

仅调整test_persistent_route.py：对隔离receipt父目录模拟root uid，其他路径stat仍真实；增加非root目录明确拒绝的反例。生产persistent-route.py及其root所有权/路径保护不变，也不以sudo运行CI掩盖问题。Windows20项16 PASS/4 POSIX SKIP；服务器jackson实际uid1000的独立临时目录完整20/20 PASS，包括4项发布故障测试，不操作真实路由/证书/容器。日志outputs/staging-lan-20261121-phase8/phase11-linux-tests.log。新固定候选将重跑Source/Release/Team/公网CI与不变Windows快照完整套件；69候选未开始完整Windows快照测试，不挪用旧结果。
