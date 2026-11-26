# 接力：Issue174预验收通过，新3.5h窗口已获授权

2026-11-26；branch feat/issue174-storage-v2，Gate baseline a1b36ce85e64ac1bc40d166344f456f1e755c4b5 clean；应用fd84815dee273c0c65b4565961c8d4ffe3bfb764/main10b9a7d827e1c09f152ead58c21f26712d49a619。用户最新授权[转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7184197510)：先408MB候选隔离验收，再直接新3.5h窗口，必须最新一致性配对，不再审批。PR176 Draft不合并，Worker/清理/旧库备份退役/Production禁止。

[实际记录](tasks/active/issue174-staging-phase3-execution-20261126.md)、[隔离证据](tasks/active/evidence/issue174-phase3-20261126/preparatory-acceptance.json)。旧候选147表/5序列/owner/普通角色负权限、全部业务/引用、13附件认证原文、11API/8实际UI页与历史起点通过。原68字节PNG损坏导致缩略图503，线上a0a9同样，原文完整；既有Linux运行缩略图测试PASS，不扩大修复。其他角色未登录，只验证现有权限全量和已有测试。

原12:09–13:41间隔已核实：桌面turn04:10:14Z usage limit失败，05:40:55Z用户继续。不能算DB恢复时间。正式新窗口要独立作业与服务器时钟保护、30min取消余量，不能依赖模型不断在线。此处为准备时状态；以最新执行入口为准，当前维护已进入且源冻结。

私密旧根/data/issue174-phase3-20261126，原配对20261126T023837Z-14573686、旧408MB候选i174-v2、原样/选择库均保留，不盲重跑intent。新根/data/issue174-phase3-20261126b；新project zhixu-quote-trial-i174-v2b、PG container a020819635e8e8277d16421b7c816669a9b3bc4a309b8d09ba097b84cf37bf01、volume同project_data、fp a2e67a21c9594367fc01a94eb5fe38e3e6b4c0589c2d2effde4cece847588b39，0表0clients/runtime absent；新隔离PG issue174-v2-pg-20261126b ID481b50dda5a07c321fed026a745412d5ba5d1e507dd54006dae6d8f3b98bbfe9，独立内部network issue174-v2-internal-20261126b提供固定CLI别名issue174-v2-pg-20261124（未改产品白名单）。新source/overlay/TLS/secret/runtime已准备，不启动Worker；旧fault/pause保留。

本机D:/CodexPrivate/issue174-20261124-v2；phase3b-*.py与phase3b-restore-ops为已批准私密执行胶水，原实现冻结文件保持原SHA，wrapper绑定全新目标。新最新备份/全量原样恢复/选择转换/紧凑恢复/owner ACL/普通角色/所有业务引用/对象/UI/新policy与新source全备份必须重验，不能把预验收冒充最终结果。预览现为LAN nginx仅添加127回环443→候选3004；原192LAN443→旧3003保持正常。正式开窗前应精确恢复原nginx配置并停旧候选writer，保留资源；owned Windows SSH预览PID保存在prep-preview-ssh.json。新正式预览使用原受控入口，避免改共享全局网络/认证。

SSH weaveops=Tailscale100.80.138.58:22/jackson，与Tunnel独立；专项sudo3命令及root文件祖先无普通用户写权限、仅Staging路由再次核实。新root空闲约33.72GB/data915.27GB，预算60GB包含保留旧尝试，root低水15GB。当前cron每日原频率+reviewreason，分钟Workerheld；开窗保存当前cron再hold两块，不能复用前窗crontab。开放新写前记录保守intent；之后不盲回旧库。

182发布回归已PASS，fd三CI成功；本轮仅运维材料。本Gate源码守卫同main PASS（13页/68能力/40UI路径/errors[]），新目标原冻结Restore空库检查PASS；精确远端后更新回执；不把文档新HEAD说成三CI。所有旧日期/hash/失败保留在执行记录，旧取消结果仍有效但等待新授权句已被本轮用户明确替代。


## 最新执行入口：新窗口已进入

