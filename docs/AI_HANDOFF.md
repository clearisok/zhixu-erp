# 接力：Issue174预验收通过，新3.5h窗口已获授权

2026-11-26；branch feat/issue174-storage-v2，Gate baseline a1b36ce85e64ac1bc40d166344f456f1e755c4b5 clean；应用fd84815dee273c0c65b4565961c8d4ffe3bfb764/main10b9a7d827e1c09f152ead58c21f26712d49a619。用户最新授权[转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7184197510)：先408MB候选隔离验收，再直接新3.5h窗口，必须最新一致性配对，不再审批。PR176 Draft不合并，Worker/清理/旧库备份退役/Production禁止。

[实际记录](tasks/active/issue174-staging-phase3-execution-20261126.md)、[隔离证据](tasks/active/evidence/issue174-phase3-20261126/preparatory-acceptance.json)。旧候选147表/5序列/owner/普通角色负权限、全部业务/引用、13附件认证原文、11API/8实际UI页与历史起点通过。原68字节PNG损坏导致缩略图503，线上a0a9同样，原文完整；既有Linux运行缩略图测试PASS，不扩大修复。其他角色未登录，只验证现有权限全量和已有测试。

原12:09–13:41间隔已核实：桌面turn04:10:14Z usage limit失败，05:40:55Z用户继续。不能算DB恢复时间。正式新窗口要独立作业与服务器时钟保护、30min取消余量，不能依赖模型不断在线。当前尚未启动新窗口，旧Staging原a0a9继续正常开放。

私密旧根/data/issue174-phase3-20261126，原配对20261126T023837Z-14573686、旧408MB候选i174-v2、原样/选择库均保留，不盲重跑intent。新根/data/issue174-phase3-20261126b；新project zhixu-quote-trial-i174-v2b、PG container a020819635e8e8277d16421b7c816669a9b3bc4a309b8d09ba097b84cf37bf01、volume同project_data、fp a2e67a21c9594367fc01a94eb5fe38e3e6b4c0589c2d2effde4cece847588b39，0表0clients/runtime absent；新隔离PG issue174-v2-pg-20261126b ID481b50dda5a07c321fed026a745412d5ba5d1e507dd54006dae6d8f3b98bbfe9，独立内部network issue174-v2-internal-20261126b提供固定CLI别名issue174-v2-pg-20261124（未改产品白名单）。新source/overlay/TLS/secret/runtime已准备，不启动Worker；旧fault/pause保留。

本机D:/CodexPrivate/issue174-20261124-v2；phase3b-*.py与phase3b-restore-ops为已批准私密执行胶水，原实现冻结文件保持原SHA，wrapper绑定全新目标。新最新备份/全量原样恢复/选择转换/紧凑恢复/owner ACL/普通角色/所有业务引用/对象/UI/新policy与新source全备份必须重验，不能把预验收冒充最终结果。预览现为LAN nginx仅添加127回环443→候选3004；原192LAN443→旧3003保持正常。正式开窗前应精确恢复原nginx配置并停旧候选writer，保留资源；owned Windows SSH预览PID保存在prep-preview-ssh.json。新正式预览使用原受控入口，避免改共享全局网络/认证。

SSH weaveops=Tailscale100.80.138.58:22/jackson，与Tunnel独立；专项sudo3命令及root文件祖先无普通用户写权限、仅Staging路由再次核实。新root空闲约33.72GB/data915.27GB，预算60GB包含保留旧尝试，root低水15GB。当前cron每日原频率+reviewreason，分钟Workerheld；开窗保存当前cron再hold两块，不能复用前窗crontab。开放新写前记录保守intent；之后不盲回旧库。

182发布回归已PASS，fd三CI成功；本轮仅运维材料。本Gate源码守卫同main PASS（13页/68能力/40UI路径/errors[]），新目标原冻结Restore空库检查PASS；精确远端后更新回执；不把文档新HEAD说成三CI。所有旧日期/hash/失败保留在执行记录，旧取消结果仍有效但等待新授权句已被本轮用户明确替代。
