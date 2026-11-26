# 接力：Issue174 Staging维护已开始，最新原始备份已验证，隔离原样恢复中

2026-11-26；branch feat/issue174-storage-v2，起点7863d0aa3e53ccdca52f80a0c9a01f195d984816 clean；应用候选仍fd84815dee273c0c65b4565961c8d4ffe3bfb764，main10b9未变。[当前执行日志](tasks/active/issue174-staging-phase3-execution-20261126.md)、[用户专项sudo及直接续做决定](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7180928896)、[原批准执行单](tasks/active/issue174-staging-phase3-ready.md)。此前权限阻塞已经解决，不再求批。

**维护已经生效，不可当作旧Staging仍开放。** 10:37:07北京时间开始，14:07:07绝对截止，13:37前保留30分钟取消余量，窗口不得重置。LAN nginx原配置保全后添加return503并由独立新请求确认，公网Staging-only cloudflared已用专项sudo停，停后新Tailscale SSH22连接成功；两个owned cron块有逐行hold、其余字节保留，Worker保持停止。服务unit/drop-in/executable/token及父路径root控制，未发现用户可写执行/Env/hook入口，不改系统安全配置。

原Supervisor持原锁、原executor于02:38:37Z正常取得最新原始配对备份 **20261126T023837Z-14573686**，03:02:43Z完整PASS，manifest SHA **85bc4166743272cbbbcdca71379ef2c9ebeeab9e782aec1113bb4a95fae9dd25**。145表/13对象/58文件/3,843,034,120bytes，全量前后摘要/完整归档decode/文件hash/cleanup与服务恢复证明均通过，历史failure未改。随后旧app/gateway/objects立即按原trial maintenance-db再次冻结，只有旧PG运行，外部入口始终hold。fresh-backup.json为当前权威；旧window-failure是历史已保留事件。

第二物理磁盘/data副本逐文件核实完成，仍是同机，不冒充offhost；原样恢复job从03:04:55Z进行中。只启动过isolated.py restore-original，有intent，**禁止重复执行**。等待isolated-restore-original-result.json state LATEST_ORIGINAL_RESTORED，之后verify-original→select-convert→compact。当前无选择、转换或最终库正式数据。

服务器私密根 **/data/issue174-phase3-20261126**；状态 `evidence/window-status.json`、原备份status.json及 `evidence/continue-backup-result.log`；`maintenance/window.json`有绝对deadline/newWritesOpened=false。最初nginx reload后的即时观察尚未激活而正确停止，原window-failure.private.txt是已保留旧事件；当前作业是isolated.py restore-original，不能把旧文件存在当成本次备份失败。所有配置/历史failure/cron/LAN原字节在maintenance私密保存。当前数据源仍旧库12.336GB/145表/max60/636单/13对象（这些是维护前计数），未改旧数据。

候选app776effff…/operator6e0f4b2c…/build staging-i174-fd84815d已冻结；新空PG project zhixu-quote-trial-i174-v2、container8b8bb05a…、Docker target fingerprint a326d8d6f36e69cafa57318f88c73b947ae8404b6fe4d42174be623991d9f79c；同机隔离issue174-v2-pg-20261124/container69e63582…已按原ID/挂载启动，internal/no ports。/data约933GB、60GB隔离预算，root约38GB/15GB低水位，旧资源不算可回收；最终PG仍标准独立卷，不放宽driver_opts门禁。

下一步 **等待已启动restore-original结果，禁止重复执行**；该作业执行私密 `python3 isolated.py restore-original`：先将本次完整原始配对包复制到/data第二物理磁盘并全hash核实（不冒充offhost），再原样恢复；之后逐步 `verify-original`→`select-convert`→`compact`。每个phase有不可重复intent，失败先核实，不盲跑。isolated.py复用现有restore verifier/固定CLI白名单，用本次fresh manifest/证明、严格145表inventory和原LF SQL；原样库issue174_original，选择库issue174_selected_phase3_20261126。副本以外不筛选/删数据。所有private日志/proof在evidence/migration及isolated-*-result.json。

新TLS/受管输入在runtime/tls/backups目录准备，证书字节相同，原pause/fault保留；不创建或启动Worker。新source CLI fingerprint包含实际DB地址，必须在最终新精确目标/普通quote_trial角色上以原 `--check`只读重算，再绑定runtime/identity/policy，不能沿旧物理地址指纹。新role用已批准runtime-role.sql创建NOLOGIN，受管密码单独启用、非owner/superuser/createrole/bypassRls/维护成员；按原role/database作用域保留enable_presorted_aggregate=off，旧库不改。

实际目标quote_trial不在隔离CLI白名单，禁止放宽：先隔离selected完整业务/原proof验证，再把compact全147表/5序列的完整行SHA多重集合与实际目标逐项等价，另验FK/trigger/ownership/附件，形成传递证明。已有Restore-Zhixu.ps1会--no-owner/--no-privileges，恢复后必须从精确compact包恢复维护owner/ACL并比对，不能把其单独完成当安全PASS。本机PowerShell须用进程级DOCKER_HOST=ssh://weaveops并独立正向核实远端Docker、target fingerprint；不得误用默认桌面Docker。私密frozen restore ops+backups放D:/CodexPrivate，不把真实dump放工作树或Git。

开写前全部业务/引用/附件/普通角色/RBAC/候选UI门禁及目标预算通过；新source policy147/旧145、精确工具/pins保持，Worker/清理继续关闭。所有门禁PASS才开放入口/写入，之后先保全新数据再兼容恢复/前向修复，禁止退冻结旧库丢业务。原始配对90天从未来正式迁移验收成功起算，旧库/卷/备份不退役，PR不合并，Production不动。新库和新source备份尚未完成，不能冒称。

182发布回归已完整182pass/0fail/0skip，1474813ms；不重跑。786文档Release/Team成功、Source45733618658 cancelled；应用fd三完整CI成功独立有效，未改代码。其他旧摘要/原演练证据依[索引](PROJECT_INDEX.md)保留。最新checkpoint/进展回链Issue174，当前Git提交可能仅为运维文档，不把它冒充应用构建SHA。
