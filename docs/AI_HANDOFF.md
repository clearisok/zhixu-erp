# 接力：Issue174 同一PR收口必要门禁，第三阶段未执行

2026-11-26；branch **feat/issue174-storage-v2**，main **10b9a7d827e1c09f152ead58c21f26712d49a619**。先读[当前状态](CURRENT_STATE.md)、[阶段三执行单](tasks/active/issue174-staging-phase3-ready.md)、[已接受前两阶段结果](tasks/active/issue174-v2-phase12-results.md)及[Issue174最新交付/CI评论](https://github.com/clearisok/zhixu-erp/issues/174)。精确最终HEAD以Git/PR176最新核验为准；不把本文件检查点的CI进度当永远的状态。

用户已接受一/二阶段，本轮仅Git交付、保全PR172/173及准备，不扩展业务。文档[PR175](https://github.com/clearisok/zhixu-erp/pull/175)/dee3三CI成功；统一工程[PR176](https://github.com/clearisok/zhixu-erp/pull/176)保留所有旧提交。PR172精确a0a9c78c6cccbadf5e635dbb60169f7f87944644、PR173精确da1c2653ae6c53a1527bcee60dbdec734cc36553仍是最新head，52/3非文档路径全同；无自动合并/真实覆盖。

生产代码只在cfe09fdd检查点补完整缺失目录上下文：无物料行也要提交可见性变化，重复缺失复用context且不造物料快照，重现恢复。后续仅修旧测试夹具，保留原业务/权限/损坏/只读断言：关账旧列全比+新引用NULL（14pass）；归属旧列全比+新引用NULL/legacy（45pass）；无变化两次只一run/快照/正文；确认测试先hydrate共享原页。原CI失败04/cfe/343均保留，不弱化SQL或改旧migration checksum消除失败。

本检查点后续工作流本地全部通过：数据库270、归属45、目录106、删除恢复10、来源专项49；连续同步80pass/1Windows skip，另历史读取/规范化/准备/就绪/只读/定向诊断/preflight等分项PASS，类型/lint通过。源门禁182/40路径、组合UI44/历史11及前后端build等保留其原版本结果。[delivery.json](tasks/active/evidence/issue174-storage-v2-20261125/delivery.json)含每份日志hash与范围，不相加作唯一总数。冻结feature/decision文档、manifest ID/截图hash未改；新结果由入口/Issue前向补充。

Git：配置代理/Schannel路径不稳定，仅子进程清代理+OpenSSL/HTTP1.1路径已用现有git-delivery.ps1送达并独立核实，不改共享配置/认证或关闭证书验证。明确Worktree/Branch/ExpectedHead；一个可靠Gate一次push，失败路径不重复。343时索引延迟后已同步、三自动CI触发；最新测试提交还须看最新CI，不用旧Release/Team成功冒充全成功。Issue评论connector曾500，必要时先只读确认未创建，再用同一授权的gh body-file单次回链，避免重复。旧证据[归档](tasks/completed/2026-11-26-issue174-delivery-checkpoints/README.md)。

私密原件 D:\CodexPrivate\issue174-20261124-v2 不进Git；两原PG容器issue174-v2-pg-20261124/issue174-v2-recovery-20261125继续停止、卷/备份保留。原样12.169GB→406.18MB，635订单/13对象只是11/24备份；新切换须停写最新完整配对备份，不能覆新写。旧SQL本机CRLF与原部署GitLF ledger不同，继续精确Git blob migration-runtime，不改59旧checksum。

阶段三计划约3h、预约3.5h，审批前填实新旧Staging目标指纹/端口/实际磁盘、60GB工作预算和候选镜像digest；隔离CLI固定host白名单不放宽，用新manifest/证明在副本选转，再恢复到新PG/对象卷。普通quote_trial运行角色非owner/非superuser，维护owner分开；新source policy.tableCount147/旧145，保全PR173完整解码/pins。owned调度维护hold不得自动启动Worker，其他cron不覆盖。

未经明确批准不切库/删真实历史/启用清理/恢复Worker/退役旧库备份/操作Production/merge。开放新写前可取消，之后先保全新写/附件再v2兼容恢复或前向修复；90天从正式迁移验收成功起算。两轮自然同步/24h观察仍需后续Worker授权，7051旧历史详情不扩大修复。最终CI完成后交用户批准，不重做前两阶段调查或演练。
