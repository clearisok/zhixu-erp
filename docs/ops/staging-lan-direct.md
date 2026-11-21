# Staging LAN 入口与恢复手册


## 2026-11-21 Phase6 当前实机状态

当前电脑83.51已可信HTTPS直连66.69，新入口/证书/用户cron实际运行；用户本人已完成单客户端UFW规则与管理员hosts。下面早期调查中的22超时/未见443属于修改前证据，不代表当前443故障。原Tunnel/app/CA不变；公网固定CF入口同机10/10回归。仅单电脑，不是全办公室DNS部署。

**两端/32为临时**：服务器route和Windows ActiveStore重启可能消失，hosts会保留。未授权持久化，重启后不能假设仍可用；需重新核实IP/路由，再由用户决定是否重加或授权持久方案。移动到办公室外时，先用下列UAC单命令撤owned hosts，恢复公网域名解析；不要在外网继续把域名固定到私网。

```powershell
Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -NoExit -File "C:/Users/Administrator/.codex/worktrees/0dd2/zhixu-ainuoke-api/ops/staging-lan/Set-ClientHosts.ps1" -Execute -Rollback'
```

回办公室且确认临时路由/可信443仍可用后，去掉-Rollback即可恢复本任务owned映射。route回滚同一UAC命令把Set-ClientHosts.ps1换为Set-ClientRoute.ps1，仍保留-Execute -Rollback。服务器精确route回滚由用户sudo执行 `ip route del 192.168.83.51/32 via 192.168.66.1 dev enp3s0`，仅核实本任务值后操作。不要更改或删除重叠Docker网桥。

公司统一Split DNS需设备管理员仅为staging.weaveops.top建立192.168.66.69覆盖，公网Cloudflare记录保持。先确定允许客户端和跨VLAN回程、确认Access等效控制，再逐客户端核对可信证书及浏览器remoteIP；当前Nginx/UFW只allow83.51，**仅配置DNS不足以让其他电脑可用**。不给未知品牌路由器猜菜单，不自动扩allow或修改全办公室。

证据：[Phase6测速](../../artifacts/staging-lan-20261121/phase6-measurements.json)、[浏览器及服务](../../artifacts/staging-lan-20261121/phase6-acceptance.json)。合成草稿QT-2026-1121-008及PNG保留；不改旧报价订单。真实业务截图仅本机ignored outputs。历史STAGING-ACCEPTANCE-562缩略图503待另查，不覆盖旧附件。大文件、独立外网、现有Access全策略和未来WS未验，不扩大验收声明。