准备commit6edfe429aa585c82e653b37f504f6bb321771c63已DELIVERED_VERIFIED，本Phase baseline同hash clean。北京时间14:40:56.938636开窗、18:10:56.938636硬截止、17:40:56.938636取消余量；新root维护window.json和evidence/monitor-status.json为实际时钟。14:40:58公网/LAN503/owned cron两块已隔离，最新配对备份运行中，未切库。Windows独立node driver PID6444，process精确记录phase3b-independent-driver-process.json；events每约20秒写phase3b-driver-events.jsonl。服务器monitor独立15秒无Docker调用采样/截止保护；step.py独占phase.lock，所有阶段正向回执后才继续；原Restore由冻结PS wrapper在本机独立driver调用，lease锁防并发取消。不要重跑driver或有intent的步骤、不要因桌面暂停修改deadline；先看实际状态/终态和失败日志。保留当前owned预览SSH PID34688/forward127443，LAN原配置已精确恢复且旧候选/旧隔离PG停止保留；正式目标预览由独立流程重新建立。新写opening intent前可取消回原库；之后不能盲回旧库。Worker/清理禁止继续有效。


最新备份Gate（baseline c5cbe40a40c9c0ae505cbededf825c9ee14780ee clean）：新pair **20261126T064059Z-9fd043bd** /manifest **63a1901c6dfbfb7bcb9cf5b5eda475cbe69a0383f0fc30942b8d76d4ff053e6e**，145表13对象58文件3,843,034,087bytes，07:04:45正常备份全部门禁通过/源已再冻结，独立driver已自动原样恢复新隔离PG。新/data副本58文件SHA PASS（同机第二物理磁盘，16.470秒，不是offhost）；90天未起算。原冻结库07:06:55Z实际12,335,701,015bytes/145表/其他clients0。看r/evidence/driver-original-restore.json、window-status.json、monitor-status.json；不要重跑有intent作业。窗口deadline仍10:10:56.938636Z，取消点09:40:56.938636Z，不受用户“继续”重置。此时未切库，Worker/cleanup仍OFF。


最新原样Gate（baseline05bd0194656cd092279c1d6d8a190d7cdef4281c clean）：15:33原样全量PASS，恢复1153.971秒、原样12,208,782,359bytes、验证517.257秒；145表5seq13对象与本次fresh pair一致，636单/8报价8修订/13附件13绑定/3账号/223220操作日志。driver已自动select-convert，预计无需人工继续。原样owner修复仅新隔离安全NOLOGIN quote_trial及两个已知独立seq，不改变任何旧业务数据。

重要前向更正：首次预验收orders截图仍骨架、closing仍读取，不能代表已完整渲染。保留旧证据并新增preparatory-ui-follow-up.json；本机phase3b-real-browser.mjs已加强等待真实SO行及12个月关账数据/无错误，产品代码未改。new-source-backup.py还会在备份服务重启后调用post-startup-integrity.py，所有业务数据/引用及quote_center_quote_number_seq/sales_order_number_seq/sales_order_normalization_reviews_sequence_seq必须完全一致。以上脚本均未到执行点，后续必查实际结果，不冒称已通过。窗口deadline10:10:56Z、取消09:40:56Z不变，Worker/清理OFF，原资源保留。


最新选择Gate（baselinefe921971a9ee796054746634953ef9e2e541c134 clean）：15:44:19选择/转换/145旧表全部旧列及必要来源水合/5seq/FK/临时role移除/cleanupfalse PASS（656.755秒）。新selected491,691,031bytes；2165 runs/2167 snapshots/1547 observations/1820 catalogs必要证据，12技术表只未迁入获批旧行，原库未改。epoch2026-11-26T07:37:44.970Z不是切库或真实同步。紧凑63,996,440bytes/SHA51cb91a2e3bf6cace820719114a325c5e22d81327bf2c718860854161c8bc69a完整decode通过并已复制Windows phase3b-restore-ops/backups（全SHA校验），15:45:38独立driver开始原冻结Restore wrapper。e/restore-lease.json=HELD，lease锁不可并发取消；未有local-restore-result前不可认为恢复完成。当前未来角色/对象/实际完整UI/新source备份仍待，全部通过前不能开放新写。看Windowsdriver进程6444与events、phase3b-formal-restore.log（仅wrapper退出后写入）、newroot各driver-result。截止仍10:10:56Z/取消09:40:56Z，不改窗口。旧资源/备份全保留，Worker/清理不启用。
