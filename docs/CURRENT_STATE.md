# 当前：单台办公室电脑 Staging LAN HTTPS 已实机通过

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；feat/staging-lan-direct，Issue163 / PR164 Draft，不合并或关闭。Phase6从8148e64e61ab80de0f972a4bb3f125c208f24dec/clean继续，无继承dirty。[客户端验收前摘要](tasks/completed/2026-11-21-before-lan-client-acceptance/CURRENT_STATE.md)原字节/hash保留。

用户本人sudo添加仅83.51→66.69:443的UFW规则（Rule added），本人管理员执行单域名hosts（11:58:52+08 HOSTS_VERIFIED）。Windows192.168.83.51经WLAN2/83.1直连192.168.66.69:443；普通解析及不带resolve/interface的curl均命中LAN、可信HTTPS。**两端/32路由均临时，重启可能失效**；hosts持久，没有改公司DNS、路由器或VPN模式。只限该电脑，未开放全办公室。

独立/home/jackson/weaveops-staging-lan / weaveops-staging-lan ingress实际运行，代理原HTTPS localhost:3003并校验原CA/SNI；app仍0752d64f309d68b6e52afbbd712d28e0d9db9c1e。Let's Encrypt YE2证书2027-02-19到期；DNS-01正式签发、renew --dry-run、手动renew/check、实际cron自动check通过。原用户cron jobs保留，UTC03:19/15:19续期（北京时间11:19/23:19），每小时:37检查；本地状态/journal/600日志监测，无外部通知接收端。Token/私钥不入Git。

用户真实IAB登录后，订单列表633/既有详情、物料进度及采购、报价列表实际读取通过。匿名新47响应均LAN且可信HTTPS（46个200、正常未登录401）；最终合成页刷新84个HTTPS均66.69/200/secure，另2本地Blob，0加载失败、0控制台警告/错误。新增并保留独立合成草稿QT-2026-1121-008及328字节PNG，上传201、下载200、SHA256一致、刷新持久化。不改既有报价/订单、客户确认、来源刷新；**数据库新增该验收草稿/附件及正常会话/审计**，不称数据完全未变化。

同电脑/同app/login/HTTP1.1，各组10/10、200/15946字节/零重定向：固定Cloudflare104.21.26.56冷TTFB中位2004.794/P953483.213ms、Total2025.616；LAN63.011/P9583.498、Total66.526。复用各9次，TTFB911.964→12.365、Total1146.219→17.626ms。CF对照固定IP并绑定同WLAN，邻近Trace AMS/CN/WARP off，不叫历史SJC/TW路径或真正独立外网。旧失败保留，详[测速](../artifacts/staging-lan-20261121/phase6-measurements.json)、[验收](../artifacts/staging-lan-20261121/phase6-acceptance.json)。

最终原10容器ID/Image/StartedAt/RestartCount精确不变，9原health healthy、Worker running、Tunnel active；未查PG心跳，不等同完整同步业务验收。同机公网入口10/10通过。限制：历史STAGING-ACCEPTANCE-562缩略图503原因未定、不改旧附件；早期2缩略图元数据有Fake-IP/h3矛盾，后续禁缓存刷新新HTTPS全部LAN，未证明旧元数据原因。未有现存业务WS/SSE端点，未验大文件、Access/WAF全策略或真正独立外网。办公室统一DNS和重启持续性未完成。

部署源/已核远端92e83343082c1251000944b6e791e8a4a3e68445、服务器7文件hash一致。该HEAD Release baseline CI44862537961及First team access44862537986成功，Source44862537956取消，不记全绿；Windows完整套件中止、不记PASS。后续仅文档证据本地checkpoint，CLI NETWORK_DEGRADED，远端待人工一次性正式交付。详[任务](tasks/active/staging-lan-direct-2026-11-21.md)、[运维/精确回滚](ops/staging-lan-direct.md)。

Phase6证据checkpoint **8c1863c6398e6bb06075bc08826efa1bc194b831**；Phase7从该HEAD/clean开始，仅按守卫规则以前向supersedes绑定D199新blob，保留旧ID/hash。Phase7最终精确源码守卫PASS（13pages/68capabilities/0UI/errors=[]），原证据完整保留；新本地文档仍REMOTE_PENDING。
