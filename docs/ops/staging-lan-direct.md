# Staging LAN 入口与恢复手册

2026-11-21，Refs [#163](https://github.com/clearisok/zhixu-erp/issues/163)。当前状态：**两端临时/32路由已落实，ICMP两跳到服务器、TCP22仍超时；Nginx/Certbot镜像与配置已落盘，DNS-01凭据元数据已核对，LAN入口未启动**。实际证据和阻塞见[任务记录Phase3](../tasks/active/staging-lan-direct-2026-11-21.md)。

## 真实入口与候选结构

现有路径：当前Windows候选客户端 → Bettbox TUN/Fake-IP → Cloudflare SJC → 既有Tunnel（历史路由指向HTTPS localhost:3003）→ Node TLS gateway → app/Web/API → 原PostgreSQL/对象存储。当前控制台路由及Access全策略尚未复读；不将历史控制台观察冒称本轮读取。

候选路径：同一域名的单机/内部DNS → `192.168.66.69:443` → 独立Nginx → **校验原私有CA及localhost SNI** → `127.0.0.1:3003` → 原gateway/app。公网DNS、Tunnel、原网关及内部CA均保留。没有复制应用、数据库或开第二个Worker。真实LAN链路尚未接通，不能把该候选画成已运行。

Nginx独立project为 `weaveops-staging-lan`，文件在 `/home/jackson/weaveops-staging-lan/`；仓库源是 `ops/staging-lan/`。使用host network只绑定物理LAN地址443，不创建Docker网段；初始仅允许测试电脑 `192.168.83.51` 和服务器自检 `192.168.66.69`。不发布80、DB、对象控制台、Docker Socket。入口保留同一Host/Origin/Cookie，API、静态资源、上传下载都走同一代理；不用公网URL作upstream。

配置关闭响应/请求缓冲，保留120秒超时与100MiB现有附件技术上限；不能据此称大文件实测通过。真实IP转发覆盖客户端自报值，不把Cloudflare身份头当LAN身份。当前代码未发现业务WebSocket/SSE端点；Nginx提供Upgrade转发，但现有Node gateway不处理upgrade，未来若新增WebSocket须单独验证整条链路，不能据Nginx配置宣称端到端通过。

## 先解决三项外部前置

1. **网络**：服务器原回程命中旧无端点Docker网桥 `192.168.80.0/20`。用户已明确批准唯一临时/32，已使用一次性、仅NET_ADMIN的命令容器落实下面的等效route add；读回经192.168.66.1/enp3s0。不删除网桥、不改Docker默认地址池，不再重复add。

   ```sh
   sudo ip route add 192.168.83.51/32 via 192.168.66.1 dev enp3s0
   ip route get 192.168.83.51
   ```

   回滚为 `sudo ip route del 192.168.83.51/32 via 192.168.66.1 dev enp3s0`。仅内存路由，重启不保留；不使用replace覆盖未知路由。Windows单IP路由也已落实，ICMP路径已通但TCP22超时，不能保证两条路由已解决应用互达。

2. **证书**：当前原证书仅localhost自签，不能复用于浏览器。用户可提供已有可信域名fullchain/私钥的受控文件路径；否则使用DNS-01。不要把秘密放聊天、Git、CLI参数或日志。Cloudflare后台为该用途创建 `Zone / DNS / Edit`、仅 `weaveops.top` 的Token；不需Global API Key或账户管理员。Token会具备该zone DNS写能力，不能假称仅可改一个TXT；若组织要求更窄范围，先设计专用挑战子域委派。

   在服务器由本人用编辑器写入 `/home/jackson/weaveops-staging-lan/private/cloudflare.ini`，目录700/文件600，仅一项 `dns_cloudflare_api_token = <本人填入>`，只告知Codex路径。凭据不得提交；用户已创建并落盘，元数据已核对，尚未使用Token。签发客户端使用官方Certbot及dns-cloudflare插件，先固定版本/镜像和私密目录，再仅签 `staging.weaveops.top`。DNS-01只操作挑战TXT，不改变现有公网A/CNAME/Proxy路由。具体签发尚未执行。依据[Certbot插件官方要求](https://certbot-dns-cloudflare.readthedocs.io/en/stable/)及[Cloudflare Token权限](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)。

   已准备官方Certbot5.10.0精确本地镜像及 `certificate.sh issue|renew|check`。凭据就绪后执行 `bash /home/jackson/weaveops-staging-lan/certificate.sh issue`，只签staging.weaveops.top，独立cert-name，不登记ACME email，日志与配置仅存private/acme。它使用flock防重、版本目录和原子symlink；验证系统信任链、域名、key匹配和至少14天有效，且只reload已运行的新LAN服务，不自动启动。失败恢复旧symlink，绝不替换原Staging/internal CA。`check`另验证21天到期门槛与真实LAN健康端点，失败写private/certificate-status.json和本机journal；当前缺证书时实际拒绝，未进行issue/renew。

   自动续期任务须在真实签发后安装并验证：每天受锁运行脚本renew，按小时运行check，保留private日志和failed状态；接外部告警需明确接收目的地。**当前未安装任何cron/timer或外部告警，不能称已有运行中的证书生命周期。** Cloudflare Origin CA不能作为浏览器可信替代，见[官方说明](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)。

3. **认证/Access**：实际app为session/RBAC，匿名quotes401、错误Origin403已在独立探针确认。仍须核对Cloudflare当前Access/WAF政策以及公司允许的LAN客户端范围；不能默认为绕开Access已获等效认可。策略未解决前不将allow扩至整个办公室。

## 单机DNS和TUN验证

用户已确认当前Windows电脑就是办公室验收客户端。没有修改路由器、DNS、hosts、Clash模式/订阅或系统代理。本机WinHTTP direct不代表TUN关闭；7888实际进程名XingchenCore.exe，磁盘上Clash Verge/ClashMi配置并存，不能把其中一份当作Bettbox的实时配置。

以下单机路由已在该电脑**管理员PowerShell**执行，不重复添加；重启后确有需要且重新核实地址时才使用（正斜杠避免复制丢分隔符）：

```powershell
& "$env:USERPROFILE/.codex/worktrees/0dd2/zhixu-ainuoke-api/ops/staging-lan/Set-ClientRoute.ps1" -Execute
```

仅新增192.168.66.69/32→WLAN 2/192.168.83.1 ActiveStore路由，不改DNS/hosts/VPN模式；冲突即停，回执在LOCALAPPDATA/WeaveOps/staging-lan-163/client-route.json。回滚用同一命令加 `-Rollback`，只撤精确匹配的本任务owned路由。首次错误路径和第二次非管理员均未执行；随后通过Start-Process -Verb RunAs弹出UAC启动管理员窗口，11:18:33回执和接口14/metric1路由均已核实。traceroute经83.1两跳到66.69（3–4ms）；默认及绑定83.51的TCP22仍超时，不能称LAN应用验收通过。

实际服务器UFW active/ENABLED=yes、默认INPUT DROP；只读配置中SSH仅允许tailscale0、未见443规则。25秒限目标IP/22的包头捕获见3个客户端SYN到enp3s0，无回应；不记录载荷。未修改共享防火墙，已请求用户批准并以服务器sudo执行下列唯一规则，**用户已批准、待本人执行回执**：

```sh
sudo ufw allow in on enp3s0 proto tcp from 192.168.83.51 to 192.168.66.69 port 443 comment 'weaveops-staging-lan-163'
```

回滚精确使用 `sudo ufw delete allow in on enp3s0 proto tcp from 192.168.83.51 to 192.168.66.69 port 443 comment 'weaveops-staging-lan-163'`，先核实规则仍为本任务值。不开放SSH、不改默认策略、不使用ufw disable/reset/reload，不扩到整个网段；原Tailscale SSH和公网Tunnel保留。UFW规则文件与active状态是实际观察，但尚未读取完整内核规则，真实443连通仍须签发和入口启动后验证。

获准的测试电脑，在真实LAN互达和证书就绪后先运行：

```powershell
curl.exe --noproxy '*' --interface 192.168.83.51 --resolve staging.weaveops.top:443:192.168.66.69 --fail --show-error https://staging.weaveops.top/build-info.json
```

不使用 `-k`。若仍被TUN捕获，要在**实际运行的**代理管理器中为该域名和 `192.168.66.69/32` 配置DIRECT/排除；全局模式不会因添加普通rules就自动按规则分流。具体UI/配置文件归属须现场确认，禁止改错另一个客户端。若用Mihomo，官方[DNS配置](https://wiki.metacubex.one/en/config/dns/)支持hosts与fake-ip-filter；域名真实映射和DIRECT必须同时验证，单独Fake-IP过滤可能仍回到公网解析。

最小DNS改变是在已授权测试电脑hosts中加入唯一带任务标记的一行 `192.168.66.69 staging.weaveops.top # weaveops-staging-lan-163`；需要Windows管理员，先备份并检查冲突/保留原内容，清DNS后在浏览器验证。若TUN自行解析，hosts仍可能无效；以浏览器实际远端IP和服务器收到的连接为准。成功后才讨论路由器/内部DNS单域名Split DNS，保持公网Cloudflare记录不变。不要把curl --resolve当浏览器完成。

## 激活与日常检查

当前文件/镜像已准备，**不要在前置未解决时直接up**。解决前置后只操作本目录新project：

```sh
cd /home/jackson/weaveops-staging-lan
cp .env.example .env
chmod 600 .env
bash preflight.sh
docker compose --env-file .env -f compose.yml up -d --no-deps ingress
```

preflight只读验证固定物理IP、回程路由、443空闲、镜像内容ID、证书信任/域名/到期/私钥匹配、现有HTTPS健康、Compose与Nginx配置。它不签证书、不改路由、不启动长期服务，不证明Access策略/客户端/TUN通过。`nginx -t`容器health只是配置与证书可加载性，不代表upstream已就绪。

启动前后比对 `evidence/before-identities.txt` / 当前原10容器ID、镜像、StartedAt、RestartCount；卷和网络逐项不变。检查gateway/app/database/objects健康、唯一Worker与Supervisor RUNNING、Tunnel active；不触发采集、补任务或清暂停。真实PG心跳若未只读查询，不能把container运行态称PG心跳验收。

## 测速及浏览器验收

`node measure.mjs --url https://staging.weaveops.top/login --count 10 --mode cold --label office-lan --output <新的json路径>`；LAN测量加 `--resolve staging.weaveops.top:443:192.168.66.69 --interface 192.168.83.51`。`--mode reuse`用一个curl进程，含首次连接，其余是否复用以connections=0判定。新文件用exclusive create，不覆盖旧失败。输出只含匿名GET计时/端点/状态/字节/连接数，保留失败，P95为nearest rank；不存响应体/凭据/Cookie。

TCP指标为time_connect-time_namelookup；TLS为time_appconnect-time_connect；TTFB/Total是请求开始累计。当前Fake-IP/TUN下TCP只到拦截层，不能冒称办公电脑到Cloudflare真实RTT。保持相同客户端/构建/URL/状态/字节，冷/复用分开。服务器loopback与办公室公网数字只能用来定位，不能计算LAN改善比例。Cloudflare边缘到Tunnel单独耗时本轮无法从curl直接分离，不能拿两个不同时样本相减代替。

浏览器须检查安全证书、登录、订单、报价、物料、资源/API错误、同域Cookie/Origin、实际远端地址；上传下载用用户允许的独立合成记录并核对hash，不污染订单。旧Chrome接口故障且当前未连接；内置浏览器现可用，真实login200/secure但remoteIP为198.18.0.109及Cloudflare公网地址，仍未执行LAN登录后验收或上传写入。LAN响应有X-WeaveOps-Ingress标记和Alt-Svc clear，仍须以实际remote IP为准，不能只看标记。外网回归须来自真正外部网络，本机/服务器自请求公网都不能冒充。

## 回滚和故障定位

先撤销测试电脑带标记的hosts/DNS及对应DIRECT例外（只撤本任务增量）；浏览器重新解析后应回现有Cloudflare入口。再停止唯一新入口：

```sh
cd /home/jackson/weaveops-staging-lan
docker compose --env-file .env -f compose.yml stop ingress
```

不运行原项目up/down，不删除任何volume/网络/证书/业务记录，不恢复DB。若添加过上述精确临时/32路由，核对仍为本任务值后按前文del撤销。原Tunnel一直保留，回滚不需重启它。当前长期入口尚未启动且DNS/hosts未改，因此本轮结束时原访问路径本就保留；停止的 `weaveops-staging-lan-probe-20261121` 及私密测试证书保留作证据，无端口监听。

常见诊断：连接超时先查VLAN/回程路由/TUN，不能只信ConnectAsync；证书失败查SAN/完整链/有效期，不关闭校验；502查原3003及CA/SNI；401按正式登录/RBAC处理；403区分Nginx客户端allow与原Origin/标记；上传413保留100MiB边界；公网异常查原Tunnel，不动Production。续期失败保留最后有效证书并修复DNS凭据/出站网络，不静默切自签。
