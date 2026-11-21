# 接力：Staging LAN稳定化最终冻结与待人工项

2026-11-21；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**；继续feat/staging-lan-direct/PR164，不merge或关闭Issue163。用户第二阶段授权已记任务/D199；共享重启、Docker迁移、公司DNS/路由器和allow扩大均未授权执行。Phase9冻结证据95e0e50eb3ec105956e9411464c6acbaac0355e3，Phase10从clean以前向supersedes绑定，不改旧ID/hash。

Windows双store持久路线已实际安装，receipt=LOCALAPPDATA/WeaveOps/staging-lan-163/persistent-route.json。服务器持久脚本已上传/9保护测试通过，但sudo需本人密码、用户未回执，08:19 drop-in仍不存在。不要假称已完成、不要重复改UFW/hosts；给过命令ssh -t weaveops sudo python3 .../persistent-route.py --execute。DHCP地址/MAC和公司DNS值、具体维护/回滚在[长期手册](ops/staging-lan-stability.md)。不重建app，不删旧网络/数据，不改Worker。客户端TUN/WiFi自动测试被审查blocked by policy，不换方式绕过；两端OS未重启。

实际服务证书reload/fingerprint、DNS-01再次dry-run、LAN进程自动恢复/公网隔离、原10容器保全、PG新心跳/成功、8MiB附件双向hash及超限413均已有证据。原Staging五服务/Worker restart policy=no、分钟cron监管，原五服务开机恢复owner尚未证实；共享重启前先审核恢复路径，不能擅自改Worker启动策略。monitor现覆盖原localhost证书（余67天）及LAN证书（余90天）21天告警，不自动换旧CA，无外发接收端。监测新cron:41实际触发若尚未观察需如实区分。

旧测试PNG68bytes的IDAT CRC无效，原app严格解码拒绝，旧原件未动；独立合成草稿QT-2026-1121-008及PNG/TXT保留。WAF/Access API403、控制台超时，不代表无策略；扩大allow前必须管理员只读核对。独立GitHub外网探针无凭据/只GET/拒绝私网，运行结果在最终Actions，不冒称外部用户登录浏览器验收。

908417bef3e0e4e67d5da2263feca68235e1cc38三CI（含Source）已全部成功，正式Git一次push精确交付。旧全局Git proxy17989无监听，当前任务7888工作；用ops/staging-lan/deliver.ps1只作进程级wrapper，所有dirty/祖先/单push/独立SHA校验委托正式工具，不改global/common，不force。最终冻结提交及精确remote/CI在Issue163/PR164回填；冻结时新probe/最终CI待跑，不能仅凭正文更新说送达。

本地长套件跨文档版本，自然完成165/163PASS/2FAIL/0取消（1874136ms），不算固定候选通过，也没终止其他进程。最终在不再修改的独立detached工作树复用锁定依赖重跑，需记录其准确HEAD和日志；不要在测试过程中再改那个快照。原Windows失败及全部历史保留。剩余只有具体权限/执行/审批项及最终测试结果，详[任务](tasks/active/staging-lan-stability-2026-11-21.md)、[验收快照](../artifacts/staging-lan-20261121/stability-acceptance.json)。

Phase10前向冻结源码守卫已PASS（main10b9/13pages/68capabilities/0UI/errors=[]）；最终固定提交的独立工作树完整复验与精确remote/CI结果以Issue163/PR164后继回执为准，冻结时不提前声明。

Phase11从69a765f0fe3aa7783047a0af3f8f4950b2fea639/clean继续（该SHA已正式单次push精确交付）。公网CI44885538332在测试夹具因普通用户tempdir uid不匹配失败，外网步骤未执行；只修fixture和增加非root拒绝反例，生产root检查不变。服务器uid1000隔离完整20/20 PASS；Windows16 PASS/4 POSIX SKIP。新固定候选完整Windows及四CI结果仍须后继回填，旧失败保留。