2026-11-21，Refs [#163](https://github.com/clearisok/zhixu-erp/issues/163)。当前状态：**可信DNS-01证书、续期演练、独立cron和LAN Nginx均已实际运行；单电脑hosts与真实浏览器验收通过**。详细历史/限制见[任务Phase6](../tasks/active/staging-lan-direct-2026-11-21.md)。

## 真实入口与候选结构

当前LAN路径：办公室Windows83.51 → 单机hosts解析 → WLAN2/83.1 → `192.168.66.69:443` → 独立Nginx → **校验原私有CA及localhost SNI** → `127.0.0.1:3003` → 原gateway/app → 原PostgreSQL/对象存储。静态资源、API和附件同入口。浏览器新HTTPS实际远端均LAN，不通过Clash/Fake-IP或Cloudflare公网入口；未更改VPN全局模式。

保留公网路径：其他未配置hosts的客户端 → 公网Cloudflare DNS/入口 → 既有Tunnel → HTTPS localhost:3003 → 原gateway/app。没有复制应用、数据库或第二Worker。当前Access/WAF全策略未复读，不将历史控制台观察冒称本轮读取；独立外部网络未验。历史SJC/TW证据保留，新同机固定CF104.21.26.56回归邻近Trace为AMS/CN。

Nginx独立project为 `weaveops-staging-lan`，文件在 `/home/jackson/weaveops-staging-lan/`；仓库源是 `ops/staging-lan/`。使用host network只绑定物理LAN地址443，不创建Docker网段；初始仅允许测试电脑 `192.168.83.51` 和服务器自检 `192.168.66.69`。不发布80、DB、对象控制台、Docker Socket。入口保留同一Host/Origin/Cookie，API、静态资源、上传下载都走同一代理；不用公网URL作upstream。

配置关闭响应/请求缓冲，保留120秒超时与100MiB现有附件技术上限；不能据此称大文件实测通过。真实IP转发覆盖客户端自报值，不把Cloudflare身份头当LAN身份。当前代码未发现业务WebSocket/SSE端点；Nginx提供Upgrade转发，但现有Node gateway不处理upgrade，未来若新增WebSocket须单独验证整条链路，不能据Nginx配置宣称端到端通过。

## 先解决三项外部前置

1. **网络**：服务器原回程命中旧无端点Docker网桥 `192.168.80.0/20`。用户已明确批准唯一临时/32，已使用一次性、仅NET_ADMIN的命令容器落实下面的等效route add；读回经192.168.66.1/enp3s0。不删除网桥、不改Docker默认地址池，不再重复add。

   ```sh
   sudo ip route add 192.168.83.51/32 via 192.168.66.1 dev enp3s0
   ip route get 192.168.83.51
   ```

   回滚为 `sudo ip route del 192.168.83.51/32 via 192.168.66.1 dev enp3s0`。仅内存路由，重启不保留；不使用replace覆盖未知路由。Windows单IP路由也已落实，ICMP路径已通但TCP22超时，不能保证两条路由已解决应用互达。

2. **证书**：原网关证书仅localhost自签，保留不动。新LAN证书已通过DNS-01签发：Let's Encrypt YE2，staging.weaveops.top，2027-02-19到期；系统信任链/域名/key匹配通过。不要把秘密放聊天、Git、CLI参数或日志。Cloudflare后台为该用途创建 `Zone / DNS / Edit`、仅 `weaveops.top` 的Token；不需Global API Key或账户管理员。Token会具备该zone DNS写能力，不能假称仅可改一个TXT；若组织要求更窄范围，先设计专用挑战子域委派。

   在服务器由本人用编辑器写入 `/home/jackson/weaveops-staging-lan/private/cloudflare.ini`，目录700/文件600，仅一项 `dns_cloudflare_api_token = <本人填入>`，只告知Codex路径。凭据不得提交；用户已创建并落盘，元数据已核对，现已成功用于签发/续期演练，内容不输出。签发客户端使用官方Certbot及dns-cloudflare插件，先固定版本/镜像和私密目录，再仅签 `staging.weaveops.top`。DNS-01只操作挑战TXT，不改变现有公网A/CNAME/Proxy路由。首次因用户误配DNS Read而创建TXT被10000拒绝；Token active且可读DNS，修正DNS Edit后签发及清理成功，不能误报Token无效。依据[Certbot插件官方要求](https://certbot-dns-cloudflare.readthedocs.io/en/stable/)及[Cloudflare Token权限](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)。

   官方Certbot5.10.0固定本地镜像及 `certificate.sh issue|renew|renew-test|check` 已实际运行。首次签发执行 `bash /home/jackson/weaveops-staging-lan/certificate.sh issue`，只签staging.weaveops.top，独立cert-name，不登记ACME email，日志与配置仅存private/acme。它使用flock防重、版本目录和原子symlink；验证系统信任链、域名、key匹配和至少14天有效，且只reload已运行的新LAN服务，不自动启动。失败恢复旧symlink，绝不替换原Staging/internal CA。`check`另验证21天到期门槛与真实LAN健康端点，失败写private/certificate-status.json和本机journal；缺证书拒绝已验证；现有issue/renew/check及renew-test（ACME测试CA真实DNS-01）均已通过，正式证书指纹保持。flock冲突返回75，不能将跳过当健康；各模式有独立status，不由后续healthy覆盖旧renew failed状态。

   `python3 schedule.py install`已安装并完整读回核对本用户cron：服务器Etc/UTC每天03:19/15:19renew、每小时:37check。原用户crontab字节保留并备份private/crontab-before-20261121T033611283050Z，非本任务job不变；status/plan不修改，remove只撤固定marker block。调度日志在private/acme/scheduler-{renew,check}.log，失败写分模式状态和本机journal。renew-test已通过、手动renew/check通过；实际cron已在2026-11-21 03:37:01Z自动触发check，状态healthy、scheduler-check.log为owner1000/600；不是仅手动运行。未配置外部通知接收端。 Cloudflare Origin CA不能作为浏览器可信替代，见[官方说明](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)。

3. **认证/Access**：实际app为session/RBAC，匿名quotes401、错误Origin403已在独立探针确认。仍须核对Cloudflare当前Access/WAF政策以及公司允许的LAN客户端范围；不能默认为绕开Access已获等效认可。策略未解决前不将allow扩至整个办公室。

## 单机DNS和TUN验证

用户已确认当前Windows电脑就是办公室验收客户端。本阶段已由用户管理员添加本任务单域名hosts；公司DNS、路由器、Clash模式/订阅及系统代理未修改。本机WinHTTP direct不代表TUN关闭；7888实际进程名XingchenCore.exe，磁盘上Clash Verge/ClashMi配置并存，不能把其中一份当作Bettbox的实时配置。

以下单机路由已在该电脑**管理员PowerShell**执行，不重复添加；重启后确有需要且重新核实地址时才使用（正斜杠避免复制丢分隔符）：

```powershell
& "$env:USERPROFILE/.codex/worktrees/0dd2/zhixu-ainuoke-api/ops/staging-lan/Set-ClientRoute.ps1" -Execute
```

仅新增192.168.66.69/32→WLAN 2/192.168.83.1 ActiveStore路由，不改DNS/hosts/VPN模式；冲突即停，回执在LOCALAPPDATA/WeaveOps/staging-lan-163/client-route.json。回滚用同一命令加 `-Rollback`，只撤精确匹配的本任务owned路由。首次错误路径和第二次非管理员均未执行；随后通过Start-Process -Verb RunAs弹出UAC启动管理员窗口，11:18:33回执和接口14/metric1路由均已核实。traceroute经83.1两跳到66.69（3–4ms）；SSH仍沿Tailscale，不开放LAN22；该早期22超时不影响现已通过的可信443应用验收。

实际服务器UFW active/ENABLED=yes、默认INPUT DROP；只读配置中SSH仅允许tailscale0、未见443规则。25秒限目标IP/22的包头捕获见3个客户端SYN到enp3s0，无回应；不记录载荷。未修改共享防火墙，已请求用户批准并以服务器sudo执行下列唯一规则，**用户已本人sudo执行，回执Rule added；办公室可信443现已通过，不重复添加**：

```sh
sudo ufw allow in on enp3s0 proto tcp from 192.168.83.51 to 192.168.66.69 port 443 comment 'weaveops-staging-lan-163'
```

回滚精确使用 `sudo ufw delete allow in on enp3s0 proto tcp from 192.168.83.51 to 192.168.66.69 port 443 comment 'weaveops-staging-lan-163'`，先核实规则仍为本任务值。不开放SSH、不改默认策略、不使用ufw disable/reset/reload，不扩到整个网段；原Tailscale SSH和公网Tunnel保留。UFW规则文件与active状态是实际观察，但尚未读取完整内核规则，可信443连通、浏览器登录和附件已在Phase6实际通过；不据此推断全部内核规则或整个办公室。

获准测试电脑已真实LAN互达/可信证书通过，日常可用下列只读验证：

```powershell
curl.exe --noproxy '*' --interface 192.168.83.51 --resolve staging.weaveops.top:443:192.168.66.69 --fail --show-error https://staging.weaveops.top/build-info.json
```

不使用 `-k`。若仍被TUN捕获，要在**实际运行的**代理管理器中为该域名和 `192.168.66.69/32` 配置DIRECT/排除；全局模式不会因添加普通rules就自动按规则分流。具体UI/配置文件归属须现场确认，禁止改错另一个客户端。若用Mihomo，官方[DNS配置](https://wiki.metacubex.one/en/config/dns/)支持hosts与fake-ip-filter；域名真实映射和DIRECT必须同时验证，单独Fake-IP过滤可能仍回到公网解析。

`ops/staging-lan/Set-ClientHosts.ps1`默认Dry Run，实际Parser与Dry Run前后hosts hash一致。办公室可信443和以下管理员执行均已通过；未来如确需重新接入，由用户在管理员PowerShell执行 `& "$env:USERPROFILE/.codex/worktrees/0dd2/zhixu-ainuoke-api/ops/staging-lan/Set-ClientHosts.ps1" -Execute`；回滚同一命令加 `-Rollback`，只撤匹配owned行、保留并发其他变更，LOCALAPPDATA保存原字节备份/receipt。它拒绝冲突域名、未知receipt和不支持编码。2026-11-21 11:58:52+08已由用户管理员执行成功，owned行及备份/receipt核实，不重复执行。最小DNS改变是加入唯一带任务标记的一行 `192.168.66.69 staging.weaveops.top # weaveops-staging-lan-163`；需要Windows管理员，先备份并检查冲突/保留原内容，清DNS后在浏览器验证。若TUN自行解析，hosts仍可能无效；以浏览器实际远端IP和服务器收到的连接为准。当前单机已成功；后续才讨论路由器/内部DNS单域名Split DNS，保持公网Cloudflare记录不变。不要把curl --resolve当浏览器完成。

## 激活与日常检查

以下首次激活已实际执行，**当前服务已运行，不重复preflight/up**；preflight会因443已占用正确拒绝。未来确需重建时先核实原服务状态和授权，只操作本目录新project：

```sh
cd /home/jackson/weaveops-staging-lan
test -e .env || install -m 600 .env.example .env
bash preflight.sh
docker compose --env-file .env -f compose.yml up -d --no-deps --pull never ingress
```

preflight只读验证固定物理IP、回程路由、443空闲、镜像内容ID、证书信任/域名/到期/私钥匹配、现有HTTPS健康、Compose与Nginx配置。它不签证书、不改路由、不启动长期服务，不证明Access策略/客户端/TUN通过。`nginx -t`容器health只是配置与证书可加载性，不代表upstream已就绪。

启动前后比对 `evidence/before-identities.txt` / 当前原10容器ID、镜像、StartedAt、RestartCount；卷和网络逐项不变。检查gateway/app/database/objects健康、唯一Worker与Supervisor RUNNING、Tunnel active；不触发采集、补任务或清暂停。真实PG心跳若未只读查询，不能把container运行态称PG心跳验收。

## 测速及浏览器验收

`node measure.mjs --url https://staging.weaveops.top/login --count 10 --mode cold --label office-lan --output <新的json路径>`；LAN测量加 `--resolve staging.weaveops.top:443:192.168.66.69 --interface 192.168.83.51`。`--mode reuse`用一个curl进程，含首次连接，其余是否复用以connections=0判定。新文件用exclusive create，不覆盖旧失败。输出只含匿名GET计时/端点/状态/字节/连接数，保留失败，P95为nearest rank；不存响应体/凭据/Cookie。

TCP指标为time_connect-time_namelookup；TLS为time_appconnect-time_connect；TTFB/Total是请求开始累计。当前Fake-IP/TUN下TCP只到拦截层，不能冒称办公电脑到Cloudflare真实RTT。保持相同客户端/构建/URL/状态/字节，冷/复用分开。服务器loopback与办公室公网数字只能用来定位，不能计算LAN改善比例。Cloudflare边缘到Tunnel单独耗时本轮无法从curl直接分离，不能拿两个不同时样本相减代替。

浏览器须检查安全证书、登录、订单、报价、物料、资源/API错误、同域Cookie/Origin、实际远端地址；上传下载用用户允许的独立合成记录并核对hash，不污染订单。旧Chrome接口故障历史保留；内置浏览器已由用户正式登录，订单/报价/物料、独立合成附件上传下载及刷新持久化通过；最终84个新HTTPS响应全66.69/200/secure（另2本地Blob），无网络加载失败/控制台错误。下载328bytes SHA256一致。详Phase6证据；历史合成缩略图503仍未解决，不称资源零问题。LAN响应有X-WeaveOps-Ingress标记和Alt-Svc clear，仍须以实际remote IP为准，不能只看标记。外网回归须来自真正外部网络，本机/服务器自请求公网都不能冒充。

## 回滚和故障定位

先撤销测试电脑带标记的hosts/DNS及对应DIRECT例外（只撤本任务增量）；浏览器重新解析后应回现有Cloudflare入口。用 `python3 /home/jackson/weaveops-staging-lan/schedule.py remove` 只撤本任务用户cron block，再停止唯一新入口：

```sh
cd /home/jackson/weaveops-staging-lan
docker compose --env-file .env -f compose.yml stop ingress
```

不运行原项目up/down，不删除任何volume/网络/证书/业务记录，不恢复DB。若添加过上述精确临时/32路由，核对仍为本任务值后按前文del撤销。原Tunnel一直保留，回滚不需重启它。当前新443入口已启动、测试电脑hosts已添加，原Cloudflare访问仍保留；停止的 `weaveops-staging-lan-probe-20261121` 及私密测试证书保留作证据，该探针18443无监听；新长期443须上述stop后确认关闭。

常见诊断：连接超时先查VLAN/回程路由/TUN，不能只信ConnectAsync；证书失败查SAN/完整链/有效期，不关闭校验；502查原3003及CA/SNI；401按正式登录/RBAC处理；403区分Nginx客户端allow与原Origin/标记；上传413保留100MiB边界；公网异常查原Tunnel，不动Production。续期失败保留最后有效证书并修复DNS凭据/出站网络，不静默切自签。
