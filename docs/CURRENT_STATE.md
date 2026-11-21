# 当前：两端临时路由已落实，LAN证书及TCP互通仍待完成

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 本轮再次fetch确认；分支feat/staging-lan-direct，Phase3起点184f6975b03f11d8076cac97c3ce7e9743fb178f、clean。Refs Issue163，PR164仍Draft。用户已答复当前Windows就是办公室验收机、需Cloudflare DNS-01、批准且仅批准服务器临时192.168.83.51/32路由；不影响Production/数据/Worker/共享组件的边界继续有效。

Staging本体仍0752d64f309d68b6e52afbbd712d28e0d9db9c1e，原10运行容器ID/image/StartedAt/RestartCount在本阶段前后再次一致，Tunnel active、443/18443无监听，未改DB/卷/Worker。服务器192.168.66.69现对办公室电脑的回程实际经192.168.66.1/enp3s0；使用既有Docker权限的一次性仅NET_ADMIN命令容器执行用户已批准精确add，无privileged/host文件/Socket挂载，不删除旧网桥或改其他路由。该路由仅内存，重启不保留。

Windows首个错误路径与第二次非管理员执行均未修改路由；随后Codex通过RunAs弹出UAC并启动管理员窗口，11:18:33实际新增192.168.66.69/32→192.168.83.1/WLAN 2/接口14/metric1 ActiveStore，owned回执已读回。traceroute实际经83.1在第二跳到66.69（3–4ms），但源绑定及默认TCP22读取SSH banner仍各5秒超时，原因未定，不能称应用互通。未改DNS/hosts/VPN模式或公司DNS。

后续25秒仅NET_RAW只读命令容器限目标IP/22包头观察到3个83.51→66.69 SYN、无回应；无载荷记录。只读UFW文件及systemctl确认active/ENABLED=yes、默认INPUT DROP，user.rules中22仅允许tailscale0、未见443规则，与超时一致；不是完整内核规则转储。用户已批准并将本人sudo执行enp3s0上83.51→66.69 TCP443放行，待执行回执；尚未改共享防火墙，不开放SSH或改默认策略。

服务器/home/jackson/weaveops-staging-lan已有官方Certbot5.10.0离线核hash镜像与certificate.sh，仅固定Staging域名、私密凭据/配置/日志、受锁签发/续期/检查、系统信任与key校验、原子发布/仅新LAN入口reload。缺证书check实际拒绝、bash语法/离线插件识别通过，未发起issue/renew或安装自动任务。用户确认Cloudflare仅该zone DNS Edit凭据已保存，元数据核实owner1000/mode600/普通非symlink；尚未发起签发；原localhost私有CA不变。Nginx加Alt-Svc clear和验收header，实际语法通过，长期入口未启动。

旧Chrome控制失败历史保留，目前Chrome未连接；同机内置真实浏览器现可用，登录表单显示、login200/secure，但remoteIP198.18.0.109及Cloudflare公网资源，仍非LAN。Trace导航被客户端阻断。未登录、读取Cookie/清Storage或写业务；Access全策略、真实LAN/可信HTTPS/订单报价物料上传和真正外网回归仍未完成。

184f精确发布守卫及Linux发布182/182、解析19/19、交付74PASS/1skip/0fail、团队访问CI通过；Windows两轮重复守卫中止不称本地PASS；该Source CI最终CANCELLED而非PASS。本阶段PS Parser、实际Windows加路由/读回及ICMP路径、bash/Nginx语法和缺证书拒绝通过，签发/续期仍未验证。新提交/交付结果另回填Issue/PR，不借旧CI。

下一步进行DNS-01签发并等待已批准单IP443防火墙规则的执行回执，随后验证真实LAN、签发/续期及失败监测、单机DNS/DIRECT、浏览器remote IP/功能、外网回归；不重复执行已到位的两端路由。完整事实和回滚见[Phase3](tasks/active/staging-lan-direct-2026-11-21.md)/[runbook](ops/staging-lan-direct.md)；[此前摘要原件](tasks/completed/2026-11-21-before-lan-route-approval/CURRENT_STATE.md)。
