# 当前：可信LAN HTTPS入口已启动，等待客户端443放行和hosts验收

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 已核实；分支feat/staging-lan-direct，Phase4起点3f56d48d6733b0aaf4f3385262e0ce0d5409434e/clean。Issue163、PR164 Draft；仅Staging LAN范围，不合并/关闭需求。用户已修正Token为DNS Edit，仅weaveops.top，并批准单客户端443 UFW规则、等待本人执行回执。

服务器/home/jackson/weaveops-staging-lan实际运行独立weaveops-staging-lan/ingress，192.168.66.69:443；只允许测试电脑83.51和服务器自检，代理原HTTPS localhost:3003并校验原CA/localhost SNI。没有复制app/DB/Worker，没有改公网DNS/Tunnel或原证书；Staging本体仍0752d64f309d68b6e52afbbd712d28e0d9db9c1e。原10容器身份/镜像/启动时间/重启数在激活后再次精确比对无差异，9个原health均healthy、Worker容器running。

DNS-01已真实签发staging.weaveops.top，Let's Encrypt YE2，2026-11-21至2027-02-19，系统信任/域名/key校验通过；私钥/Token只在主机private目录。首次失败已确认为用户原Token误配Read，改Edit后成功，不误报Token失效。renew-test真实ACME测试CA演练通过，正式证书指纹BA:86:F6:67:87:D1:94:38:00:99:67:92:A4:DA:88:02:B8:7C:20:81:C8:22:1C:1B:F2:19:F3:49:6F:0E:43:44未变。手动renew/check通过；crontab原有内容完整保留并备份，新增每天UTC03:19/15:19续期、每小时:37健康检查。分模式状态/journal/私密日志保留失败，本地监测有据；03:37:01Z cron已自动触发check healthy、日志600；无外部通知接收端。

两端临时/32已落实；Windows接口14/WLAN2、经83.1到66.69，traceroute两跳3–4ms。SYN到服务器物理网卡，无22回应；UFW active/INPUT DROP，SSH仅tailscale0、未见443规则。单客户端443规则已批准但尚待用户sudo执行/核实；Nginx服务器自身可信HTTPS health/database ready，办公室443仍5秒超时。未改Windows hosts/DNS/VPN/公司网络；新Set-ClientHosts.ps1仅单域名、冲突拒绝/备份/owned回滚，Parser及Dry Run实测不改原文件。

部署源92e83343082c1251000944b6e791e8a4a3e68445已正式DELIVERED_VERIFIED/exact remote，7个服务器源文件hash一致。该HEAD本机精确源码守卫PASS（13pages/68capabilities/0UI），Release baseline CI44862537961 SUCCESS（完整回归、交付、lint/最终守卫均通过）；其余CI仍待完成。Windows完整套件1523160ms后因同HEAD Linux已成功而中止，仅20 responsive通过/guard因终止失败，不记本地完整PASS。Phase4bash/Python/PS语法、计划安装/原crontab核对、锁冲突退出75、续期演练和服务器真实health通过，不能替代办公室浏览器。新公网冷测9/10（1失败）、TTFB中位1270.592/P952517.399ms；复用10/10、9复用，中位894.216/P951474.878ms，LAN提升仍不可计算。

下一步：核实获批443规则→办公室真实可信HTTPS→用户管理员执行单机hosts步骤→浏览器实际remoteIP、正式登录/订单报价物料/API附件及公网回归→匹配10次LAN测速。Access全策略、真正独立外网和完整业务验收仍未完成，不扩大办公室allow。详[Phase4现场记录](tasks/active/staging-lan-direct-2026-11-21.md)、[运维/回滚](ops/staging-lan-direct.md)；[证书部署前摘要](tasks/completed/2026-11-21-before-lan-https/CURRENT_STATE.md)。

收口：本机gh查询新CI发生一次connect timeout（Fake-IP198.18.0.124），CLI通道记NETWORK_DEGRADED、停止重复同通道查询/推送，不改共享配置；随后GitHub连接器核实92发布CI成功，不据此宣称本机通道恢复。后续仅文档检查收口保存在本地checkpoint，remote代码仍精确92，恢复命令随最终回执提供。
