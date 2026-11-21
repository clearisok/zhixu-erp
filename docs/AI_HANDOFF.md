# 接力：Issue163 Phase3，两端/32已加，等待DNS凭据并定位TCP

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619** 再fetch核实；feat/staging-lan-direct，Phase3起点184f6975b03f11d8076cac97c3ce7e9743fb178f/clean，无继承dirty。用户异步答复已明确：本机192.168.83.51即验收办公室电脑、无现有证书需DNS-01、“批准，仅此临时 /32 路由”。不再询问同一批准。Production/DB/卷/Worker/旧网桥和公司整体网络禁止改动。

实际服务器已加192.168.83.51/32 via192.168.66.1 dev enp3s0，读回源IP192.168.66.69。已有Docker权限+官方固定Nginx镜像，仅NET_ADMIN/host network/只读根/无host文件或Socket/退出删除命令容器执行获批add；先要求精确/32不存在，无replace。回滚只del此精确值。重启不保留。旧10容器ID/image/StartedAt/RestartCount再次一致，Tunnel active，Staging仍0752，443/18443无监听。

Windows首次错误路径、第二次非管理员均无修改；随后Codex用Start-Process -Verb RunAs弹出UAC并实际启动管理员脚本。11:18:33的owned回执state=created已读回，Get-NetRoute/Find-NetRoute确认192.168.66.69/32 via192.168.83.1/WLAN2/interface14/metric1 ActiveStore。traceroute经83.1第二跳到66.69（3–4ms）；源绑定83.51及默认TCP22仍各5秒超时，不代表应用互通或已定位过滤层。脚本默认Dry Run、冲突拒绝、精确owned回滚；不要再要求重复add，不能全局关VPN或改公司DNS。

后续仅NET_RAW命令容器25秒捕获限定IP/22包头，3个83.51 SYN到enp3s0、无回应、无载荷日志。只读挂载/etc/ufw及/etc/default/ufw，确认UFW active/ENABLED=yes/INPUT DROP，22仅tailscale0、未见443规则（非完整内核dump）。sudo -n ufw/nft均要求交互认证。已向用户请求批准并本人sudo执行唯一enp3s0/83.51→66.69/TCP443 allow，用户已批准并将本人执行，待执行回执；精确命令/回滚在runbook，不用Docker改共享防火墙，不开放22或全办公室。

官方Certbot5.10.0镜像已核hash离线导入，固定ID6d5e1e84f687ce81786c97cbeccb9dda94d86bbb29a81dbb85527bd68008d77d。certificate.sh支持固定域名issue/renew/check，owner-only凭据和日志、flock、系统信任/key/到期校验、版本目录原子发布和仅新LAN服务reload；不启动服务。无证书check实际拒绝，PS/bash/Nginx语法及离线DNS插件/参数识别通过；真实签发/续期/dry-run/自动任务仍未执行。脚本首次ACME账户不登记email，未装外部告警。

用户已确认/home/jackson/weaveops-staging-lan/private/cloudflare.ini就绪，元数据核实1000属主/600普通非symlink文件；未输出内容，脚本hash与本机一致。下一阶段开始issue，不读出Token或日志raw。原内部localhost证书绝不替换。Nginx新header和Alt-Svc clear语法通过，但长期LAN入口仍未启动。

Chrome重置后不在连接清单；IAB真实浏览器可用，login表单/200/secure实际看到，Network remoteIP198.18.0.109及172.67.135.143仍TUN/公网。Trace被客户端阻断，不绕过。未登录/读Cookie/清缓存或Storage/写业务。LAN可信HTTPS、Access全策略、单机DNS/TUN、业务功能、真正外网回归均未完成。

184f交付DELIVERED_VERIFIED/PR164 Draft；其Release baseline CI44856277170 SUCCESS（182/182、解析19/19、交付74PASS/1skip），团队44856277261 SUCCESS，Source44856277266最终CANCELLED，原因未核实，不标PASS/不盲重跑。Windows两次长守卫中止不计本地PASS。新阶段提交/检查/CI另核对，不借旧版本结果。

[最新任务Phase3](tasks/active/staging-lan-direct-2026-11-21.md)、[runbook](ops/staging-lan-direct.md)、[批准前接力原件](tasks/completed/2026-11-21-before-lan-route-approval/AI_HANDOFF.md)。下一步签发可信证书，等已批准单IP443规则执行并验证真实LAN TCP；两端路由不要重复add，继续原范围，不重复新建PR/Issue或擅合并。push用正式脚本/进程限定7888、工作树稳定串行执行；共享17989配置保持。
