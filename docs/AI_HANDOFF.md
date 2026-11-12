# 物料页staging已上线：等待发布后备份完成

当前本机分支chore/material-staging-delivery-record-20261112从origin/main c5133e9e9e7065dc4fe7672c0c88c75688e0c51f建立，只做交接文档，不再推送纯文档触发CI。main/staging均该SHA，PR145已MERGED，原feature分支保留；8f5b5d89祖先与C1 head代码树一致。源码审计基线6dc17c645215b3eb08e03624effdee2d182b3e1d保留，136明确草稿不merge且冲突。完整[发布记录](tasks/active/material-staging-release-2026-11-12.md)。

## 必须继续的收尾

宁波ROOT=/home/jackson/weaveops-staging-preview，TASK=ROOT/releases/material-dense-release-20261112，SOURCE=TASK/source（真实Git merged-main，未伪造Git提交），RUNTIME=ROOT/runtime/catalog-sync-c5133e9e。project zhixu-quote-trial-staging-562fbf07；仅gateway127.0.0.1:3003公开经原域名。新app720b7d0d/operator f3a64ea5，旧M2镜像/配置/卷均保留。

正在运行 rollout.py backup-new c5133e9e9e7065dc4fe7672c0c88c75688e0c51f，backup ID20261112T085113Z-54a2de65，08:51:13Z开始；不得并行业务HTTP/SQL触碰安静窗口。只读文件status.json确认完成BACKUP_VERIFIED且source相同、originalServicesResumed=true，再执行同helper preserve-pause（不要activate），最后公网/容器/cron和队列保全复核。备份前已通过真实HTTP和浏览器，不重做全量业务测试或源采集。

原源故障catalog_changed_or_over_limit，heartbeat11/11 07:52:35Z；620订单/head，5queued/97历史failed/27053complete。SQL保护及任务保持，不清状态、不登录ERP。supervisor已随版本迁移但保持DISABLED；本机无新源worker、617副本不动。恢复源是另一项需要先核对目录差异的工作。

## 已验证及回执

最终CI source43179738319、team-access43179738090、baseline43179738189全部成功。9显示单测/11显示浏览器、15连续页浏览器、类型/lint/build/精确门禁通过。Windows旧fixture清理失败与过时source取消记录保留，不冒称它们成功。

5订单真实gateway HTTP前后rows全等，620绑定和head哈希全等、0缺快照、原23人工表/3账号/620身份不变。正常登录、匿名401、无DEMO，迁移applied=[]。D1992 30自购8厂供20采购13入库9出运9出库；PI2610-181 15自购3厂供4采购2入库2出运2出库（不能硬套本机旧10项）。PI2605-077另7客供独立保留。

D:/WeaveOps-Local/material-dense-20261111/staging-delivery-20261112（owner+SYSTEM私有ACL）保存前备份51文件离机全hash一致、browser-core-checkpoint.json及browser-result.json、截图与5HTTP原文；正常QA会话已退出，不输出cookie文件。完整公网core+tail通过：30视图、12桌面/缩放/密度组合、采购单位4笔、列/筛选/搜索/展开/明细/到料窗口/匿名登录。测试harness最初有DOM时序、客供计数和Cloudflare统计POST误判，修正后复用core checkpoint，tail退出0；POST仅/cdn-cgi/rum，无业务写或ERP刷新。

本机63054仍只读preview.real-orders，静态构建c1d2538f（状态筛选修复），与main产品树一致；原8f历史/数据保留。

临时Git HTTPS route自有进程63194→SSH SOCKS63189，未改共享配置/认证/TLS；最终Git fetch在宁波使用HTTP/1.1+protocol.version=1成功，将原始M bundle反传本机并正常git fetch，origin/main已同M。收尾应关闭本任务自有临时网络进程；不要改服务器代理或杀其他用户进程。

[原交接全文](tasks/completed/2026-11-12-before-staging-release/AI_HANDOFF.md)保留原时点。
