# 当前状态：Issue174第三阶段维护中，原始备份已验证，隔离恢复中

2026-11-26；branch feat/issue174-storage-v2，起点7863d0aa3e53ccdca52f80a0c9a01f195d984816，应用候选 **fd84815dee273c0c65b4565961c8d4ffe3bfb764**，main10b9a7d827e1c09f152ead58c21f26712d49a619。产品代码未变化，PR172/173均保全，PR176保持Draft/未合并。

[用户补齐专项服务权限并要求直接续做](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7180928896)，此前阻塞已解决。root控制的unit/drop-in/executable/token及父路径、精确三项sudo、Staging-only Tunnel、独立SSH22均核实；停Tunnel后新SSH连接成功。无宿主权限绕过或共享网络/安全配置更改。

**维护窗口已开始**：北京时间10:37:07至14:07:07，13:37前保留30分钟取消余量，不重置窗口。公网Tunnel inactive，LAN独立新请求503，两owned cron块hold，其余字节保留，Worker停止。原配置/暂停/失败/cron与LAN原件保全。最新原始配对备份 **20261126T023837Z-14573686** 于10:38:37由原Supervisor/原executor/原锁启动，11:02:43完整PASS：145表/13对象/58文件，全量前后摘要、完整decode、文件hash、退出清理和服务恢复证明通过。随后旧app及objects重新冻结，只有旧PG运行；原始配对副本在/data第二物理磁盘逐文件核实，仍是同机副本。11:04:55开始隔离原样恢复，尚未选转/切库。

旧库维护前12,335,701,015 bytes、145表/max60/636单/13附件；schema inventory/工具/policy/quiet门禁通过。未改旧业务、尚未取得已验证紧凑迁移包、未执行选择转换或实际切库。旧服务正常恢复证明已完成，随即在外部hold下重新冻结。

候选app776effff…/operator6e0f4b2c…、build staging-i174-fd84815d已构建并验证；新空PG与internal隔离PG已按原ID正向启动。隔离重型工作/data约933GB/60GB预算；最终目标遵守标准卷门禁，root约38GB/15GB低水位，按本次最新选择结果重新预算。新TLS字节保留，普通非owner角色/实际目标指纹/业务引用/附件及新source备份仍待执行。

[实际执行日志](tasks/active/issue174-staging-phase3-execution-20261126.md)、[当前恢复点](AI_HANDOFF.md)、[维护入口证据](tasks/active/evidence/issue174-phase3-20261126/maintenance-entry.json)；私密根/data/issue174-phase3-20261126，所有真实dump/秘密/临时脚本不进Git。原始备份PASS后，当前原样隔离恢复/全量核实→选择转换/全部业务proof→compact→新PG/对象/普通角色→真实业务/权限/附件/UI→开写及新source备份，门禁不放宽。实际新库体积/停机总时长尚未形成。

182回归已182pass/0fail/0skip（约24.6分钟），不重跑；786文档Release/Team成功、Source cancelled，不能当三CI成功。应用fd完整三CI成功独立有效。[已接受前两阶段](tasks/active/issue174-v2-phase12-results.md)仍是旧635单演练，不冒充本次结果。

Worker恢复、清理启用、旧库/卷/备份退役、PR合并及Production仍禁止。开放新写前可取消，之后保全新增业务再v2恢复/前向修复，不退冻结旧库。90天从未来正式迁移验收成功起算；两轮自然同步/24h观察仍未执行。旧时点和原失败由Git/历史归档/执行日志保留，当前动态结果以Issue174最新回执为准。
