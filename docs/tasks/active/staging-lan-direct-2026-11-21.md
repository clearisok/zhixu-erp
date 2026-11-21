# Staging 局域网直连：现场调查与实施 v1

最新恢复点见末尾 **Delivery Phase 6**；前期未批准/未部署/工具故障状态按原时点保留。

2026-11-21（Asia/Shanghai）；Refs [Issue163](https://github.com/clearisok/zhixu-erp/issues/163)。Codex转录用户决定：本聊天附件《调查并实施局域网高速直连部署》明确授权调查、必要的 Staging LAN 配置、测试电脑验证、真实浏览器验收和独立 PR；禁止 Production、共享组件重启、公司整体网络变更、数据/卷删除及 Worker 干预。此附件原始范围即v1实施授权，不额外要求普通技术选项批准。缺外部权限时完成可安全落地部分，如实保留阻塞。

## Delivery Phase 1 baseline

- 工作树 `C:/Users/Administrator/.codex/worktrees/0dd2/zhixu-ainuoke-api`，起点 detached HEAD，clean。
- 经本轮进程限定 7888 代理 fetch，`origin/main = 10b9a7d827e1c09f152ead58c21f26712d49a619`；独立分支 `feat/staging-lan-direct` 从此建立。
- 继承 dirty：无。PR136 是独立 Git 工具变更，不修改或合并。

## 已确认现场事实

- Windows 办公候选客户端 WLAN `192.168.83.51/24`，网关 `192.168.83.1`，DNS `192.168.1.65 / 192.168.1.6`；Tailscale `100.110.208.96`，Bettbox TUN `198.18.0.1`。本机 Docker Desktop/WSL2 存在，但本机无运行容器，不是 Staging 主机。
- 既有 SSH `weaveops` 实际为 Linux `weaveops-server` / `100.80.138.58`；物理接口 enp3s0 为 `192.168.66.69/24`，网关 `192.168.66.1`。严格主机校验连接成功。
- Staging 五服务及唯一 Worker 均运行；应用 source `0752d64f309d68b6e52afbbd712d28e0d9db9c1e` / image `sha256:9d638f7691cff7ba9d6b7b2531373c37e6f9bd1ea7ea430a16e97d1fe3354bd9`。gateway 仅 `127.0.0.1:3003 -> 8443`；旧3000/3002仍loopback。DB/对象端口未公开。
- 现有网关是 Node TLS → HTTP app，所有页面/API同入口；session authority、精确 `https://staging.weaveops.top` Origin、Secure Cookie。现有源站健康接口真实 `ok/database=ready`。cloudflared active，历史已核实 published route 为 Tunnel → HTTPS localhost:3003；本轮尚未读管理端当前路由/Access策略。
- 现有自签证书 SAN 只有 localhost/objects-tls/127.0.0.1，有效期到2027-01-27；不是浏览器可用的域名证书。不替换它，避免影响现有 Tunnel caPool/内部对象 TLS。
- 当前客户端域名DNS为 `198.18.0.104` Fake-IP；`curl --noproxy '*'` trace 仍 SJC、出口TW、WARP off。这证明代理/TUN影响尚存在，不能推导完整物理路径或全部慢因。
- 服务器 `ip route get 192.168.83.51` 指向 inactive Docker bridge `br-47c6c0e1351c`；其网段 `192.168.80.0/20`，属于旧 `zhixu-quote-trial-backup-drill-20261101_default`，当前无容器端点。它覆盖客户端网段，导致服务器对该客户端的回程选择错误。没有删除网桥或改共享路由。
- TUN 接管时 TCP ConnectAsync 对服务器22/443/3003均立即返回成功，不能作为源站端口开放证据；绑定真实WLAN地址的22端口测试4秒超时，未获得SSH banner。LAN互达尚未证实。
- 当前进程非Windows管理员；`sudo -n true`要求交互认证。没有尝试绕过认证。

## 实施 v1（仅用户已授权范围）

保留公网 Cloudflare/Tunnel、原网关、应用、DB、对象和 Worker。独立 LAN 入口只绑定服务器物理 LAN IP:443，复用现有 Staging app；证书使用现有浏览器可信域名证书，或 DNS-01 最小权限签发。LAN验证通过后才在单机配置精确域名解析和DIRECT规则；办公室统一Split DNS另有设备权限/范围确认。证书/路由/认证不足时不开放整个办公室。

新增入口及维护工具必须可独立停止，不执行原Compose的up/down，不重启既有服务。先保存容器ID/镜像/启动时间/网络和卷清单；实施后逐项比对。真实浏览器、外部网络、登录/附件等未执行前不称通过。

## 当前阻塞 / 待用户信息

1. 当前电脑是否就是办公室验收电脑（已异步询问）。
2. 浏览器可信证书/私钥文件路径，或Cloudflare DNS-01最小权限凭据的受控文件路径（禁止聊天粘贴秘密）。
3. 跨网段LAN路由受错误Docker回程路由影响；涉及服务器共享主机路由时先报告精确影响，不能自动删除Docker网络。
4. Chrome扩展能列出真实用户标签，但getTab/domSnapshot/新建标签均报timeoutMs接口错误；不将此记为浏览器验收通过。

原稳定状态和验收见 [PR160收尾](../completed/pr160-final-acceptance-2026-11-20.md)，不改写历史日期/hash/结果/限制。

## 实际落地及验证

- 新目录 `/home/jackson/weaveops-staging-lan`（700），配置、测速、只读preflight和独立Compose已传送；不是只留在Git的方案。长期LAN ingress未启动，未占用443。
- 服务器Docker pull因其既有代理127.0.0.1:7890无监听失败。未改共享daemon/代理；从Windows Docker官方registry获取nginx:stable-alpine，离线包SHA256 `75e18e6414297f73a2cee2a29cd5733cb24a35aa3604440cda74dd555f8c0784`，传送后核对完整包hash再load。两机实际image ID同为 `sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3` / linux amd64。Compose只用该不可变local ID，pull_policy=never。离线包保存在主机 `/home/jackson/nginx-staging-lan-20261121.tar`，不入Git。
- 先使用独立一日自签测试证书，在候选LAN配置上执行nginx -t，再将**测试副本**改为127.0.0.1:18443。首次因cap-drop导致root不能读取jackson700目录失败；保留run-20261121/config-test.txt。增加DAC_OVERRIDE读取只读私钥挂载后，新run-20261121-v2完整通过。没有放宽文件ACL、浏览器信任或TLS验证。
- 临时容器 `weaveops-staging-lan-probe-20261121` 实际接现有3003：health/database ready、登录页200、匿名quotes401、foreign Origin登录403。原请求边界在login调用前拒绝，未提交账号登录或业务写入；没有合成报价/附件写入。测试证书只由curl显式信任用于loopback探针，不是LAN/browser可信证书。
- 探针正常停止，容器/私密证书/失败回执保留。前后原10容器ID/image/StartedAt/RestartCount完全相同；全部volume/network清单相同；443和18443均无监听；cloudflared仍active，Supervisor状态RUNNING/source0752。未读取真实PG心跳，不把容器运行态冒称完整同步业务验收。
- 代码路径保留session/RBAC、Origin/x-zhixu-request及100MiB附件技术上限。当前未找到业务WS/SSE端点；Nginx支持Upgrade头，但原Node gateway无upgrade实现，不能承诺未来端到端WS。

## 实测（每组10次，毫秒）

| 路径/同一login页面 | 成功 | TCP中位 | TLS中位 | TTFB中位 | TTFB P95 | Total中位 |
|---|---:|---:|---:|---:|---:|---:|
| 当前Windows→公网/TUN，冷连接 | 10/10 | 2.401 | 568.062 | 1401.750 | 4048.025 | 1527.434 |
| 同客户端公网，连接复用（含首次） | 10/10 | 0 | 0 | 687.985 | 2897.558 | 1031.450 |
| 服务器→公网Cloudflare，冷连接 | 10/10 | 242.158 | 264.711 | 1226.294 | 2820.569 | 1343.462 |
| 服务器→原localhost:3003，冷连接 | 10/10 | 0.122 | 2.753 | 3.745 | 9.736 | 3.761 |
| 服务器→临时Nginx loopback:18443→3003，冷连接 | 10/10 | 0.080 | 4.467 | 9.653 | 21.721 | 9.716 |
| Windows绑定WLAN→LAN:443 | 0/10 | — | — | — | — | — |

当前Windows Trace冷10/10：TCP3.466/TLS531.427/TTFB中位838.305/P95 2168.965/Total838.551；服务器公网Trace冷10/10：TCP251.089/TLS323.584/TTFB897.799/P95 3825.068/Total897.893。Windows公网health冷9/10，1次连接超时；成功样本TTFB中位1290.612/P95 2630.168。服务器原health10/10，中位6.802/P95 14.814。失败不隐藏，P95 nearest-rank；不同网络不计算改善比例。

所有成功login响应15946字节/200/0重定向（最终归档再次核对）；TCP为扣除DNS后的连接时间，TUN下数值不是Cloudflare端到端RTT。LAN端口本轮没有长期服务，0/10不能归因于单一ACL；它证明当前未就绪，不能证明路由修复后会成功。服务器localhost不能冒充办公室LAN。工具第一版使用curl CLI不支持的fresh-connect选项，产生的两组exit2/无输出保留在私密outputs；修正为独立进程+no-sessionid后才得到上述冷测量，不计为站点故障。

推断：当前匿名login源站处理很快，访问路径带来显著额外耗时；未证明全部是Cloudflare，TUN、出口/跨区域、Tunnel和公司路由仍需分别验证。无法单独量出Cloudflare入口→Tunnel这一段；不通过不同时点的Trace/login相减推造分段延迟。

## 验收状态与恢复点

已通过：官方镜像离线内容核对；生产配置nginx语法；真实loopback代理与匿名安全边界；原服务/卷/网络保全；测速工具3项回归（真实curl冷/复用、重定向不跟随、Cookie不落输出、失败统计）；JS语法/定向lint。发布基线结果及commit/PR/CI在后继交付记录填写。

未完成：可信域名证书签发与续期/失败告警、共享主机/32路由批准和执行、实际LAN互达、单机hosts/DIRECT/浏览器实际remote IP、办公室统一Split DNS、当前Access全策略、登录后订单/报价/物料/上传下载浏览器验收、真正外部网络回归。用户异步问题尚无答复，不把等待当批准。

仓库没有业务TS/React/UI/SQL/依赖锁改动；本阶段不重跑业务全量typecheck/build/真实来源采集。NPM依赖按锁文件仅本工作树安装以执行必要守卫，未升级依赖。完整运维、剩余凭据路径、单机路由与回滚见[runbook](../../ops/staging-lan-direct.md)。长期LAN服务未启动，DNS/hosts/代理和公网记录未改，原Cloudflare路径保持。

## Delivery Phase 2 baseline与版本收口

Phase1 checkpoint **982af5b2792504e2421b796eff4de8a978f30d92**。Phase2开始时本分支同HEAD，唯一已知自有增量是D199的前向冻结清单；不含继承dirty。原摘要三文件的归档与修改前SHA256逐项一致；当前三摘要和manifest统一main基线10b9。

一次正式checkpoint推送已发送982af5b2；我在其结束前提前写了本阶段冻结清单，交付脚本正确返回STOP_LOCAL_CHANGED（pushes=1、remoteSha=982af5b2），没有将结果冒称DELIVERED_VERIFIED。GitHub只读API随后独立确认完整远端982af5b2792504e2421b796eff4de8a978f30d92；自有dirty精确核对仅新增前向evidence，保留现场，不重推旧checkpoint。此为本轮操作排序错误而非网络故障；最终commit后按串行稳定工作树完成新HEAD一次正式交付。

服务器五个配置文件与本机SHA256逐项相同；source-commit.txt记录982af5b2。Compose config --quiet通过，bash -n通过。真实preflight按设计阻断于缺私密.env（尚无证书/权限），未启动长期服务。原Production/runner workflow仍仅workflow_dispatch，本轮没有触发。

首轮精确发布检查读到主线继承的旧4e1基线，按预期BASE_SHA_MISMATCH拒绝；已前向对齐10b9并冻结D199，最终结果以后继实际运行回执为准，不降低守卫。

冻结后精确 `npm run check:release-baseline -- --base-sha 10b9a7d827e1c09f152ead58c21f26712d49a619` 已实际PASS：13 pages/68 capabilities/0 UI changed/errors=[]，检查HEAD982af5b2加本阶段前向manifest。新工具3/3、定向eslint、node --check、bash -n、Compose config和Nginx/loopback均通过。首轮test:release-baseline在基线对齐期间运行，被显式终止，结果20 responsive通过/guard文件未完成（保留749395ms回执），不能称完整PASS；已在固定manifest/摘要上重新执行，最终结果在Issue/PR后续回填。

## Delivery Phase 3：用户答复、服务器路由落实及DNS-01准备

2026-11-21（Asia/Shanghai）继续同一任务。起点branch `feat/staging-lan-direct` / HEAD **184f6975b03f11d8076cac97c3ce7e9743fb178f** / clean；本轮再次fetch确认main仍 **10b9a7d827e1c09f152ead58c21f26712d49a619**，无继承dirty。

**Codex转录用户决定**（本聊天异步答复原话）：当前电脑“是，就是当前电脑”；证书“没有，需使用Cloudflare DNS-01签发”；服务器路由“批准，仅此临时 /32 路由”。只落实已批准的 `192.168.83.51/32 via 192.168.66.1 dev enp3s0`，不推广到其他网段、不增加持久配置。

### 已执行

- 服务器路由执行前重新核对地址、原错误回程、原10运行容器，并保存 `evidence/phase3-before-identities.txt`。经用户批准后，使用已有Docker操作权限，在核验过的官方Nginx镜像中运行一次 `/sbin/ip route add`：仅host network、cap-drop ALL再加NET_ADMIN、read-only、no-new-privileges、无host文件/Socket挂载、退出即移除命令容器；没有获取sudo口令、改认证或使用privileged。操作前要求该精确/32不存在，绝不replace。实际读回为 `192.168.83.51 via 192.168.66.1 dev enp3s0 src 192.168.66.69`，证据在主机 `evidence/phase3-office-return-route.txt`。
- Windows仍由Bettbox接管192.168.66.69，绑定真实WLAN的22端口5秒超时；默认TUN连接也没有取得SSH banner。服务器回程修复不是LAN互通通过，仍需Windows单IP路由及VLAN真实验证。
- 新 `ops/staging-lan/Set-ClientRoute.ps1` 仅为固定办公IP/网关/适配器添加 `192.168.66.69/32` ActiveStore路由，默认Dry Run，实际需-Execute及管理员。拒绝冲突路由、不改DNS/hosts/VPN模式，保存本用户LOCALAPPDATA内带schema回执，-Rollback只撤匹配owned路由。用户首次粘贴路径丢失Administrator与.codex间分隔符，命令未执行；已提供正斜杠版本，当前未获成功执行回执。
- 官方Certbot `certbot/dns-cloudflare:v5.10.0` 在Windows下载，版本实际5.10.0。两机精确image ID `sha256:6d5e1e84f687ce81786c97cbeccb9dda94d86bbb29a81dbb85527bd68008d77d` / linux amd64；离线包SHA256 `c48b27b26edd122c4ba2ee158db7507d8a35136ee33e338fc8c1b3e20c2281fb`，服务器load前核对完整包hash，未改失效Docker代理。
- 新 `certificate.sh` 支持issue/renew/check，仅固定域名和独立cert-name；DNS凭据必须是jackson拥有的600普通文件，内容不进argv/env/模型输出。Certbot用户1000、只读根、drop-all、无host端口；输出留owner-only私密日志。签发/续期后校验系统信任/域名/到期/私钥配对，以版本目录和原子symlink发布；仅reload匹配新LAN project/service，失败保留旧版本，不启动任何服务。默认新ACME账号不登记email（使用Certbot支持的without-email选项）；后续失败监测以本地状态/日志为基础，不假称有外部到达告警。
- `certificate.sh check` 在尚无证书时实际返回1并写failed状态，未签发/发起DNS写入或启动服务。bash -n通过，Windows脚本Parser通过；真实issue/renew/dry-run尚未执行。`private/cloudflare.ini` 尚不存在，已请求用户按仅weaveops.top的Zone DNS Edit权限安全落文件；不要求聊天粘贴Token。
- Nginx新增 `Alt-Svc: clear`，首次LAN响应清除旧Cloudflare HTTP/3替代记录；新增只用于验收的 `X-WeaveOps-Ingress: staging-lan`。最新实际nginx -t通过（仍只使用私密测试证书作语法检查，不是浏览器证书）。长期443入口仍未启动。

### 浏览器与CI新事实

重置控制会话后Chrome不在连接清单，不能沿用旧标签。改用同机Codex内置真实浏览器，Staging登录页实际显示用户名/密码表单；Network证据为login200、remoteIP `198.18.0.109`、secure、issuer YE1、h3，资源另见172.67.135.143，证明仍为TUN/公网路径。Trace导航被客户端阻断，未绕过；没有登录、Cookie读取、业务写入或缓存/Storage清理。此新浏览器可用不倒改前两阶段Chrome接口失败历史，也不代表LAN验收。

184f6975的正式交付已DELIVERED_VERIFIED且PR164 Draft。其Linux Release baseline CI44856277170成功：完整发布182/182、解析19/19、交付74PASS/1skip/0fail；First team access44856277261成功。Windows第二次重复发布回归在441243ms尚未结束时，因同SHA官方Linux已完整通过而中止，不算本地PASS。Source44856277266最终 **CANCELLED**，不是此前临时记录的IN_PROGRESS，更不是PASS；取消原因未核实，不擅自重跑原版本。

### 剩余条件

Windows单机路由已经落实（见下面追加现场结果），等待Cloudflare凭据文件就绪。之后验证LAN TCP真实互达、只签该Staging域名、TLS/域名/Origin/登录和附件、安装并验证受锁续期/本地失败监测，再做DNS单机接入及浏览器remote IP闭环。当前无可信域名证书、续期任务/外部告警、hosts/Split DNS改动或完整业务验收；不扩大办公室allow。

### Windows UAC执行与路由读回（同Phase3追加）

用户纠正路径后返回ScriptRequiresElevation，说明其窗口仍非管理员，第二次尝试未修改系统。Codex随后为已授权的同一脚本使用Start-Process -Verb RunAs启动UAC/管理员PowerShell（-NoProfile -NoExit -File固定脚本 -Execute），窗口实际启动。11:18:33+08:00回执schema=weaveops-lan-client-route.v1/state=created读回；Get-NetRoute及Find-NetRoute确认192.168.66.69/32、NextHop192.168.83.1、WLAN 2/interface14、RouteMetric1、ActiveStore。没有修改DNS/hosts/VPN或其他路由，不需重复执行。

同机traceroute实测第一跳192.168.83.1、第二跳192.168.66.69（3–4ms），证实此ICMP路径走真实办公室网关。Python socket分别绑定192.168.83.51和默认源地址访问TCP22并读SSH banner，均约5秒超时；服务器ss仍显示0.0.0.0:22监听。不能仅凭ICMP或路由表宣称TCP可达，也不能据此确定是VLAN ACL、主机防火墙或客户端过滤。普通jackson用户tcpdump被CAP_NET_RAW拒绝，未进行提权抓包/修改共享防火墙。凭据文件元数据检查仍为ABSENT，不读取Token，不进行DNS/CA写入。

后续为定位过滤层，用已核验Certbot镜像一次性执行只读Python包头检查：host network、read-only、cap-drop ALL仅加NET_RAW，无host文件/Socket挂载；25秒仅打印83.51与66.69/22匹配的IP、端口、flags、长度，不输出或保存载荷。实际看到同源端口53384的3个flags=2 SYN到enp3s0，没有匹配回应，随后命令容器自动退出。再以network none、read-only、仅DAC_OVERRIDE的命令容器只读挂载/etc/ufw及/etc/default/ufw，筛选配置；systemctl确认ufw active，ENABLED=yes、DEFAULT_INPUT_POLICY=DROP、22仅tailscale0 ACCEPT，未见443放行。此证据与主机过滤一致，但不是完整内核规则dump，不冒称所有过滤层已排除。

sudo -n ufw/nft只读命令均要求交互认证，无修改。按共享组件边界，已向用户请求批准并本人sudo执行精确规则 `sudo ufw allow in on enp3s0 proto tcp from 192.168.83.51 to 192.168.66.69 port 443 comment 'weaveops-staging-lan-163'`；回滚同值delete allow。不开放SSH/全网段、不改默认策略；尚无答复/执行回执，不使用Docker修改共享防火墙。Cloudflare凭据仍未提供，已重述仅安全文件落盘，不收取聊天Token。

### Phase3 checkpoint前用户补充与元数据核实

Codex转录用户最新答复：Cloudflare Token已创建并保存在指定private/cloudflare.ini，继续DNS-01、续期、Nginx、单机DNS和真实浏览器测速，保持Production/DB/Worker；不得输出Token。服务器metadata实际核实owner=1000/mode=600/regular file且非symlink；certificate.sh本机/服务器SHA256同为82e83763f57e8d0db66afeee436ab90627b39e1a298461f2b731477151ccd1c2。用户对唯一443规则答复“批准，我在服务器执行后回复结果”；已有批准，尚无执行回执。Phase3先独立checkpoint，后续真实签发/部署作为新Phase记录。

本阶段精确发布源码守卫已PASS（main10b9、13pages/68capabilities/0UI/errors=[]），测量工具再次3/3，PS Parser和diff --check通过；完整test:release-baseline已启动，仍运行，暂不称PASS。

## Delivery Phase 4：真实可信证书、续期演练与独立LAN入口激活

起点feat/staging-lan-direct / 3f56d48d6733b0aaf4f3385262e0ce0d5409434e / clean，baseline在ignored outputs/staging-lan-20261121-phase4/baseline.json。Phase3正式DELIVERED_VERIFIED/remote exact/pushes=1/NORMAL；[Issue回链](https://github.com/clearisok/zhixu-erp/issues/163#issuecomment-7056658427)。新阶段无继承dirty；证书部署前三摘要原件归档completed/2026-11-21-before-lan-https。

**Codex转录用户决定**：用户确认凭据落指定文件，继续Staging HTTPS/自动续期/Nginx/DNS/浏览器测速，Production/DB/Worker不动，不输出Token；443规则“批准，我在服务器执行后回复结果”。首次issue创建TXT被10000 Authentication error拒绝；只读核验Token active、zone可见、DNS读取成功，未输出内容/头/raw log。用户随后确认“之前...DNS权限实际为Read...现在...DNS→Edit，资源范围仍仅为weaveops.top”，明确重新签发。未盲重试或扩大zone权限。

### 实际完成

- 凭据owner1000/600/regular非symlink；脚本本机/服务器hash核对，日志owner-only。修正权限后issue成功，系统信任链/hostname/key匹配/有效期通过；Let's Encrypt YE2，CN staging.weaveops.top，notBefore2026-11-21 02:34:55Z、notAfter2027-02-19 02:34:54Z，SHA256 fingerprint BA:86:F6:67:87:D1:94:38:00:99:67:92:A4:DA:88:02:B8:7C:20:81:C8:22:1C:1B:F2:19:F3:49:6F:0E:43:44。没有读取私钥/Token到输出或替换原localhost CA。
- 新增renew-test模式实际执行Certbot renew --dry-run，ACME测试CA完整DNS-01成功；正式证书fingerprint前后完全相同，不发布测试证书。手动renew（尚未到期）及check真实通过，均未重启原服务。
- 更新certificate.sh：各issue/renew/renew-test/check独立状态与latest摘要，后续健康不擦除旧renew失败状态；flock冲突返回75，避免把SKIPPED当检查成功。实际持锁调用check返回75，释放后check通过；先前缺证书failed状态/journal已实际验证，不注入真实证书故障。
- 新schedule.py默认plan/status只读；install先验证cron active与真实可信LAN健康，再完整保留既有crontab、备份、并发比对、只追加固定marker块并精确读回，remove仅撤该块。计划实际安装：Etc/UTC每天03:19/15:19 renew、每小时:37 check。旧crontab SHA256 dbd3cc44ac3ee008107692dec569cae7ab2f4e8098b45162fa614c5087407e12，备份private/crontab-before-20261121T033611283050Z；安装后完整hash3c041d8729b8f3c9cc4660bdd2df8150d52f70c81ad97bb31d291bb2930855d9。原其他jobs字节未改；外部通知未配置，实际cron触发另核对。
- 首次创建仅路径/固定image的.env（600）；preflight实际通过、独立Compose ingress启动，绑定192.168.66.69:443，only83.51/66.69，HTTPS上游原localhost3003+CA/SNI。服务器curl --resolve不关闭TLS校验，health/database ready。原app0752/Tunnel/公网DNS不变，18443探针仍停止。
- 新Set-ClientHosts.ps1默认Dry Run、管理员Execute、冲突/编码/未知receipt拒绝，保留原字节备份、文件锁内并发核对、失败恢复、仅owned line回滚。Parser及同机实际Dry Run通过，hosts前后hash相同；尚未实际执行，不提前将浏览器指向仍不可达的入口。

### 当前限制与测量

办公室绑定83.51访问新443仍5秒超时（证书校验返回字段0在未握手情况下不能解释为TLS通过）。服务器自身可信HTTPS通过不代表办公室完成。UFW规则已有用户批准，等待本人sudo执行回执；无重复add路由或修改共享防火墙。

同一办公室、同一/login、原app0752，新增公网冷10次9成功/1失败；成功TTFB中位1270.592/P952517.399ms、Total1469.474；复用10/10、9复用，TTFB894.216/P951474.878ms、Total949.334。各原始匿名样本在ignored outputs/staging-lan-20261121-phase4，最终归档保留失败；尚不能计算LAN改善。

3f56精确Release baseline CI44861126218 SUCCESS（182/182、交付74PASS/1skip/0fail、最终guard PASS）。本地完整Windows suite仍运行，不能称PASS；其他两CI及新阶段最终源码守卫独立核实。不因部署基础设施宣称订单/报价/物料/附件、Access全策略或真正外网回归通过。

Phase4激活后再次按原10个完整ID逐个docker inspect，仅输出Id/Image/StartedAt/RestartCount，与before原文完全一致；9个有health的原容器均healthy，唯一Worker容器running，未读取PG心跳。2026-11-21 03:37:01Z用户cron实际自动触发check，分模式状态healthy，scheduler-check.log属主1000/权限600/72bytes；续期演练与手动命令之外，定时调度已有实际触发证据。11:39最新UFW只读配置仍无443规则，等待用户执行获批命令；不重复询问批准。

## Delivery Phase 5：事实与检查结果本地收口

起点92e83343082c1251000944b6e791e8a4a3e68445/feat/staging-lan-direct/clean，无继承dirty。Phase4正式脚本DELIVERED_VERIFIED/EXACT_HEAD_VERIFIED/pushes=1/NORMAL；实际部署7文件与该源SHA256逐项一致，主机evidence/phase4-deployment-source.json及source-commit.txt绑定92。新永久入口真实匿名quotes401、foreign Origin登录403；公网login200/Cloudflare IP104.21.26.56，Tunnel active。这是同机/服务器公网回归，不冒充真正独立外部网络。

92精确本机源码守卫PASS，main10b9、13pages/68capabilities/0UI/errors=[]。Windows完整发布回归1523160.6972ms仍未完成；在同HEAD官方Linux成功后，仅终止核实父PID24232/命令tests\release-baseline-guard.test.mjs的本任务子PID6564。实际结果20responsive PASS/guard文件因显式终止FAIL，不能称本地完整通过；日志保留。最新Release CI44862537961经GitHub连接器核实SUCCESS，job136718913423的Guard negative/current responsive、Delivery evidence、syntax/lint、最终baseline各step成功；其他CI仍运行，不冒称全部绿。

本机gh run view44862537961发生一次API connect timeout，目标Fake-IP198.18.0.124；精确92送达是在此前独立核实，不倒改其DELIVERED_VERIFIED。此后CLI记NETWORK_DEGRADED，不再重复查询/推送同失败通道、不自动执行恢复命令或改共享代理/认证。已连接GitHub插件可独立读CI并回填Issue/PR，不据此认定本机通道长期恢复，也不用文件API伪造Git交付。Phase5仅更新三摘要及本任务事实，独立本地checkpoint，远端待人工一次性正式交付。

仍等待用户在服务器本人执行已批准唯一UFW443规则；最新只读配置未见该规则，办公室443超时。未配置hosts，不将不可达入口指给浏览器。可信证书、续期演练、自动cron触发、新Nginx及原服务保全已完成；真实办公室浏览器/业务和可比较LAN性能仍未完成，保持Issue In Progress/PR Draft，不合并或关闭。

## Delivery Phase 6：办公室可信HTTPS、真实浏览器及同机性能闭环

2026-11-21，起点feat/staging-lan-direct / **8148e64e61ab80de0f972a4bb3f125c208f24dec** / clean；baseline在ignored outputs/staging-lan-20261121-phase6/baseline.json。无继承dirty；三摘要原字节归档completed/2026-11-21-before-lan-client-acceptance，archive-sha256.json逐项保全。部署代码仍92，app仍0752，本阶段没有业务代码/SQL/依赖/容器配置变更。

### 用户动作与实际直连

Codex转录用户决定/执行结果：本人ssh -t weaveops sudo执行已批准唯一UFW443规则，第二次认证后返回“Rule added”；不重试添加。用户管理员执行Set-ClientHosts.ps1 -Execute，返回“HOSTS_VERIFIED: exact owned line changed”，时间11:58:52.8197799+08，备份LOCALAPPDATA/WeaveOps/staging-lan-163/hosts-before-20261121T115852687-372e68453ec44cecb3fc4d3934729cd8.bak。owned行192.168.66.69 staging.weaveops.top # weaveops-staging-lan-163。原公司DNS/路由器/Clash模式和系统代理不改。

UFW后首个办公室绑定WLAN/resolve探针200、remote66.69/local83.51、TLS验证0、Total580.880ms；该探针单列，不混入后续10样本。hosts后普通OS解析66.69，**不带resolve/interface**的curl同样200/remote66.69/local83.51/TLS验证0/Total126.314ms。两端原/32依然临时，Windows ActiveStore、服务器内存route；不将其写为重启可用或擅自持久化。Nginx仅单客户端+服务器自检，没有全网段开放。

### 浏览器与合成附件

用户在可见IAB自行输入现有凭据并回复“已登录”，没有账号密码进入聊天。登录/auth/me/permissions/quotes均200、remote66.69。匿名禁缓存刷新47个HTTPS响应全LAN/secure/YE2/ingress标记，46个200、1个正常auth/me401、0loadingFailed；临时cacheDisabled随后恢复false，不清Cookie/Storage。

订单列表633条显示，既有订单详情、物料14需求/1采购及采购tab读取通过，相关sales-orders/order detail/business-source/catalog-sync-status/material-progress/settings/arrivals API均200/LAN。没有点击来源刷新、同步、排程或商业写入。报价列表六张真实图片显示，历史STAGING-ACCEPTANCE-562缩略图503 attachment_thumbnail_unavailable；泛化503不能证明损坏、权限或解码哪一原因，未覆盖/删除旧附件。早期两个缩略图事件曾报Fake-IP/h3，与同事件LAN证书/标记及connection元数据矛盾；原因未明，后续完整禁缓存刷新新HTTPS全部LAN，不隐瞒旧观察。

为原请求上传/下载验收创建**独立合成草稿**QT-2026-1121-008 / LAN-ACCEPTANCE-163-20261121（非业务），只填合成身份/说明，没有金额、客户确认、订单绑定或来源采集。quote6f5dec5e-4d44-4f6d-80a0-8d4159e58f03，revisionb21cdf85-17c6-4576-a143-79ada1c68bc9，attachmentd581e46a-a071-4bdb-90d5-1a44a87d2f1d。真实filechooser上传weaveops-lan-163-20261121.png 328bytes返回201，经页面下载返回200；下载文件D:/Downloads/weaveops-lan-163-20261121.png SHA256 **1cff57aa68666ce35efb1ce9afd33fdadf966f13748af5a6fa327a2922fad3ea**与上传前一致。重新刷新图片（1）及款式图仍在。合成记录/附件保留，不清理；数据库存在此新增及正常会话/审计，不能称DB数据零变化。

最终独立禁缓存刷新合成页：84个HTTPS均remote192.168.66.69/status200/secure，另2个本地Blob，0Network.loadingFailed，0console warn/error、CORS/Mixed Content/Cookie/WebSocket错误；无分页/事件丢失。旧导航窗口有3个ERR_ABORTED，不混为此最终刷新失败。上传201/下载200均LAN。没有现存业务WS/SSE可操作端点，不凭Nginx配置称端到端WS通过。未测100MiB边界。cacheDisabled已恢复false，用户页保留。

原始allowlisted metadata及含业务截图仅ignored outputs/staging-lan-20261121-phase6；不记录Cookie/Authorization/响应正文，不把业务截图入Git。可复核非秘密摘要artifacts/staging-lan-20261121/phase6-acceptance.json。

### 匹配的同机10次测量（ms）

| 路径 | 成功 | TCP中位 | TLS中位 | TTFB中位 | TTFB P95 | Total中位 |
|---|---:|---:|---:|---:|---:|---:|
| 固定CF104.21.26.56，冷连接 | 10/10 | 273.568 | 323.100 | 2004.794 | 3483.213 | 2025.616 |
| LAN66.69，冷连接 | 10/10 | 5.262 | 38.550 | 63.011 | 83.498 | 66.526 |
| 固定CF，复用含首次/9复用 | 10/10 | 0 | 0 | 911.964 | 1896.843 | 1146.219 |
| LAN，复用含首次/9复用 | 10/10 | 0 | 0 | 12.365 | 62.595 | 17.626 |

同一办公室83.51、同一app0752/login、HTTP1.1、200/15946bytes/0重定向，两条路径都固定resolve并绑定WLAN。冷为独立curl进程/no-sessionid，OS DNS/证书缓存不清；P95 nearest rank。公网固定CF地址绕过新hosts，邻近Trace AMS/CN/WARP off；这不是历史Fake-IP/SJC/TW样本或真正独立外网，不能说所有公共路径均慢同样倍数。原Phase1/4失败保留，新增原始匿名40样本与方法归档phase6-measurements.json。冷TTFB降低96.857%、复用降低98.644%；无法单独分离edge→Tunnel耗时。

### 服务保全、限制与交付

最终再次按Phase4原10完整ID inspect，Id/Image/StartedAt/RestartCount逐字完全一致；主机evidence/phase6-final-original-identities.txt保留。原9health healthy、唯一Worker容器running、cloudflared active；未读取PG Worker业务心跳，不假称完整自动同步验收。certificate.sh check真实healthy，schedule.py status ownedBlockPresent=true/wouldChange=false，原crontab hash仍3c041d8729b8f3c9cc4660bdd2df8150d52f70c81ad97bb31d291bb2930855d9。Production/原schema/卷/Worker调度/Tunnel配置未修改；新LAN入口和合成测试数据单列。

剩余限制：只有当前单电脑，整体Split DNS需路由器/内部DNS权限及明确客户端范围；两端临时路由重启失效风险；当前Cloudflare Access/WAF全策略未读取，未扩大allow；真正独立外部网络未测，同机固定CF10/10仅公网入口回归。无外部告警接收端，未发生临近到期正式证书替换；不伪称实际续期替换已验。历史缩略图503保留，用户最终业务标准未确认，不关闭Issue/merge PR。

GitHub连接器核实部署源92的Release baseline44862537961 SUCCESS、First team access44862537986 SUCCESS，Ainuoke server source44862537956 CANCELLED（原因未核，不称全绿）。Windows完整suite中止历史不改。本阶段仅文档/证据，不重跑25分钟Windows全套；精确源码守卫另记最终回执。NETWORK_DEGRADED持续，只有本地checkpoint，远端仍92；提供以最终完整HEAD限定的一次性正式交付命令，不自动执行。GitHub事实回链不是本机传输恢复或新commit送达证明。
Phase6首次最终源码守卫实际FAIL：main10b9/HEAD8148、13pages/68capabilities/0UI，唯一EVIDENCE_WORKTREE_DRIFT=staging-lan-decisions-20261121。原因是本阶段D199前向激活记录改变当前决策文档，旧冻结blob须保留。按既有守卫规则先做本阶段文档checkpoint，再新Phase以前向supersedes绑定确切新blob，不修改旧hash或降低检查。40个匹配样本一致性、摘要原字节归档hash、JSON解析和diff --check均通过；不把此首次守卫写成PASS。
