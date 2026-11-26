# Issue174：第三阶段执行检查点

> 最新状态（2026-11-26 13:43）：固定窗口已安全取消，原Staging恢复开放，未完成切库。下文早期权限阻塞/进行中状态均为当时记录；以最后“窗口取消”及[证据](evidence/issue174-phase3-20261126/cancelled-window.json)为准。

2026-11-26 08:59 Asia/Shanghai；Refs [#174](https://github.com/clearisok/zhixu-erp/issues/174)。[Codex 转录用户原话“执行第三阶段”](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7179037950)，对应[已准备执行单](issue174-staging-phase3-ready.md)。这次授权持续有效，无需再次批准方案。**执行停在维护入口权限门禁，尚未停写、取得新迁移备份或切库。**

## 已完成的实际检查

- 起始 branch `feat/issue174-storage-v2`、HEAD **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，clean。GitHub main 再核实 **10b9a7d827e1c09f152ead58c21f26712d49a619**；PR176 head 精确相同，Source45660958648 / Release45660958709 / Team45660958535 三 CI 全 success。PR172/a0a9c78c、PR173/da1c2653 head 未变，均未合并；本轮没有产品代码更改。
- 实际 Staging 仍为原 a0a9 app image **sha256:a0339f6b74e88a4df7a270d9f4573014e024f2abbf0c07eb082d3e399c32ce9c**。原五服务全部原 ID/image、正常运行；原 Worker 已停止、来源仍暂停。原库 **12,335,701,015 bytes**，145表、ledger59行/max60、636订单、13可用附件、未完成附件0。仅执行必要元数据/小表计数，没有重做容量调查。
- 原库列/键 inventory SHA **28c6a4045851354398fab3c05c77e961c5fad46e4fd36e6fae5e83e5290e2e66** 精确匹配已验收选择器。原 PR173 执行器 SHA **856c5f3c1cfc60b3bd0f3ff7bdd993a5ca71cb693c1159238b748d0c683d062b**、全部 policy pins/源目标检查通过；Supervisor `backup-check` 返回 BACKUP_WORKER_QUIET。只读恢复证据无 unknown、无 lease，因原来源暂停保持阻断，没有清 pause/fault 或启动 Worker。
- 原系统盘最初可用39.114 GB；独立 `/data` ext4 可用933.319 GB。隔离原样恢复/选转采用 `/data/issue174-phase3-20261126`、60 GB工作预算，不移动 Docker 根目录或旧卷。现有 trial 明确拒绝 volume.driver_opts，因此新正式 Staging PG/对象继续使用标准独立命名卷；未放宽门禁。准备后系统盘可用 **38,485,643,264 bytes**，工作盘 **933,025,439,744 bytes**；系统盘低水位15 GB，最新选择结果产生后、最终恢复前须重新预算原样新备份/紧凑包/目标/WAL/镜像，旧资源不算可回收。
- 通过完整 SHA bundle 在新目录独立检出精确候选；复用已部署构建方式，父镜像/dependency lock逐项一致、`--network=none`，无来源请求。冻结 app **sha256:776effff8f66c652f4ed7694440535f060dbb58d0bb8ea3c63ad0241d95e50de**，operator **sha256:6e0f4b2c033e769cd95ab1b3ade99f544477eda5c81df9821f5337702ed2db9c**，build **staging-i174-fd84815d**；镜像 revision 与内置 build-info 的完整 fd SHA、session/server/writable/snapshot 均核实。此为构建成功，未部署。
- 新 project **zhixu-quote-trial-i174-v2** 的独立空 PG 以维护 owner postgres 初始化，数据库 `quote_trial`，业务表0、其他连接0；尚未创建应用 LOGIN、导入正式数据或运行 init/migration。新 PG container **8b8bb05ad75388fba170cc33a7821a366f0d3af64986ed7e77dc3ac3547e6ab1**；标准卷 `zhixu-quote-trial-i174-v2_data`；指纹 **a326d8d6f36e69cafa57318f88c73b947ae8404b6fe4d42174be623991d9f79c**。新 appsecrets/objectsecrets/objects 卷均有独立 project 标签，未采用旧卷。
- 同机任务隔离容器 `issue174-v2-pg-20261124` / **69e63582198c9b8e42d3699f30fc5164269f8f3a22e4546517b0346d9399e7df** 仅挂本任务新 `/data` 目录，internal 网络/无端口/2CPU/4GiB。已有电脑上的旧演练容器没有重启。新两个 PG 在核实空库/归属后已正常停止，卷、凭据和构建保留。

## 唯一当前阻塞与恢复入口

现有 root systemd **cloudflared.service** 从只读 `/config` 证实仅路由 `staging.weaveops.top` 至 localhost:3003，其余404；LAN独立 ingress 同样转3003。但当前 SSH 账号 jackson 没有非交互 sudo 或 systemd Polkit 管理权限。正常配对备份会按原门禁恢复原 app/gateway；因此仅依靠备份临时停服务不能证明维护全程持续阻止公网写入。**没有尝试借 Docker 获取宿主权限、修改安全策略或绕过备份恢复断言。** 已向用户请求现有服务管理入口；需要的是执行能力，不是重新批准迁移。

取得既有授权的 Staging-only Tunnel 管理能力后：先重新核对实际入口/版本/数据/空目标/磁盘/候选 pins，启动且重新检查本任务两个新 PG；保全当前暂停与失败，按既有 supervisor/backup 锁和 owned cron hold、LAN维护及仅 Staging Tunnel 停写进入3.5小时窗口。继续最新完整配对备份→隔离原样恢复/验证→选择与转换→新 PG/对象恢复/ACL与普通角色→完整业务/附件/权限门禁→入口/写入开放→新 source 配对备份。新目标应用角色仍 quote_trial 且非owner/超级用户/维护成员；首次空库的 postgres 不可用于 app。未通过安全门禁不得推进。

源库仍12.336 GB，**整改后实际容量和真实停机时间目前不存在**；11/24的635单/406 MB旧演练不能冒充这次迁移。尚未取得本次最新备份、执行选择转换、验证新库业务引用/附件/RBAC、开放新写或开始90天保留倒计时。Worker、清理继续关闭；旧库/旧卷/备份不退役，不合并 PR、不操作 Production。已批准约3h/预算3.5h不从本轮预检开始计时；真正维护前重新记录开始/取消余量。

私密原件与失败准备日志：服务器 `/data/issue174-phase3-20261126`，本机 `D:\CodexPrivate\issue174-20261124-v2\phase3-*.json`；仅[脱敏预检](evidence/issue174-phase3-20261126/preflight.json)进 Git，不上传配置、凭据、备份、原始业务或临时脚本。旧摘要[按 fd 原字节归档](../completed/2026-11-26-before-issue174-phase3/README.md)。

## 2026-11-26 10:38：权限门禁通过，维护窗口已开始

[用户补齐三项专项sudo并授权直接续做](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7180928896)。实际精确stop/start/restart规则均列出，start无操作成功；unit/drop-in/binary/token及父目录root控制、无用户可写执行或环境hooks。有效root drop-in固定既有http2，不修改服务配置。只读Tunnel配置仍仅Staging→localhost3003/其他404；SSH直连Tailscale22、无Tunnel单元依赖，停Tunnel后新SSH连接再次成功。未通过Docker或其他方式提升宿主权限。

旧目标网仅五服务，唯一业务发布为127.0.0.1:3003，app/PG/objects/objects-tls均无宿主发布端口。原两个owned cron块逐行加维护hold，其他块字节保留；原pause/fault/配置/历史failure原件及hash私密保全。LAN原配置保留并添加维护503，nginx reload返回后首个观察尚未生效，门禁正确停止；独立新请求连续503后才继续停Tunnel，没有降低断言或提前取备份。

维护从 **2026-11-26T02:37:07.655231Z（北京时间10:37:07）** 起算，截止 **06:07:07Z（14:07:07）**，最迟05:37Z前保留30分钟取消余量，不能重置窗口。02:38:36Z确认LAN503/Tunnel inactive/两owned cron hold/Worker未运行；02:38:37Z原Supervisor/原executor正常受锁开始最新完整配对备份 **20261126T023837Z-14573686**。当前备份进行中，**不是备份PASS、迁移PASS或切换完成**。无旧数据删除、清理启用或Worker恢复。

新两个任务PG按原ID/挂载正向核实后已启动；仍无正式数据导入/新app启动。新TLS及runtime输入在任务私密根准备，TLS字节全同，维护角色与普通quote_trial角色分离仍待恢复后的实际门禁。原运行角色的既有 `enable_presorted_aggregate=off` 将在新普通角色创建后按相同role/database作用域保留；不改旧库。新CLI target fingerprint包含实际DB地址，必须在新精确目标的正常普通角色上用原只读check重新绑定identity/policy，不可沿用旧物理地址的指纹。

上一检查点发布回归实际完成182/182、0fail/0skip（1474813ms）；不重跑。786文档Release45733618665/Team45733618659成功，Source45733618658 cancelled，不能写三CI成功；已构建应用fd完整三CI成功独立有效，本轮没有代码变化。后续切换、业务/附件/普通角色与新source备份结果在本日志前向追加，旧时点记录保留。


## 2026-11-26 11:03：最新配对备份与第二磁盘副本PASS

本Gate baseline branch feat/issue174-storage-v2，HEAD519df143340aa10f4f5a4983de8765dac5dcd983，clean；仅前向更新运维文档。最新配对 **20261126T023837Z-14573686** 于02:38:37.601112Z至03:02:43.254008Z完成（24分5.65秒）。manifest **85bc4166743272cbbbcdca71379ef2c9ebeeab9e782aec1113bb4a95fae9dd25**，145表、13对象、58文件、总3,843,034,120bytes，数据库归档3,824,483,710bytes。首末全量行/序列摘要一致，全部文件hash、TOC与完整SQL解码、originalServicesResumed、cleanup.verified/commandsCertain/commandGroupsExited/dockerExecQuiescent均通过，历史failure.json的hash不变。工具、旧policy/pins不改，原暂停保持。

正常服务恢复证明后，控制程序立即用原trial maintenance-db重新冻结旧app/gateway/objects/objects-tls；公网Tunnel/LAN503/owned调度hold持续保持。原库和原对象未筛选/删除，只有旧PG继续运行。

原始完整配对副本在/data第二物理磁盘逐文件校验（58文件、3,843,034,120bytes、相同manifest）；同一主机，**不是异地或offhost备份**。90天仍从未来正式迁移验收成功起算，不启动退役。03:04:55Z开始任务internal/no-port隔离原样恢复，尚未完成原样核验、选择转换或最终恢复。原样job已有intent，失败先对账，不能盲目重复。

系统盘当时可用34,616,209,408bytes、/data924,540,665,856bytes，保留60GB工作预算与系统盘15GB低水位；采样记录实际PGDATA分配，不将其冒称连续峰值。窗口截止及30分钟取消余量不变。


## 2026-11-26 11:47：最新原样恢复完整门禁PASS

Gate baseline branch feat/issue174-storage-v2，HEAD **8b326c871cd1396998579db5525b57dfb52ae52a clean**。原样恢复含第二副本保存/校验共1191.213秒，DB12,208,897,047bytes。首次全量校验仅5序列集合中两个独立序列owner不同：quote_center_quote_number_seq、sales_order_number_seq为postgres，备份为quote_trial；145表完整行摘要、全部序列值及其他元数据均一致。ALTER TABLE不会转移没有OWNED BY依赖的独立序列。只在隔离副本将这两个owner恢复至已核实NOLOGIN/非superuser/非createrole/非bypassRLS的quote_trial，未改值、原库或原校验工具，保留首次失败与单独修复intent。随后原完整verifier重跑498.972秒，返回 **ORIGINAL_RESTORE_VERIFIED**：145表全部旧列SHA多重集合/5序列元数据精确，13对象配对引用通过。

03:47Z开始隔离select-convert，仍用本次manifest与原样证明，未改固定CLI白名单、实际业务库或放宽断言。尚未宣称选择转换、最终147表、普通角色、对象恢复、真实验收或新source备份通过。公网Tunnel inactive/LAN503/调度hold持续，Worker与清理关闭。仅新增临时127.0.0.1私密TLS验收入口，除登录外拒绝所有写方法，独立请求LAN503/普通业务POST405已核实；最终还原原LAN配置移除此入口。

03:13Z附近SSH短暂timeout，Tailscale控制面在线、LAN仍503，03:17Z新SSH恢复；原因未确认，没有改共享网络/认证/安全配置，也没有重启原样作业。最新配对Gate已[回链Issue](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7181669651)。main10b9/PR172a0a9/PR173da1c再次核实精确未变、均未合并。窗口、取消余量和原保全约束不变。


## 2026-11-26 12:00：选择转换及紧凑归档完整门禁PASS

Gate baseline **1033308e55fed50efa67a111c97337d73ef98b69 clean**。选择复制218.077秒；转换263.742秒，处理2165runs/2167snapshots/1547observations；完整选择、转换、全部正式业务与保留来源proof验证共660.936秒，145旧表全部旧列及5序列通过，所有FK验证、临时converter角色移除和cleanup=false维持。选择工作库491,674,647bytes，仍非最终新库体积。636订单、8报价/8修订、13附件/13引用、3账号、223,220员工操作日志全部保留。12张旧技术表有获批未迁入行，详见[脱敏选择结果](evidence/issue174-phase3-20261126/selected-migration.json)；未对旧库删除任何数据。

紧凑归档6.250秒、63,878,715bytes，完整SQL解码通过，SHA **00f22f8a1a034b7ae16ef5d7642ddb41f5044bb65e803aa0a8ae42fff9cce1c5**。四maintenance函数owner在归档中明确，后续原Restore-Zhixu剥离owner/ACL后仍须恢复与拒绝绕过实测，不能略过。新来源历史epoch **2026-11-26T03:51:33.162Z**；实际入口T和后续首次真实同步分别记录，当前无Source请求/Worker启动。

最终恢复前系统盘34,606,243,840bytes，/data累计消耗上界17,600,933,888bytes，额外5GB预算涵盖最终PG/WAL/临时紧凑包/对象和新备份缓冲，仍满足root15GB低水位及任务60GB预算；不算旧资源可回收。紧凑包正传输到本机私密冻结恢复工具目录，正式目标仍空。1033308e发布守卫PASS（13页/68能力/40UI路径/errors[]），旧AI_HANDOFF缩写基线失败已前向修复保留原日志；182全回归不重复。原样Gate已[回链Issue](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7182147066)。


## 2026-11-26 13:43：未完成全部门禁，按固定窗口取消，原Staging恢复

本Gate baseline **84c1e08df8760e6c1bb6ce997951b6b1faecdc3d clean**。原Restore-Zhixu完成于 **04:09:48.585326Z**，包装工具执行346.781秒（04:04:01.810405Z开始，含SSH转运/门禁，不含前置精确空目标检查），全SHA及写入冻结证明PASS。新候选实际 **408,263,703bytes、147表、636单**，普通quote_trial角色仍缺；owner/ACL、实际全147表等价/权限、对象恢复、真实API/UI、完整新source备份尚未执行，不能宣称第三阶段PASS。

下一次时钟核实为 **05:41:21Z（北京时间13:41）**，已经超过原窗口13:37取消点。恢复回执至再次核时之间没有后续门禁或切换动作，原因未验证，不能把约91分钟间隔当成数据库执行时间。用户“继续”按原授权边界处理，不自动解释为延长固定窗口。依据已批准执行单“超时不擅自延长”、不能按时完成则开放新写前取消，执行原保全路径；没有压缩、跳过门禁或开启新写。

**05:42:11.210569Z（13:42:11）取消完成**，本次维护 **11,103.555338秒＝3小时5分3.56秒**。恢复原a0a9 app/原库/原对象、原LAN配置和专项sudo启动cloudflared。公网build-info=a0a9、LANhealth数据库ready独立验证，原五服务ID/image及policy全部精确匹配；原Supervisor再次BACKUP_WORKER_QUIET，原pause/fault保持。线上仍12,335,701,015bytes。每日备份保持原30 19 UTC，只走既有明确reviewed-paused-Worker备份路径；分钟Worker继续hold，其他cron块逐字节相同。

新正式PG及隔离PG按已冻结完整ID停止，全部数据库/卷/备份/原始副本/选择结果/秘密/失败均保留，未删除/退役。临时回环nginx预览随原配置还原移除；本机owned SSH仅在精确PID/start/forward匹配后停止，未知其他进程未碰。28个离散资源样本含末次人工点，最大观察文件系统净变化上界22,286,835,712bytes，root最低33,799,770,112bytes；04:03:55至05:42人工点之间存在采样缺口，**不声明连续峰值或独占任务计费**。

本次 **未完成切库，未取得新source配对备份，未进行新库真实应用验收**。新epoch03:51:33.162Z仅为保留候选内的转换时间，不是入口T或同步成功。Worker/清理继续关闭，PR不合并，Production/其他Staging不动。已请求用户确认另一个固定维护时间，原因仅是原批准窗口不能自行延长，v2范围不重审。原库已开放接受业务，下一窗口不得复用旧636单数据覆盖新写，必须重新取得最新一致配对/证明，并保全已有副本/候选；不盲重跑旧intent。


## 第二次窗口前准备（2026-11-26 14:30；尚未停站）

本Gate baseline a1b36ce85e64ac1bc40d166344f456f1e755c4b5 clean。用户已明确允许先以408.26MB候选隔离验收，通过后直接开新的3.5小时维护窗口，最新一致性备份/最终全验收/原回滚保持；授权[转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7184197510)。不用再次审批。产品仍fd84815d，不重新开发；PR172/173保全，Worker/清理/退役/合并/Production仍不授权。

桌面线程read_thread已确认上次执行turn 01a215ae-9762-72a2-a11c-dc962fca0066于04:10:14Z以usage limit失败，提示13:34可继续；下一用户继续turn05:40:55Z开始。原Restore04:09:48Z已结束；91分钟不是数据库恢复时间。新窗口须由独立作业推进/记录，服务器独立时钟与30分钟取消余量保护，不能仅依赖模型在线。

[隔离验收](evidence/issue174-phase3-20261126/preparatory-acceptance.json)：原候选147表/5序列/约束触发器函数owner全量一致；普通角色不拥有表、不提权、不绕过触发器，禁止删除正文；现有planner off保留；source CLI普通角色DB-only check通过且无来源请求。角色/元数据后实际408,345,623bytes，不是已上线容量。

原13附件在独立对象存储恢复，全部认证下载字节/SHA一致。正常TLS既有管理员登录/SecureHttpOnly，匿名401、11API200；8张实际页面截图，合同目录通过订单中心“全部合同 / 历史查阅”真实入口，不把无效路由当验收。历史起点与不完整提示可见；全部业务与引用保持，账号3/角色2/权限67及成员关系完整，仅正常启动/登录状态变化。其他角色未登录；全量权限关系和既有角色测试另验，不冒称全部人工业务操作验收。

已知原有问题：一个原始68字节PNG自身libpng解码失败；当前线上a0a9同一缩略图也503；13原文均下载/哈希完整，候选Linux缩略图编解码测试PASS。保留文件原样、不扩大范围修旧附件，失败记录保留，仅这个既有503作为明确限制。

正式再次迁移使用全新project zhixu-quote-trial-i174-v2b/container a0208196…/data卷/指纹a2e67a21c9594367fc01a94eb5fe38e3e6b4c0589c2d2effde4cece847588b39；空库0表/0clients/无运行角色。新隔离PG issue174-v2-pg-20261126b仅在独立内部网提供原CLI固定别名，未改白名单；旧候选和旧隔离库保留。私密新根/data/issue174-phase3-20261126b；root约33.72GB、data约915.27GB，60GB总工作预算包含旧尝试保留，root低水15GB。新服务专项sudo/固定root执行链/祖先不可写/仅Staging ingress/Tailscale22独立SSH再次验证。尚未开窗口，源仍正常开放；正式必须新配对，旧636快照不能代替。


### 第二次正式维护窗口已进入（14:40:56北京时间）

准备Gate **6edfe429aa585c82e653b37f504f6bb321771c63** DELIVERED_VERIFIED，PR176自动跟踪精确HEAD；[预验收Issue回执](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7184657908)。新执行Phase baseline同hash clean，应用仍fd。原冻结Restore检查新目标0表/0clients/普通role absent通过。

[窗口入口](evidence/issue174-phase3-20261126/second-window-entry.json)：**14:40:56.938636–18:10:56.938636**，取消余量从17:40:56.938636开始；新窗口不是原窗口延时。14:40:58公网Tunnel停止、LAN503、两owned cron块hold，现有Worker继续停止，原Supervisor正常最新一致性备份正在运行。Windows独立driver PID6444、服务器独立监控/每15秒时钟空间采样已运行，所有远端阶段有独立状态/锁/预算边界。此处仅入口确认，未把备份或切库写成PASS；所有旧资源保留。


### 第二次最新配对备份PASS，自动接续隔离恢复（15:04:45）

本Gate baseline c5cbe40a40c9c0ae505cbededf825c9ee14780ee clean/DELIVERED_VERIFIED。[新最新配对](evidence/issue174-phase3-20261126/second-fresh-backup.json) **20261126T064059Z-9fd043bd**，manifest **63a1901c6dfbfb7bcb9cf5b5eda475cbe69a0383f0fc30942b8d76d4ff053e6e**，06:40:59.774549–07:04:28.571259Z（23m28.797秒）；145表/13对象/58文件/3,843,034,087bytes。原Supervisor/原执行器正向完成、完整文件SHA/TOC+解码/首末全行快照、cleanup verified/commandsCertain/commandGroupsExited/dockerExecQuiescent/服务恢复门禁通过；保留全部历史failure。随后原lifecycle再冻结old writer，未开放候选写入。

07:06:55Z原冻结库实际 **12,335,701,015bytes/145表/0其他client**，用于本轮前后容量对比。新完整配对在/data第二物理磁盘复制全58文件SHA一致，16.470秒；仍同机不冒称offhost。90天尚未起算，必须等本次正式迁移验收成功，不退役任何旧库或备份。

独立driver07:04:45后自动进入新独立PG原样恢复，未因文档/交付暂停执行。07:06监控剩约185分钟、root29.87GB、含保留旧尝试的双文件系统净变化约31.17GB/60GB，未触发预算停止。后续原样/选择性/实际目标及应用全门禁仍待完成，不写切库PASS。


### 第二次原样恢复/全量门禁PASS（15:33），选择性迁移自动接续

本Gate baseline05bd0194656cd092279c1d6d8a190d7cdef4281c clean/DELIVERED_VERIFIED。[原样全量门禁](evidence/issue174-phase3-20261126/second-original-restore.json)：新latest原样恢复 **1153.971秒**（含第二磁盘副本16.470秒），原样库 **12,208,782,359bytes**；145表全部旧列/5序列/13对象与最新配对一致，517.257秒PASS。仅在新隔离库按已知安全NOLOGIN owner恢复145表及2个独立序列owner，没有拷贝旧运行角色superuser能力；没有修改旧业务库或备份。原636订单、8报价/8修订、13附件及13绑定、3账号、223,220操作日志已与新备份全量对应。

15:33:22独立driver自动开始选择/转换；15:35剩约155分钟，root29.86GB、双文件系统净变化43.94GB/60GB。没有开放候选新写，也没有暂停独立推进等待文档。

[预验收截图补充](evidence/issue174-phase3-20261126/preparatory-ui-follow-up.json)：后续视觉复核发现最初订单页仍是骨架、关账页仍在读取；前述API200/导航证据不代表这两页已完成数据渲染。原截图及失败保留，不冒称完全渲染PASS。最终目标浏览器脚本已收紧为实际SO行、12个月完整渲染/无关账读取错误后截图，所有额外API500仍拒绝，仅允许已在线上独立核实的原坏PNG缩略图503。最终目标还将在新source配对备份重新启动app后重验全部业务与三条业务编号/审核序列。无产品代码修改，正式验收未省略。
