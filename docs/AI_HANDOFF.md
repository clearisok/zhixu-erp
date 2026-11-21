# 接力：Issue163，可信LAN入口已启动，等待443/hosts和浏览器闭环

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；feat/staging-lan-direct，Phase4起点3f56d48d6733b0aaf4f3385262e0ce0d5409434e/clean（正式DELIVERED_VERIFIED）；当前Phase4自有增量见git status，无继承dirty。Issue163/PR164 Draft，不合并/关闭。用户原LAN部署授权持续有效，最新明确不改Production/DB/Worker；Token已由Read改DNS Edit仅weaveops.top，单客户端443 UFW已批准、用户说本人执行后回复，尚未获回执。

/home/jackson/weaveops-staging-lan现已实际运行独立LAN ingress，192.168.66.69:443；限制83.51/66.69，原HTTPS localhost3003上游、原CA/SNI/Cloudflare Tunnel不变。Staging app仍0752。preflight/nginx-t及服务器可信HTTPS health/database ready实际通过。不要重复up原项目或改旧容器。两端临时/32已加，Windowsowned回执已读回，traceroute两跳；UFW active/INPUT DROP/22仅tailscale，客户端443仍超时。只能等待/核实获批精确规则，不开放22或全网段、不改默认策略；规则/rollback在runbook。

真实DNS-01签发成功，Let's Encrypt YE2，2027-02-19到期，fingerprint BA:86:F6:67:87:D1:94:38:00:99:67:92:A4:DA:88:02:B8:7C:20:81:C8:22:1C:1B:F2:19:F3:49:6F:0E:43:44。renew-test成功、指纹未变；renew/check成功。certificate.sh使用issue/renew/renew-test/check、flock冲突75、分模式failed状态和journal；私密日志不输出。用户级cron已安装核对，旧内容完整保存private/crontab-before-20261121T033611283050Z；服务器Etc/UTC，每天03:19/15:19renew、每小时:37check。schedule.py默认plan，install先真实健康检查，保留其他job，remove仅本任务block；03:37:01Z cron真实触发check healthy，日志600；未配外部通知。

Windows hosts/DNS/VPN尚未改。新增Set-ClientHosts.ps1（默认Dry Run）已Parser与真实Dry Run hash保全通过；-Execute需管理员，备份/拒绝冲突/receipt owned回滚。用户最新要求hosts或管理员动作给准确步骤，等实际LAN443成功再给一条UAC启动命令，别提前重定向到不可达入口，不自动清浏览器Storage/Cookie。IAB可用但现有登录仍公网Fake-IP，Chrome未连接；恢复CUA须rewriteDocumentation。

3f56发布CI44861126218 SUCCESS（182/182、交付74PASS/1skip/0fail）；其他两个CI仍需核实。本地Windows完整发布测试session90335仍运行、日志outputs/staging-lan-20261121-phase3/release-tests.log，不冒称PASS；旧184f两轮中止历史保留。Phase4运行代码尚需独立commit/push和最终精确guard，避免把未送达代码称交付。

当前两组公网新样本已保存outputs/staging-lan-20261121-phase4/office-public-{cold,reuse}.json：冷9/10（1失败）、复用10/10。尚无可计算LAN改善；历史样本不覆盖新路由/证书。下步核实UFW实际执行、LAN443、管理员hosts、浏览器remoteIP及功能、10次同页冷/复用比较、真正外网回归和保全。详[任务](tasks/active/staging-lan-direct-2026-11-21.md)/[runbook](ops/staging-lan-direct.md)/[前摘要](tasks/completed/2026-11-21-before-lan-https/AI_HANDOFF.md)。
