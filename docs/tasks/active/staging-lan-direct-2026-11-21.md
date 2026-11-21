# Staging 局域网直连：现场调查与实施 v1

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
- 先使用独立一日自签测试证书，在生产LAN配置上执行nginx -t，再将**测试副本**改为127.0.0.1:18443。首次因cap-drop导致root不能读取jackson700目录失败；保留run-20261121/config-test.txt。增加DAC_OVERRIDE读取只读私钥挂载后，新run-20261121-v2完整通过。没有放宽文件ACL、浏览器信任或TLS验证。
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
