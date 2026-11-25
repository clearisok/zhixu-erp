# 接力：Issue174 v2第一、第二阶段实施中

2026-11-24；main基线 **10b9a7d827e1c09f152ead58c21f26712d49a619**。branch `feat/issue174-storage-v2`，工程起点`dee3d6800d718d67ac91494ec56c76b89ef11caf` clean。[D201](DECISION_LOG.md)与[用户批准转录](https://github.com/clearisok/zhixu-erp/issues/174#issuecomment-7127626591)授权统一工程＋隔离选择性迁移演练，无需再逐阶段问许可。

先读[实施恢复点](tasks/active/issue174-storage-implementation.md)、[v2](features/Issue174-精简整改决策方案-v2.md)与实际代码。仅两新表：正文、每日汇总/容量；复用目录/任务/FK，业务变化历史长期、无变化仅确认。原始页时间/hash与业务引用必须无损证明，未知hold；不清空FK/换UUID或重建正式业务绕过保护。

未批准实际Staging切换/删除/自动清理启用/Worker恢复/旧库或备份退役，禁止自动合并/Production；旧catalog_diagnostic_write_failed不自动恢复。仅允许新建隔离演练目标的数据筛选/迁移/清理，原备份只读。

原文档dee3的完整发布基线182/182通过，工程server:build及目录followup PG测试16/16通过；其他新存储/TTL/迁移/业务等价验证仍待完成。每个重要Gate独立commit与接力，不能把全部工程留在dirty。

D盘新建私有任务目录和Docker PG16.15独立network none容器；原配对备份58文件hash全部匹配、13对象；恢复进行中。60GB预算/约133GB初始可用。真实备份/原始业务不进Git；只提交脱敏测量和工具。原文档工作树d3f5不编辑，保护精确提交和历史证据。

Git一次批准交付结果LOCAL_PASS_REMOTE_UNVERIFIED/NETWORK_DEGRADED，API独立核对目标分支为空；不重复push、不改认证、不用文件API伪造提交。最终PR须先精确远端验证。最终本地候选发布门禁须重新绑定其HEAD，旧文档182通过不替代工程最终检查。

[实施前摘要原件](tasks/completed/2026-11-24-before-issue174-implementation/AI_HANDOFF.md)保留日期/hash/结果；阶段一/二完成后交简明实际容量、同负载增长/性能、保留放弃清单、业务附件完整性、磁盘/停机估算与恢复、PR/测试和阶段三一次性授权清单，不再扩写方案。

2026-11-25恢复点：原配对备份145表逐行SHA多重集合、原序列与13附件校验全部通过；恢复2963.09秒，完整行hash1699.29秒。隔离网络已改为专属internal，无网关/端口/源站凭据。选择2复制145表219.883秒，source_runs2076/73934、observations1458/73127；post-data FK恢复通过。外部archive UUID使用原配对操作证明，不伪造observation FK。普通queued/已知failed不保留该合同全部旧成功历史，精确任务/重试/引用仍保留；running/unknown整合同hold。全部新增和dirty均为本阶段自建，无继承dirty。

当前源代码包含0062–0067、受限NOLOGIN维护权限、默认清理关闭、可信失败解决CAS、真实业务颜色证据FK、历史epoch/事件类别和隔离选择/转换/核验工具。5个核心场景及新增选择条件单测通过；server:build/typecheck/lint通过一次，本候选最终全量门禁待收口。选择2目标尚未转换，先建旧格式负载基线副本；转换/compact/业务等价/增长性能/恢复仍未完成，禁止提前声明可切换。

2026-11-25 Gate恢复：选择2业务验证PASS（145旧表全部正式行及选中行原列SHA一致、原hash重建2076runs/2078snapshots/1458observations、5序列、原FK、清理关闭）；规范化dump/restore成功8.64秒+21.04秒，62,976,740-byte dump，维护函数owner保留。紧凑库406,182,935 bytes，原样库12,168,731,671；紧凑库再次145表/5序列/全部来源与1731目录proof验证PASS（326.918秒），13对象/58备份文件配对PASS。只操作自有隔离库。

Chromium桌面与390px合成会话9/9，状态起点/历史缺口/权限撤销/取消请求通过，截图在私有ui-evidence，不覆盖旧证据。针对v2旧格式断言/新列/提前失败保护校准后的41场景通过；完整catalog106中104通过，其余两项旧“无业务变化也换run”断言已按批准语义修正并单独通过，完整最终汇总待收口。typecheck/lint及Browser/Server两种build均通过；当前main基线guard前向追加D201与存储契约新Git证据后PASS。先前npm test使用旧证据清单失败，不能写为最终PASS；本checkpoint后重跑npm test和test:release-baseline。

同负载正在两个隔离bench克隆执行：旧精确dee3编译后端与新后端，5个较大真实备份合同、合成密码/离线录制响应，无网络，测量包含任务/校验/发布，源站延迟不包含；强制到期与排队仅fixture，不改真实频率。结果尚未完成，不宣称增长/性能改善。NETWORK_DEGRADED不重复push，远端PR仍未交付。
